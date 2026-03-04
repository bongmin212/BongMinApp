import React, { useState, useCallback } from 'react';
import { getSupabase } from '../../utils/supabaseClient';
import { IconRefresh, IconCheck, IconAlertTriangle } from '../Icons';

// ─── Types ──────────────────────────────────────────────────────────────────

type Severity = 'ERROR' | 'WARNING';

interface AuditRow {
    check_type: string;
    severity: Severity;
    entity_code: string;
    detail: string;
    extra?: string;
}

interface CheckSummary {
    id: string;
    label: string;
    description: string;
    severity: Severity;
    count: number;
    rows: AuditRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (val: unknown) => {
    if (val == null) return '—';
    if (typeof val === 'number')
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
    return String(val);
};

// ─── Main Component ──────────────────────────────────────────────────────────

const DataAudit: React.FC = () => {
    const [checks, setChecks] = useState<CheckSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [ran, setRan] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);

    const runAudit = useCallback(async () => {
        const sb = getSupabase();
        if (!sb) {
            setError('Không kết nối được Supabase.');
            return;
        }

        setLoading(true);
        setError(null);
        setRan(false);

        try {
            // ── Check 1: Orders PAID nhưng sale_price = 0 hoặc NULL ──────────────
            const { data: c1, error: e1 } = await sb
                .from('orders')
                .select('code, sale_price, payment_status, status, customer_id, package_id')
                .eq('payment_status', 'PAID')
                .neq('status', 'CANCELLED')
                .or('sale_price.is.null,sale_price.eq.0');

            // ── Check 2: Inventory SOLD nhưng không có order active liên kết ─────
            // Lưu ý: kho dạng multi-slot account lưu order IDs trong profiles[*].assignedOrderId
            // chứ không dùng linked_order_id → cần loại trừ các items đó khỏi check này
            const { data: c2Raw, error: e2 } = await sb
                .from('inventory')
                .select('code, status, linked_order_id, is_account_based, profiles')
                .eq('status', 'SOLD')
                .is('linked_order_id', null);

            // Lọc ra chỉ các items THỰC SỰ orphan:
            // - Không phải account-based multi-slot, HOẶC
            // - Là account-based nhưng không có slot nào được assigned
            const c2 = (c2Raw || []).filter((r: any) => {
                if (!r.is_account_based) return true; // non-slot item: check bình thường
                // Với multi-slot: kiểm tra nếu không có slot nào isAssigned = true
                const profiles = Array.isArray(r.profiles) ? r.profiles : [];
                const hasAssignedSlot = profiles.some((p: any) => p.isAssigned === true && p.assignedOrderId);
                return !hasAssignedSlot; // chỉ báo lỗi nếu không có slot nào assigned
            });


            // ── Check 3: Orders có inventory_item_id nhưng inventory không tồn tại ─
            // Dùng LEFT JOIN qua select với .not('inventory_item_id', 'is', null)
            // Sau đó lọc phía client (Supabase không hỗ trợ NOT EXISTS trực tiếp)
            const { data: ordersWithInv, error: e3a } = await sb
                .from('orders')
                .select('id, code, inventory_item_id, status, payment_status')
                .not('inventory_item_id', 'is', null)
                .neq('status', 'CANCELLED');

            const { data: inventoryIds, error: e3b } = await sb
                .from('inventory')
                .select('id');

            const invIdSet = new Set((inventoryIds || []).map((i: any) => i.id));
            const c3 = (ordersWithInv || []).filter(
                (o: any) => o.inventory_item_id && !invIdSet.has(o.inventory_item_id)
            );

            // ── Check 4: Orders PAID + có inventory_item_id nhưng COGS = 0 / NULL ─
            // Chỉ báo lỗi khi kho liên kết có purchase_price > 0 (tức là hàng có giá nhập thật)
            // Nếu giá nhập kho = 0đ thì cogs = 0 là ĐÚNG, không phải lỗi
            const { data: c4Raw, error: e4 } = await sb
                .from('orders')
                .select('id, code, sale_price, cogs, status, inventory_item_id')
                .eq('payment_status', 'PAID')
                .neq('status', 'CANCELLED')
                .not('inventory_item_id', 'is', null)
                .or('cogs.is.null,cogs.eq.0');

            // Lấy purchase_price của các inventory items liên quan
            const c4InvIds = Array.from(new Set((c4Raw || []).map((o: any) => o.inventory_item_id).filter(Boolean)));
            let invPriceMap: Record<string, number> = {};
            if (c4InvIds.length > 0) {
                const { data: invPrices } = await sb
                    .from('inventory')
                    .select('id, purchase_price')
                    .in('id', c4InvIds);
                (invPrices || []).forEach((i: any) => {
                    invPriceMap[i.id] = i.purchase_price || 0;
                });
            }

            // Chỉ báo lỗi nếu kho liên kết có purchase_price > 0 nhưng cogs = 0
            const c4 = (c4Raw || []).filter((o: any) => {
                const purchasePrice = invPriceMap[o.inventory_item_id] ?? 0;
                return purchasePrice > 0; // nếu free (purchase_price=0) thì không phải lỗi
            });



            if (e1 || e2 || e3a || e3b || e4) {
                setError('Lỗi khi truy vấn dữ liệu. Vui lòng thử lại.');
                return;
            }

            // ── Build CheckSummary list ──────────────────────────────────────────
            const results: CheckSummary[] = [
                {
                    id: 'sale-price-zero',
                    label: 'Giá bán = 0 trên đơn đã thanh toán',
                    description: 'Đơn PAID nhưng sale_price = 0 hoặc NULL → doanh thu bị sai lệch',
                    severity: 'ERROR',
                    count: (c1 || []).length,
                    rows: (c1 || []).map((r: any) => ({
                        check_type: 'SALE_PRICE_ZERO',
                        severity: 'ERROR',
                        entity_code: r.code,
                        detail: `Trạng thái: ${r.status}`,
                        extra: `sale_price = ${fmt(r.sale_price)}`,
                    })),
                },
                {
                    id: 'inventory-sold-orphan',
                    label: 'Kho SOLD không có đơn hàng liên kết',
                    description: 'Inventory status = SOLD nhưng linked_order_id = NULL → dữ liệu kho mâu thuẫn',
                    severity: 'ERROR',
                    count: (c2 || []).length,
                    rows: (c2 || []).map((r: any) => ({
                        check_type: 'INV_SOLD_ORPHAN',
                        severity: 'ERROR',
                        entity_code: r.code,
                        detail: `Status kho: ${r.status}`,
                        extra: 'linked_order_id = NULL',
                    })),
                },
                {
                    id: 'orphan-inventory-ref',
                    label: 'Đơn hàng trỏ tới kho không tồn tại',
                    description: 'inventory_item_id trên order không khớp với bất kỳ item nào trong kho',
                    severity: 'ERROR',
                    count: c3.length,
                    rows: c3.map((r: any) => ({
                        check_type: 'ORPHAN_INV_REF',
                        severity: 'ERROR',
                        entity_code: r.code,
                        detail: `Trạng thái đơn: ${r.status} | TT TT: ${r.payment_status}`,
                        extra: `inventory_item_id: ${r.inventory_item_id}`,
                    })),
                },
                {
                    id: 'cogs-missing',
                    label: 'COGS bị thiếu trên đơn đã thanh toán',
                    description: 'Đơn PAID có kho liên kết nhưng cogs = 0 hoặc NULL → lợi nhuận bị tính sai',
                    severity: 'WARNING',
                    count: (c4 || []).length,
                    rows: (c4 || []).map((r: any) => ({
                        check_type: 'COGS_MISSING',
                        severity: 'WARNING',
                        entity_code: r.code,
                        detail: `sale_price = ${fmt(r.sale_price)}`,
                        extra: `cogs = ${fmt(r.cogs)}`,
                    })),
                },
            ];

            setChecks(results);
            setRan(true);
        } catch (err) {
            setError('Lỗi không xác định. Vui lòng thử lại.');
        } finally {
            setLoading(false);
        }
    }, []);

