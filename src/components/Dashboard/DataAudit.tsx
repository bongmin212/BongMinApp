import React, { useState, useCallback } from 'react';
import { getSupabase } from '../../utils/supabaseClient';
import { IconRefresh, IconCheck, IconAlertTriangle } from '../Icons';

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

interface RenewalLike {
    id?: string;
    price?: number | null;
    createdAt?: string | null;
    paymentStatus?: string | null;
    previousExpiryDate?: string | null;
    newExpiryDate?: string | null;
}

const fmt = (val: unknown) => {
    if (val == null) return '—';
    if (typeof val === 'number') {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
    }
    return String(val);
};

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
            const parseRenewals = (value: unknown): RenewalLike[] => (
                Array.isArray(value) ? value as RenewalLike[] : []
            );

            const { data: c1, error: e1 } = await sb
                .from('orders')
                .select('code, sale_price, payment_status, status, customer_id, package_id, renewals')
                .eq('payment_status', 'PAID')
                .neq('status', 'CANCELLED')
                .or('sale_price.is.null,sale_price.eq.0');

            const { data: c2Raw, error: e2 } = await sb
                .from('inventory')
                .select('code, status, linked_order_id, is_account_based, profiles')
                .eq('status', 'SOLD')
                .is('linked_order_id', null);

            const c2 = (c2Raw || []).filter((r: any) => {
                if (!r.is_account_based) return true;
                const profiles = Array.isArray(r.profiles) ? r.profiles : [];
                const hasAssignedSlot = profiles.some((p: any) => p.isAssigned === true && p.assignedOrderId);
                return !hasAssignedSlot;
            });

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

            const { data: c4Raw, error: e4 } = await sb
                .from('orders')
                .select('id, code, sale_price, cogs, status, inventory_item_id')
                .eq('payment_status', 'PAID')
                .neq('status', 'CANCELLED')
                .not('inventory_item_id', 'is', null)
                .or('cogs.is.null,cogs.eq.0');

            const c4InvIds = Array.from(new Set((c4Raw || []).map((o: any) => o.inventory_item_id).filter(Boolean)));
            const invPriceMap: Record<string, number> = {};
            if (c4InvIds.length > 0) {
                const { data: invPrices } = await sb
                    .from('inventory')
                    .select('id, purchase_price')
                    .in('id', c4InvIds);
                (invPrices || []).forEach((i: any) => {
                    invPriceMap[i.id] = i.purchase_price || 0;
                });
            }

            const c4 = (c4Raw || []).filter((o: any) => {
                const purchasePrice = invPriceMap[o.inventory_item_id] ?? 0;
                return purchasePrice > 0;
            });

            const { data: ordersWithRenewals, error: e5 } = await sb
                .from('orders')
                .select('code, status, sale_price, renewals')
                .neq('status', 'CANCELLED');

            const { error: originalSalePriceError } = await sb
                .from('orders')
                .select('original_sale_price')
                .limit(1);

            const c5 = originalSalePriceError
                ? [{ message: originalSalePriceError.message }]
                : [];

            const c6 = (ordersWithRenewals || []).flatMap((o: any) =>
                parseRenewals(o.renewals)
                    .filter((r: RenewalLike) => {
                        const price = Number(r.price || 0);
                        const paymentStatus = String(r.paymentStatus || '');
                        return (paymentStatus === 'PAID' && !(price > 0)) ||
                            (paymentStatus === 'UNPAID' && price < 0) ||
                            !['PAID', 'UNPAID', 'REFUNDED'].includes(paymentStatus);
                    })
                    .map((r: RenewalLike) => ({
                        orderCode: o.code,
                        renewalId: r.id,
                        paymentStatus: r.paymentStatus,
                        price: r.price
                    }))
            );

            const c7 = (ordersWithRenewals || []).flatMap((o: any) =>
                parseRenewals(o.renewals)
                    .filter((r: RenewalLike) => {
                        const createdAt = r.createdAt ? new Date(r.createdAt) : null;
                        const previousExpiryDate = r.previousExpiryDate ? new Date(r.previousExpiryDate) : null;
                        const newExpiryDate = r.newExpiryDate ? new Date(r.newExpiryDate) : null;
                        if (!createdAt || Number.isNaN(createdAt.getTime())) return true;
                        if (!previousExpiryDate || Number.isNaN(previousExpiryDate.getTime())) return true;
                        if (!newExpiryDate || Number.isNaN(newExpiryDate.getTime())) return true;
                        return newExpiryDate.getTime() < previousExpiryDate.getTime();
                    })
                    .map((r: RenewalLike) => ({
                        orderCode: o.code,
                        renewalId: r.id,
                        createdAt: r.createdAt,
                        previousExpiryDate: r.previousExpiryDate,
                        newExpiryDate: r.newExpiryDate
                    }))
            );

            if (e1 || e2 || e3a || e3b || e4 || e5) {
                setError('Lỗi khi truy vấn dữ liệu. Vui lòng thử lại.');
                return;
            }

            const results: CheckSummary[] = [
                {
                    id: 'sale-price-zero',
                    label: 'Giá bán = 0 trên đơn đã thanh toán',
                    description: 'Đơn PAID nhưng sale_price = 0 hoặc NULL, làm lệch báo cáo doanh thu.',
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
                    description: 'Inventory đã SOLD nhưng không còn liên kết hợp lệ với order hoặc slot đang gán.',
                    severity: 'ERROR',
                    count: c2.length,
                    rows: c2.map((r: any) => ({
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
                    description: 'inventory_item_id trên order không khớp với bất kỳ item nào trong kho.',
                    severity: 'ERROR',
                    count: c3.length,
                    rows: c3.map((r: any) => ({
                        check_type: 'ORPHAN_INV_REF',
                        severity: 'ERROR',
                        entity_code: r.code,
                        detail: `Trạng thái đơn: ${r.status} | Thanh toán: ${r.payment_status}`,
                        extra: `inventory_item_id: ${r.inventory_item_id}`,
                    })),
                },
                {
                    id: 'cogs-missing',
                    label: 'COGS bị thiếu trên đơn đã thanh toán',
                    description: 'Đơn PAID có kho liên kết nhưng cogs = 0 hoặc NULL, làm lệch profit.',
                    severity: 'WARNING',
                    count: c4.length,
                    rows: c4.map((r: any) => ({
                        check_type: 'COGS_MISSING',
                        severity: 'WARNING',
                        entity_code: r.code,
                        detail: `sale_price = ${fmt(r.sale_price)}`,
                        extra: `cogs = ${fmt(r.cogs)}`,
                    })),
                },
                {
                    id: 'original-sale-price-missing',
                    label: 'Thiếu hỗ trợ giá gốc đơn hàng',
                    description: 'Schema hiện tại chưa có original_sale_price nên dashboard không thể đối soát chính xác doanh thu mua ban đầu của đơn đã gia hạn.',
                    severity: 'ERROR',
                    count: c5.length,
                    rows: c5.map((r: any) => ({
                        check_type: 'ORIGINAL_SALE_PRICE_UNAVAILABLE',
                        severity: 'ERROR',
                        entity_code: 'orders',
                        detail: 'Thiếu cột original_sale_price trong Supabase',
                        extra: r.message,
                    })),
                },
                {
                    id: 'renewal-price-invalid',
                    label: 'Gia hạn có giá hoặc trạng thái sai',
                    description: 'Renewal PAID nhưng price <= 0, hoặc payment_status không hợp lệ.',
                    severity: 'ERROR',
                    count: c6.length,
                    rows: c6.map((r: any) => ({
                        check_type: 'RENEWAL_PRICE_INVALID',
                        severity: 'ERROR',
                        entity_code: r.orderCode,
                        detail: `renewal_id: ${r.renewalId || '—'} | payment_status: ${r.paymentStatus || '—'}`,
                        extra: `price = ${fmt(r.price)}`,
                    })),
                },
                {
                    id: 'renewal-dates-invalid',
                    label: 'Gia hạn có ngày không hợp lệ',
                    description: 'Renewal thiếu ngày hoặc newExpiryDate sớm hơn previousExpiryDate.',
                    severity: 'WARNING',
                    count: c7.length,
                    rows: c7.map((r: any) => ({
                        check_type: 'RENEWAL_DATES_INVALID',
                        severity: 'WARNING',
                        entity_code: r.orderCode,
                        detail: `renewal_id: ${r.renewalId || '—'}`,
                        extra: `from ${r.previousExpiryDate || '—'} -> ${r.newExpiryDate || '—'} | createdAt: ${r.createdAt || '—'}`,
                    })),
                },
            ];

            setChecks(results);
            setRan(true);
        } catch {
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
            <div className="audit-header">
                <div className="audit-header-left">
                    <h2 className="audit-title">Data Audit - Đối soát dữ liệu</h2>
                    <p className="audit-subtitle">
                        Kiểm tra tính toàn vẹn giữa <code>orders</code>, <code>renewals</code> và <code>inventory</code>
                        để đối chiếu doanh thu, backlog và profit.
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

            {error && (
                <div className="audit-alert audit-alert--error">
                    <IconAlertTriangle size={16} /> {error}
                </div>
            )}

            {allClean && (
                <div className="audit-clean-banner">
                    <IconCheck size={20} />
                    <span>Tất cả kiểm tra đều OK - dữ liệu nhất quán.</span>
                </div>
            )}

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

            {!ran && !loading && (
                <div className="audit-empty">
                    <div className="audit-empty-icon">Kiem tra</div>
                    <p>Nhấn <strong>"Chạy kiểm tra"</strong> để bắt đầu đối soát dữ liệu.</p>
                    <p className="audit-empty-hint">
                        Hệ thống sẽ kiểm tra các lỗi phổ biến của order, inventory và renewal ảnh hưởng trực tiếp đến dashboard.
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
