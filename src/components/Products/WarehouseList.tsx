import React, { useEffect, useMemo, useState } from 'react';
import { InventoryItem, Product, ProductPackage, Order, Customer, ORDER_STATUSES, PAYMENT_STATUSES } from '../../types';
import { Database } from '../../utils/database';
import WarehouseForm from './WarehouseForm';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { exportToXlsx } from '../../utils/excel';
import { getSupabase } from '../../utils/supabaseClient';

const WarehouseList: React.FC = () => {
  const { state } = useAuth();
  const { notify } = useToast();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [filterProduct, setFilterProduct] = useState<string>('');
  const [filterPackage, setFilterPackage] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [confirmState, setConfirmState] = useState<null | { message: string; onConfirm: () => void }>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [profilesModal, setProfilesModal] = useState<null | { item: InventoryItem }>(null);
  const [viewingOrder, setViewingOrder] = useState<null | Order>(null);
  const [onlyAccounts, setOnlyAccounts] = useState(false);
  const [onlyFreeSlots, setOnlyFreeSlots] = useState(false);

  const refresh = async () => {
    const sb = getSupabase();
    if (!sb) return;
    // Optional sweep on client for local display of expired flags is no longer needed
    const [invRes, prodRes, pkgRes, custRes] = await Promise.all([
      sb.from('inventory').select('*').order('created_at', { ascending: true }),
      sb.from('products').select('*').order('created_at', { ascending: true }),
      sb.from('packages').select('*').order('created_at', { ascending: true }),
      sb.from('customers').select('*').order('created_at', { ascending: true })
    ]);
    const inv = (invRes.data || []).map((r: any) => ({
      id: r.id,
      code: r.code,
      productId: r.product_id,
      packageId: r.package_id,
      purchaseDate: r.purchase_date ? new Date(r.purchase_date) : new Date(),
      expiryDate: r.expiry_date ? new Date(r.expiry_date) : new Date(),
      sourceNote: r.source_note || '',
      purchasePrice: r.purchase_price,
      productInfo: r.product_info || '',
      notes: r.notes || '',
      status: r.status,
      isAccountBased: !!r.is_account_based,
      accountColumns: r.account_columns || [],
      accountData: r.account_data || {},
      totalSlots: r.total_slots || 0,
      profiles: Array.isArray(r.profiles) ? r.profiles : [],
      linkedOrderId: r.linked_order_id || undefined,
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
    })) as InventoryItem[];
    const prods = (prodRes.data || []) as Product[];
    const pkgs = (pkgRes.data || []) as ProductPackage[];
    const custs = (custRes.data || []) as Customer[];
    setItems(inv);
    setProducts(prods);
    setPackages(pkgs);
    setCustomers(custs);
  };

  useEffect(() => {
    refresh();
  }, []);

  // Realtime inventory subscribe
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const ch = sb
      .channel('realtime:inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        refresh();
      })
      .subscribe();
    return () => { try { ch.unsubscribe(); } catch {} };
  }, []);

  // Initialize from URL/localStorage
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q') || '';
      const prod = params.get('product') || '';
      const pkg = params.get('package') || '';
      const status = params.get('status') || '';
      const from = params.get('from') || '';
      const to = params.get('to') || '';
      const accounts = params.get('accounts') === '1';
      const free = params.get('free') === '1';
      const p = parseInt(params.get('page') || '1', 10);
      const l = parseInt((params.get('limit') || localStorage.getItem('warehouseList.limit') || '10'), 10);
      setSearchTerm(q);
      setDebouncedSearchTerm(q);
      setFilterProduct(prod);
      setFilterPackage(pkg);
      setFilterStatus(status);
      setDateFrom(from);
      setDateTo(to);
      setOnlyAccounts(accounts);
      setOnlyFreeSlots(free);
      setPage(!Number.isNaN(p) && p > 0 ? p : 1);
      if (!Number.isNaN(l) && l > 0) setLimit(l);
    } catch {}
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Reset page on filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchTerm, filterProduct, filterPackage, filterStatus, dateFrom, dateTo, onlyAccounts, onlyFreeSlots]);

  // Persist limit
  useEffect(() => {
    try { localStorage.setItem('warehouseList.limit', String(limit)); } catch {}
  }, [limit]);

  // Sync URL
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (debouncedSearchTerm) params.set('q', debouncedSearchTerm); else params.delete('q');
      if (filterProduct) params.set('product', filterProduct); else params.delete('product');
      if (filterPackage) params.set('package', filterPackage); else params.delete('package');
      if (filterStatus) params.set('status', filterStatus); else params.delete('status');
      if (dateFrom) params.set('from', dateFrom); else params.delete('from');
      if (dateTo) params.set('to', dateTo); else params.delete('to');
      params.set('accounts', onlyAccounts ? '1' : '0');
      params.set('free', onlyFreeSlots ? '1' : '0');
      params.set('page', String(page));
      params.set('limit', String(limit));
      const s = params.toString();
      const url = `${window.location.pathname}${s ? `?${s}` : ''}`;
      window.history.replaceState(null, '', url);
    } catch {}
  }, [debouncedSearchTerm, filterProduct, filterPackage, filterStatus, dateFrom, dateTo, onlyAccounts, onlyFreeSlots, page, limit]);

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p.name])), [products]);
  const packageMap = useMemo(() => new Map(packages.map(p => [p.id, p.name])), [packages]);
  const customerMap = useMemo(() => new Map(customers.map(c => [c.id, c.name])), [customers]);

  const getPackageInfo = (packageId: string) => {
    const pkg = packages.find(p => p.id === packageId);
    const product = pkg ? products.find(pr => pr.id === pkg.productId) : undefined;
    return { pkg, product } as { pkg?: ProductPackage; product?: Product };
  };

  const formatDate = (date: Date) => new Date(date).toLocaleDateString('vi-VN');
  const formatPrice = (price: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);

  const getStatusLabel = (status: any) => {
    return ORDER_STATUSES.find(s => s.value === status)?.label || status;
  };

  const getPaymentLabel = (value: any) => {
    return PAYMENT_STATUSES.find(p => p.value === value)?.label || 'Chưa thanh toán';
  };

  const buildFullOrderInfo = (order: Order): { lines: string[]; text: string } => {
    let baseLines = String((order as any).orderInfo || '')
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    const pkg = getPackageInfo(order.packageId).pkg;
    const custom = ((order as any).customFieldValues || {}) as Record<string, string>;
    if (pkg && Array.isArray(pkg.customFields) && pkg.customFields.length) {
      pkg.customFields.forEach(cf => {
        const val = custom[cf.id];
        if (val !== undefined && String(val).trim()) {
          baseLines.push(`${cf.title}: ${val}`);
        }
      });
    }
    // Filter out internal-only info
    baseLines = baseLines.filter(line => {
      const normalized = line.toLowerCase();
      if (normalized.startsWith('slot:')) return false;
      return true;
    });
    const text = baseLines.join('\n');
    return { lines: baseLines, text };
  };

  const filteredItems = useMemo(() => {
    const norm = debouncedSearchTerm.trim().toLowerCase();
    return items.filter(i => {
      const matchesSearch = !norm ||
        (i.code || '').toLowerCase().includes(norm) ||
        (productMap.get(i.productId) || '').toLowerCase().includes(norm) ||
        (packageMap.get(i.packageId) || '').toLowerCase().includes(norm) ||
        (i.productInfo || '').toLowerCase().includes(norm) ||
        (i.sourceNote || '').toLowerCase().includes(norm) ||
        (i.notes || '').toLowerCase().includes(norm);

      const matchesProduct = !filterProduct || i.productId === filterProduct;
      const matchesPackage = !filterPackage || i.packageId === filterPackage;
      const matchesStatus = !filterStatus || i.status === filterStatus as any;

      const pFromOk = !dateFrom || new Date(i.purchaseDate) >= new Date(dateFrom);
      const pToOk = !dateTo || new Date(i.purchaseDate) <= new Date(dateTo);

      const pkg = packages.find(p => p.id === i.packageId) as any;
      const isAcc = !!(i.isAccountBased || pkg?.isAccountBased);
      const hasFree = isAcc ? ((i.totalSlots || 0) - (i.profiles || []).filter(p => p.isAssigned).length) > 0 : false;
      const accountsOk = !onlyAccounts || isAcc;
      const freeOk = !onlyFreeSlots || hasFree;

      return matchesSearch && matchesProduct && matchesPackage && matchesStatus && pFromOk && pToOk && accountsOk && freeOk;
    });
  }, [items, filterProduct, filterPackage, filterStatus, searchTerm, dateFrom, dateTo, productMap, packageMap, onlyAccounts, onlyFreeSlots, packages]);

  const total = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;
  const pageItems = filteredItems.slice(start, start + limit);

  const exportInventoryXlsx = (items: InventoryItem[], filename: string) => {
    const rows = items.map((i, idx) => {
      const prodName = productMap.get(i.productId) || i.productId;
      const pkg = packages.find(p => p.id === i.packageId) as any;
      const pool = (() => {
        const prod = products.find(p => p.id === i.productId);
        return prod?.sharedInventoryPool ? 'Pool chung' : (packageMap.get(i.packageId) || i.packageId);
      })();
      const isAcc = (i.isAccountBased || pkg?.isAccountBased);
      const used = (i.profiles || []).filter(p => p.isAssigned).length;
      const totalSlots = i.totalSlots || 0;
      return {
        code: i.code || `KHO${idx + 1}`,
        product: prodName,
        group: pool,
        purchaseDate: new Date(i.purchaseDate).toISOString().split('T')[0],
        expiryDate: new Date(i.expiryDate).toISOString().split('T')[0],
        source: i.sourceNote || '',
        purchasePrice: typeof i.purchasePrice === 'number' ? i.purchasePrice : '',
        productInfo: i.productInfo || '',
        notes: i.notes || '',
        status: i.status,
        slots: isAcc ? `${used}/${totalSlots}` : '-'
      };
    });
    exportToXlsx(rows, [
      { header: 'Mã kho', key: 'code', width: 14 },
      { header: 'Sản phẩm', key: 'product', width: 24 },
      { header: 'Gói/Pool', key: 'group', width: 18 },
      { header: 'Nhập', key: 'purchaseDate', width: 12 },
      { header: 'Hết hạn', key: 'expiryDate', width: 12 },
      { header: 'Nguồn', key: 'source', width: 18 },
      { header: 'Giá nhập', key: 'purchasePrice', width: 14 },
      { header: 'Thông tin', key: 'productInfo', width: 50 },
      { header: 'Ghi chú', key: 'notes', width: 32 },
      { header: 'Trạng thái', key: 'status', width: 14 },
      { header: 'Slot', key: 'slots', width: 10 },
    ], filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, 'Kho hàng');
  };

  const toggleSelectAll = (checked: boolean, ids: string[]) => setSelectedIds(checked ? ids : []);
  const toggleSelect = (id: string, checked: boolean) => setSelectedIds(prev => checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id));
  const bulkDelete = () => {
    const deletable = pageItems.filter(i => i.status === 'AVAILABLE').map(i => i.id).filter(id => selectedIds.includes(id));
    if (deletable.length === 0) return;
    setConfirmState({
      message: `Xóa ${deletable.length} mục kho (chỉ mục Sẵn có)?`,
      onConfirm: async () => {
        const sb = getSupabase();
        if (!sb) return notify('Không thể xóa kho', 'error');
        const { error } = await sb.from('inventory').delete().in('id', deletable);
        if (!error) {
          // Update local storage immediately
          const currentInventory = Database.getInventory();
          Database.setInventory(currentInventory.filter(i => !deletable.includes(i.id)));
          
          // Force refresh form if it's open
          if (showForm && !editingItem) {
            setShowForm(false);
            setTimeout(() => {
              setShowForm(true);
            }, 100); // Add small delay to ensure local storage is updated
          }
          
          try {
            const sb2 = getSupabase();
            if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Xóa hàng loạt kho', details: `ids=${deletable.join(',')}` });
          } catch {}
          setSelectedIds([]);
          refresh();
          notify('Đã xóa mục kho đã chọn', 'success');
        } else {
          notify('Không thể xóa kho', 'error');
        }
      }
    });
  };
  const bulkUnlink = () => {
    const unlinkables = pageItems.filter(i => i.linkedOrderId).map(i => i.id).filter(id => selectedIds.includes(id));
    if (unlinkables.length === 0) return;
    setConfirmState({
      message: `Gỡ liên kết ${unlinkables.length} mục kho khỏi đơn?`,
      onConfirm: async () => {
        const sb = getSupabase();
        if (!sb) return notify('Không thể gỡ liên kết', 'error');
        for (const id of unlinkables) {
          const item = items.find(i => i.id === id);
          if (!item) continue;
          if (item.isAccountBased) {
            const nextProfiles = (item.profiles || []).map((p: any) => (
              p.assignedOrderId ? { ...p, isAssigned: false, assignedOrderId: null, assignedAt: null, expiryAt: null } : p
            ));
            await sb.from('inventory').update({ profiles: nextProfiles }).eq('id', id);
          } else {
            await sb.from('inventory').update({ status: 'AVAILABLE', linked_order_id: null }).eq('id', id);
          }
        }
        try {
          const sb2 = getSupabase();
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Gỡ liên kết kho hàng loạt', details: `ids=${unlinkables.join(',')}` });
        } catch {}
        setSelectedIds([]);
        refresh();
        notify('Đã gỡ liên kết các mục kho', 'success');
      }
    });
  };

  const remove = (id: string) => {
    setConfirmState({
      message: 'Xóa mục này khỏi kho?',
      onConfirm: async () => {
        const sb = getSupabase();
        if (!sb) return notify('Không thể xóa mục này khỏi kho', 'error');
        const snapshot = items.find(i => i.id === id) || null;
        const { error } = await sb.from('inventory').delete().eq('id', id);
        if (!error) {
          // Update local storage immediately
          const currentInventory = Database.getInventory();
          Database.setInventory(currentInventory.filter(i => i.id !== id));
          
          // Force refresh form if it's open
          if (showForm && !editingItem) {
            setShowForm(false);
            setTimeout(() => {
              setShowForm(true);
            }, 100); // Add small delay to ensure local storage is updated
          }
          
          try {
            const sb2 = getSupabase();
            if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Xóa khỏi kho', details: `inventoryItemId=${id}; productId=${snapshot?.productId || ''}; packageId=${snapshot?.packageId || ''}; productInfo=${snapshot?.productInfo || ''}` });
          } catch {}
          notify('Đã xóa khỏi kho', 'success');
        } else {
          notify('Không thể xóa mục này khỏi kho', 'error');
        }
        refresh();
      }
    });
  };

  const unlinkFromOrder = (id: string) => {
    const inv = items.find(i => i.id === id);
    if (!inv || !inv.linkedOrderId) return;
    setConfirmState({
      message: 'Gỡ liên kết khỏi đơn và đặt trạng thái Sẵn có?',
      onConfirm: async () => {
        const sb = getSupabase();
        if (!sb) return notify('Không thể gỡ liên kết khỏi đơn', 'error');
        if (inv.isAccountBased) {
          const nextProfiles = (inv.profiles || []).map((p: any) => (
            p.assignedOrderId === inv.linkedOrderId ? { ...p, isAssigned: false, assignedOrderId: null, assignedAt: null, expiryAt: null } : p
          ));
          await sb.from('inventory').update({ profiles: nextProfiles }).eq('id', id);
        } else {
          await sb.from('inventory').update({ status: 'AVAILABLE', linked_order_id: null }).eq('id', id);
        }
        try {
          const sb2 = getSupabase();
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Gỡ liên kết kho khỏi đơn', details: `inventoryId=${id}; orderId=${inv.linkedOrderId}` });
        } catch {}
        notify('Đã gỡ liên kết khỏi đơn và đặt trạng thái Sẵn có', 'success');
        refresh();
      }
    });
  };

  const statusLabel = (status: InventoryItem['status']) => {
    switch (status) {
      case 'AVAILABLE': return 'Sẵn có';
      case 'RESERVED': return 'Đã giữ';
      case 'SOLD': return 'Đã bán';
      case 'EXPIRED': return 'Hết hạn';
      default: return status;
    }
  };

  const statusBadge = (status: InventoryItem['status']) => {
    const cls = status === 'AVAILABLE'
      ? 'status-completed'
      : status === 'RESERVED'
      ? 'status-processing'
      : status === 'SOLD'
      ? 'status-completed'
      : 'status-cancelled';
    return <span className={`status-badge ${cls}`}>{statusLabel(status)}</span>;
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="d-flex justify-content-between align-items-center">
          <h2 className="card-title">Danh sách kho hàng</h2>
          <div className="d-flex gap-2">
            <button className="btn btn-light" onClick={() => exportInventoryXlsx(pageItems, 'inventory_page.xlsx')}>Xuất Excel (trang hiện tại)</button>
            <button className="btn btn-light" onClick={() => exportInventoryXlsx(filteredItems, 'inventory_filtered.xlsx')}>Xuất Excel (kết quả đã lọc)</button>
            {selectedIds.length > 0 && (
              <>
                <button className="btn btn-danger" onClick={bulkDelete}>Xóa đã chọn</button>
                <button className="btn btn-secondary" onClick={bulkUnlink}>Gỡ liên kết đã chọn</button>
              </>
            )}
            <button className="btn btn-primary" onClick={() => { 
              setEditingItem(null); 
              setShowForm(false); // Force close first
              setTimeout(() => {
                setShowForm(true); // Then open with fresh state
              }, 0);
            }}>Nhập kho</button>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <div>
            <input
              type="text"
              className="form-control"
              placeholder="Tìm kiếm mã, sản phẩm, ghi chú..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <select className="form-control" value={filterProduct} onChange={(e) => { setFilterProduct(e.target.value); setFilterPackage(''); }}>
              <option value="">Lọc theo sản phẩm</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <select className="form-control" value={filterPackage} onChange={(e) => setFilterPackage(e.target.value)} disabled={!filterProduct}>
              <option value="">Lọc theo gói</option>
              {packages.filter(pk => !filterProduct || pk.productId === filterProduct).map(pk => (
                <option key={pk.id} value={pk.id}>{pk.name}</option>
              ))}
            </select>
          </div>
          <div>
            <select className="form-control" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">Trạng thái</option>
              <option value="AVAILABLE">Sẵn có</option>
              <option value="RESERVED">Đã giữ</option>
              <option value="SOLD">Đã bán</option>
              <option value="EXPIRED">Hết hạn</option>
            </select>
          </div>
          <div>
            <input
              type="date"
              className="form-control"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="Từ ngày"
            />
          </div>
          <div>
            <input
              type="date"
              className="form-control"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="Đến ngày"
            />
          </div>
          <div>
            <select
              className="form-control"
              value={onlyAccounts ? '1' : '0'}
              onChange={(e) => setOnlyAccounts(e.target.value === '1')}
            >
              <option value="0">Tất cả tài khoản</option>
              <option value="1">Chỉ tài khoản nhiều slot</option>
            </select>
          </div>
          <div>
            <select
              className="form-control"
              value={onlyFreeSlots ? '1' : '0'}
              onChange={(e) => setOnlyFreeSlots(e.target.value === '1')}
            >
              <option value="0">Tất cả slot</option>
              <option value="1">Chỉ còn slot trống</option>
            </select>
          </div>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="text-center py-4">
          <p>Không có dữ liệu</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={pageItems.length > 0 && pageItems.every(i => selectedIds.includes(i.id))}
                    onChange={(e) => toggleSelectAll(e.target.checked, pageItems.map(i => i.id))}
                  />
                </th>
                <th>Mã kho</th>
                <th>Sản phẩm</th>
                <th>Gói / Pool</th>
                <th>Ngày nhập</th>
                <th>Hết hạn</th>
                <th>Nguồn</th>
                <th>Giá mua</th>
                <th>Thông tin</th>
                <th>Ghi chú</th>
                <th>Trạng thái</th>
                <th>Slot</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((i, index) => (
                <tr key={i.id}>
                  <td>
                    <input type="checkbox" checked={selectedIds.includes(i.id)} onChange={(e) => toggleSelect(i.id, e.target.checked)} />
                  </td>
                  <td>{i.code || `KHO${index + 1}`}</td>
                  <td>{productMap.get(i.productId) || i.productId}</td>
                  <td>{(() => {
                    const prod = products.find(p => p.id === i.productId);
                    if (prod?.sharedInventoryPool) {
                      return <span className="text-muted">Pool chung</span>;
                    }
                    return packageMap.get(i.packageId) || i.packageId;
                  })()}</td>
                  <td>{new Date(i.purchaseDate).toISOString().split('T')[0]}</td>
                  <td>{new Date(i.expiryDate).toISOString().split('T')[0]}</td>
                  <td>{i.sourceNote || '-'}</td>
                  <td>{i.purchasePrice ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(i.purchasePrice) : '-'}</td>
                  <td style={{ maxWidth: 260 }}>
                    <div className="line-clamp-3" title={i.productInfo || ''}>{i.productInfo || '-'}</div>
                  </td>
                  <td style={{ maxWidth: 200 }}>
                    <div className="line-clamp-2" title={i.notes || ''}>{i.notes || '-'}</div>
                  </td>
                  <td>{statusBadge(i.status)}</td>
                  <td>
                    {(i.isAccountBased || ((packages.find(p => p.id === i.packageId) || {}) as any).isAccountBased) ? (() => {
                      const used = (i.profiles || []).filter(p => p.isAssigned).length;
                      const total = i.totalSlots || 0;
                      return (
                        <button className="btn btn-sm btn-light" onClick={() => setProfilesModal({ item: i })}>
                          {used}/{total}
                        </button>
                      );
                    })() : '-'}
                  </td>
                  <td>
                    <div className="d-flex gap-2">
                      <button className="btn btn-sm btn-secondary" onClick={() => { setEditingItem(i); setShowForm(true); }}>Sửa</button>
                      {i.status === 'AVAILABLE' && (
                        <button className="btn btn-sm btn-danger" onClick={() => remove(i.id)}>Xóa</button>
                      )}
                      {i.status !== 'AVAILABLE' && i.linkedOrderId && (
                        <button className="btn btn-sm btn-secondary" onClick={() => unlinkFromOrder(i.id)}>Gỡ liên kết</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mt-3">
        <div>
          <select className="form-control" style={{ width: 100 }} value={limit} onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-light" disabled={currentPage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>«</button>
          <span>Trang {currentPage} / {totalPages}</span>
          <button className="btn btn-light" disabled={currentPage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>»</button>
        </div>
        <div>
          <span className="text-muted">Tổng: {total}</span>
        </div>
      </div>

      {showForm && (
        <WarehouseForm key={editingItem?.id || 'new'} item={editingItem} onClose={() => { setShowForm(false); setEditingItem(null); }} onSuccess={() => { setShowForm(false); setEditingItem(null); refresh(); }} />
      )}

      {profilesModal && (
        <div className="modal" role="dialog" aria-modal>
          <div className="modal-content" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">Slots - {profilesModal.item.code}</h3>
              <button className="close" onClick={() => setProfilesModal(null)}>×</button>
            </div>
            <div className="mb-3">
              {(() => {
                const item = items.find(x => x.id === profilesModal.item.id) || profilesModal.item;
                const profiles = item.profiles || [];
                if (!profiles.length) return <div className="text-muted">Không có slot</div>;
                return (
                  <div className="table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Slot</th>
                          <th>Trạng thái</th>
                          <th>Đơn hàng</th>
                          <th>Hết hạn</th>
                          <th>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profiles.map(p => {
                          const orderId = p.assignedOrderId;
                          const order = orderId ? Database.getOrders().find(o => o.id === orderId) : null;
                          return (
                            <tr key={p.id}>
                              <td>{p.label}</td>
                              <td>{p.isAssigned ? 'Đang dùng' : 'Trống'}</td>
                              <td>{order ? `${order.code}` : '-'}</td>
                              <td>{p.expiryAt ? new Date(p.expiryAt).toISOString().split('T')[0] : '-'}</td>
                              <td>
                                <div className="d-flex gap-2">
                                  {order && (
                                    <button className="btn btn-sm btn-light" onClick={() => { setProfilesModal(null); setViewingOrder(order); }}>
                                      Xem đơn hàng
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
            <div className="d-flex justify-content-end gap-2">
              <button className="btn btn-secondary" onClick={() => setProfilesModal(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {confirmState && (
        <div className="modal" role="dialog" aria-modal>
          <div className="modal-content" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">Xác nhận</h3>
              <button className="close" onClick={() => setConfirmState(null)}>×</button>
            </div>
            <div className="mb-4" style={{ color: 'var(--text-primary)' }}>{confirmState.message}</div>
            <div className="d-flex justify-content-end gap-2">
              <button className="btn btn-secondary" onClick={() => setConfirmState(null)}>Hủy</button>
              <button className="btn btn-danger" onClick={() => { const fn = confirmState.onConfirm; setConfirmState(null); fn(); }}>Xác nhận</button>
            </div>
          </div>
        </div>
      )}

      {viewingOrder && (
        <div className="modal" role="dialog" aria-modal>
          <div className="modal-content" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h3 className="modal-title">Chi tiết đơn hàng</h3>
              <button className="close" onClick={() => setViewingOrder(null)}>×</button>
            </div>
            <div className="mb-3">
              {(() => {
                const o = viewingOrder;
                const { pkg, product } = getPackageInfo(o.packageId);
                const customerName = customerMap.get(o.customerId) || 'Không xác định';
                const info = buildFullOrderInfo(o);
                return (
                  <div>
                    <div><strong>Khách hàng:</strong> {customerName}</div>
                    <div><strong>Sản phẩm:</strong> {product?.name || 'Không xác định'}</div>
                    <div><strong>Gói:</strong> {pkg?.name || 'Không xác định'}</div>
                    <div><strong>Ngày mua:</strong> {formatDate(o.purchaseDate)}</div>
                    <div><strong>Ngày hết hạn:</strong> {formatDate(o.expiryDate)}</div>
                    <div><strong>Trạng thái:</strong> {getStatusLabel(o.status)}</div>
                    <div><strong>Thanh toán:</strong> {getPaymentLabel((o as any).paymentStatus)}</div>
                    {info.lines.length > 0 && (
                      <div>
                        <strong>Thông tin đơn hàng:</strong>
                        <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{info.text}</pre>
                      </div>
                    )}
                    <div>
                      <strong>Kho hàng:</strong>{' '}
                      {(() => {
                        const inv = (() => {
                          if (o.inventoryItemId) {
                            const found = Database.getInventory().find(i => i.id === o.inventoryItemId);
                            if (found) {
                              if (found.linkedOrderId === o.id) return found;
                              if (found.isAccountBased && (found.profiles || []).some(p => p.assignedOrderId === o.id)) return found;
                            }
                          }
                          const byLinked = Database.getInventory().find(i => i.linkedOrderId === o.id);
                          if (byLinked) return byLinked;
                          return Database.getInventory().find(i => i.isAccountBased && (i.profiles || []).some(p => p.assignedOrderId === o.id));
                        })();
                        if (!inv) return 'Không liên kết';
                        const code = inv.code ?? '';
                        const pDate = new Date(inv.purchaseDate).toLocaleDateString('vi-VN');
                        const eDate = new Date(inv.expiryDate).toLocaleDateString('vi-VN');
                        const status = inv.status;
                        const statusLabel =
                          status === 'SOLD' ? 'Đã bán' :
                          status === 'AVAILABLE' ? 'Có sẵn' :
                          status === 'RESERVED' ? 'Đã giữ' :
                          status === 'EXPIRED' ? 'Hết hạn' : status;
                        const header = `${code || 'Không có'} | Nhập: ${pDate} | HSD: ${eDate} | ${statusLabel}`;
                        const extra: string[] = [];
                        if (inv.productInfo) extra.push(`| Thông tin sản phẩm: ${inv.productInfo}`);
                        if (inv.sourceNote) extra.push(`Nguồn: ${inv.sourceNote}`);
                        if (typeof inv.purchasePrice === 'number') extra.push(`| Giá nhập: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(inv.purchasePrice)}`);
                        return [header, ...extra].join(' \n ');
                      })()}
                    </div>
                    {o.notes && <div><strong>Ghi chú:</strong> {o.notes}</div>}
                    {(() => {
                      const list = Database.getWarrantiesByOrder(o.id);
                      return (
                        <div style={{ marginTop: '12px' }}>
                          <strong>Lịch sử bảo hành:</strong>
                          {list.length === 0 ? (
                            <div>Chưa có</div>
                          ) : (
                            <ul style={{ paddingLeft: '18px', marginTop: '6px' }}>
                              {list.map(w => (
                                <li key={w.id}>
                                  {new Date(w.createdAt).toLocaleDateString('vi-VN')} - {w.reason} ({w.status === 'DONE' ? 'đã xong' : 'chưa xong'})
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
            </div>
            <div className="d-flex justify-content-end gap-2">
              <button
                className="btn btn-light"
                onClick={async () => {
                  const o = viewingOrder;
                  const info = buildFullOrderInfo(o);
                  const linesForCopy = info.lines.flatMap((line, idx) => idx < info.lines.length - 1 ? [line, ''] : [line]);
                  const text = linesForCopy.join('\n');
                  try {
                    await navigator.clipboard.writeText(text);
                    notify('Đã copy thông tin đơn hàng', 'success');
                  } catch (e) {
                    notify('Không thể copy vào clipboard', 'error');
                  }
                }}
              >
                Copy thông tin
              </button>
              <button className="btn btn-secondary" onClick={() => setViewingOrder(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WarehouseList;