    const totalErrors = checks.filter(c => c.severity === 'ERROR').reduce((s, c) => s + c.count, 0);
    const totalWarnings = checks.filter(c => c.severity === 'WARNING').reduce((s, c) => s + c.count, 0);
    const allClean = ran && totalErrors === 0 && totalWarnings === 0;

    const exportCSV = () => {
        const allRows: AuditRow[] = checks.flatMap(c => c.rows);
        if (allRows.length === 0) return;

        const header = ['Loại kiểm tra', 'Mức độ', 'Mã', 'Chi tiết', 'Thông tin thêm'];
        const rows = allRows.map(r => [r.check_type, r.severity, r.entity_code, r.detail, r.extra || '']);
        const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
        const bom = '\uFEFF';
        const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `data-audit-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="data-audit">
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="audit-header">
                <div className="audit-header-left">
                    <h2 className="audit-title">Data Audit — Đối soát Dữ liệu</h2>
                    <p className="audit-subtitle">
                        Kiểm tra tính toàn vẹn giữa bảng <code>orders</code> và{' '}
                        <code>inventory</code>. Phát hiện các mâu thuẫn ảnh hưởng đến doanh thu &amp; profit.
                    </p>
                </div>
                <div className="audit-header-actions">
                    {ran && (
                        <button className="btn btn-secondary btn-sm" onClick={exportCSV} disabled={!ran || checks.every(c => c.count === 0)}>
                            ↓ Export CSV
                        </button>
                    )}
                    <button
                        className="btn btn-primary"
                        onClick={runAudit}
                        disabled={loading}
                        id="btn-run-audit"
                    >
                        <IconRefresh size={15} />
                        {loading ? 'Đang kiểm tra...' : ran ? 'Chạy lại' : 'Chạy kiểm tra'}
                    </button>
                </div>
            </div>

            {/* ── Error ──────────────────────────────────────────────────── */}
            {error && (
                <div className="audit-alert audit-alert--error">
                    <IconAlertTriangle size={16} /> {error}
                </div>
            )}

            {/* ── All-clean banner ───────────────────────────────────────── */}
            {allClean && (
                <div className="audit-clean-banner">
                    <IconCheck size={20} />
                    <span>Tất cả kiểm tra đều OK — Dữ liệu toàn vẹn!</span>
                </div>
            )}

            {/* ── Summary cards ──────────────────────────────────────────── */}
            {ran && !allClean && (
                <div className="audit-summary-bar">
                    <div className="audit-summary-pill audit-pill--error">
                        <span className="pill-count">{totalErrors}</span>
                        <span className="pill-label">Lỗi nghiêm trọng</span>
                    </div>
                    <div className="audit-summary-pill audit-pill--warning">
                        <span className="pill-count">{totalWarnings}</span>
                        <span className="pill-label">Cảnh báo</span>
                    </div>
                </div>
            )}

            {/* ── Check cards ────────────────────────────────────────────── */}
            {ran && (
                <div className="audit-checks">
                    {checks.map(check => {
                        const isOpen = expanded === check.id;
                        const hasIssues = check.count > 0;
                        return (
                            <div
                                key={check.id}
                                className={`audit-check-card ${hasIssues ? (check.severity === 'ERROR' ? 'audit-check--error' : 'audit-check--warning') : 'audit-check--ok'}`}
                            >
                                {/* Card header */}
                                <button
                                    className="audit-check-header"
                                    onClick={() => setExpanded(isOpen ? null : check.id)}
                                    aria-expanded={isOpen}
                                    id={`audit-check-${check.id}`}
                                >
                                    <div className="audit-check-header-left">
                                        <span className={`audit-badge ${hasIssues ? (check.severity === 'ERROR' ? 'badge--error' : 'badge--warning') : 'badge--ok'}`}>
                                            {hasIssues ? check.severity : 'OK'}
                                        </span>
                                        <div>
                                            <div className="audit-check-label">{check.label}</div>
                                            <div className="audit-check-desc">{check.description}</div>
                                        </div>
                                    </div>
                                    <div className="audit-check-header-right">
                                        {hasIssues && (
                                            <span className="audit-count">{check.count} vấn đề</span>
                                        )}
                                        {hasIssues && (
                                            <span className="audit-chevron">{isOpen ? '▲' : '▼'}</span>
                                        )}
                                    </div>
                                </button>

                                {/* Detail table */}
                                {isOpen && hasIssues && (
                                    <div className="audit-table-wrap">
                                        <table className="audit-table">
                                            <thead>
                                                <tr>
                                                    <th>Mã</th>
                                                    <th>Chi tiết</th>
                                                    <th>Thông tin thêm</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {check.rows.map((row, i) => (
                                                    <tr key={i} className={row.severity === 'ERROR' ? 'row--error' : 'row--warning'}>
                                                        <td><code>{row.entity_code}</code></td>
                                                        <td>{row.detail}</td>
                                                        <td>{row.extra || '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Empty state ────────────────────────────────────────────── */}
            {!ran && !loading && (
                <div className="audit-empty">
                    <div className="audit-empty-icon">🔍</div>
                    <p>Nhấn <strong>"Chạy kiểm tra"</strong> để bắt đầu đối soát dữ liệu.</p>
                    <p className="audit-empty-hint">
                        Hệ thống sẽ kiểm tra <strong>4 loại mâu thuẫn</strong> phổ biến giữa bảng đơn hàng và kho hàng.
                    </p>
                </div>
            )}

            {loading && (
                <div className="audit-loading">
                    <div className="spinner" />
                    <span>Đang phân tích dữ liệu...</span>
                </div>
            )}
        </div>
    );
};

export default DataAudit;
