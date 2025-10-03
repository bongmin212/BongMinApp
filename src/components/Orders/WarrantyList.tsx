import React, { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../utils/supabaseClient';
import { Database } from '../../utils/database';
import { Customer, Order, Product, ProductPackage, Warranty, WarrantyFormData, WARRANTY_STATUSES, InventoryItem } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { exportToXlsx } from '../../utils/excel';

const WarrantyForm: React.FC<{ onClose: () => void; onSuccess: () => void; warranty?: Warranty }> = ({ onClose, onSuccess, warranty }) => {
  const { state } = useAuth();
  const { notify } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
	const [form, setForm] = useState<WarrantyFormData>({ code: '', orderId: '', reason: '', status: 'PENDING' });

	useEffect(() => {
    setOrders(Database.getOrders());
    setCustomers(Database.getCustomers());
    setPackages(Database.getPackages());
    setProducts(Database.getProducts());
    setInventoryItems(Database.getInventory());
	}, []);

	useEffect(() => {
		if (warranty) {
			setForm({ 
        code: warranty.code, 
        orderId: warranty.orderId, 
        reason: warranty.reason, 
        status: warranty.status,
        replacementInventoryId: warranty.replacementInventoryId,
        newOrderInfo: warranty.newOrderInfo
      });
		}
	}, [warranty]);

  const getOrderLabel = (o: Order) => {
    const customer = customers.find(c => c.id === o.customerId)?.name || 'Không xác định';
    const pkg = packages.find(p => p.id === o.packageId);
    const product = products.find(p => p?.id === pkg?.productId)?.name || '';
    return `${customer} - ${product} / ${pkg?.name || ''} - ${new Date(o.purchaseDate).toLocaleDateString('vi-VN')}`;
  };

  const getInventoryLabel = (item: InventoryItem) => {
    const product = products.find(p => p.id === item.productId)?.name || '';
    const pkg = packages.find(p => p.id === item.packageId)?.name || '';
    return `${product} / ${pkg} - ${item.productInfo || 'Không có thông tin'}`;
  };

  const availableInventoryItems = inventoryItems.filter(item => item.status === 'AVAILABLE');

	const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.orderId || !form.reason.trim()) {
      notify('Vui lòng nhập mã bảo hành, chọn đơn hàng và nhập lý do.', 'warning');
      return;
    }
		try {
			if (warranty) {
				const prevSnapshot = {
					code: warranty.code || '',
					orderId: warranty.orderId,
					reason: warranty.reason,
					status: warranty.status,
					replacementInventoryId: warranty.replacementInventoryId,
					newOrderInfo: warranty.newOrderInfo
				} as const;
				const nextSnapshot = {
					code: form.code,
					orderId: form.orderId,
					reason: form.reason.trim(),
					status: form.status,
					replacementInventoryId: form.replacementInventoryId,
					newOrderInfo: form.newOrderInfo
				} as const;
				const changedEntries: string[] = [];
				(Object.keys(prevSnapshot) as Array<keyof typeof prevSnapshot>).forEach((key) => {
					const beforeVal = String(prevSnapshot[key] ?? '');
					const afterVal = String(nextSnapshot[key] ?? '');
					if (beforeVal !== afterVal) {
						changedEntries.push(`${key}=${beforeVal}->${afterVal}`);
					}
				});
				Database.updateWarranty(warranty.id, nextSnapshot);
				try {
					const sb2 = getSupabase();
					if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Cập nhật đơn bảo hành', details: [`warrantyId=${warranty.id}; warrantyCode=${warranty.code}`, ...changedEntries].join('; ') });
				} catch {}
				notify('Cập nhật đơn bảo hành thành công', 'success');
			} else {
				const created = Database.saveWarranty({
					code: form.code,
					orderId: form.orderId,
					reason: form.reason.trim(),
					status: form.status,
					createdBy: state.user?.id || 'system',
					replacementInventoryId: form.replacementInventoryId,
					newOrderInfo: form.newOrderInfo
				});
				try {
					const sb2 = getSupabase();
					if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Tạo đơn bảo hành', details: `warrantyId=${created.id}; warrantyCode=${created.code}; orderId=${created.orderId}; status=${created.status}` });
				} catch {}
				notify('Tạo đơn bảo hành thành công', 'success');
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Có lỗi xảy ra khi lưu bảo hành';
			notify(errorMessage, 'error');
			return;
		}
    onSuccess();
    onClose();
  };

  return (
    <div className="modal">
      <div className="modal-content" style={{ maxWidth: '560px' }}>
        <div className="modal-header">
			<h3 className="modal-title">{warranty ? 'Sửa đơn bảo hành' : 'Tạo đơn bảo hành'}</h3>
          <button type="button" className="close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Mã bảo hành *</label>
            <input className="form-control" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Nhập mã bảo hành (ví dụ: BH001)" required />
          </div>
          <div className="mb-3">
			<label className="form-label">Ngày tạo</label>
			<input className="form-control" value={(warranty ? new Date(warranty.createdAt) : new Date()).toLocaleDateString('vi-VN')} disabled />
          </div>
          <div className="mb-3">
			<label className="form-label">Chọn đơn hàng *</label>
			<select className="form-control" value={form.orderId} onChange={e => setForm({ ...form, orderId: e.target.value })} required>
              <option value="">-- Chọn đơn hàng --</option>
              {orders.map(o => (
                <option key={o.id} value={o.id}>{getOrderLabel(o)}</option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label">Lý do bảo hành *</label>
            <textarea className="form-control" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} required />
          </div>
          <div className="mb-3">
            <label className="form-label">Trạng thái</label>
            <select className="form-control" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}>
              {WARRANTY_STATUSES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label">Sản phẩm thay thế (tùy chọn)</label>
            <select className="form-control" value={form.replacementInventoryId || ''} onChange={e => setForm({ ...form, replacementInventoryId: e.target.value || undefined })}>
              <option value="">-- Chọn sản phẩm từ kho hàng --</option>
              {availableInventoryItems.map(item => (
                <option key={item.id} value={item.id}>{getInventoryLabel(item)}</option>
              ))}
            </select>
            <small className="form-text text-muted">Chọn sản phẩm từ kho hàng để thay thế sản phẩm cũ</small>
          </div>
          <div className="mb-3">
            <label className="form-label">Thông tin đơn hàng mới (tùy chọn)</label>
            <textarea 
              className="form-control" 
              value={form.newOrderInfo || ''} 
              onChange={e => setForm({ ...form, newOrderInfo: e.target.value || undefined })} 
              placeholder="Nhập thông tin đơn hàng mới (serial/key/tài khoản...)"
              rows={3}
            />
            <small className="form-text text-muted">Thông tin chi tiết về đơn hàng mới nếu có</small>
          </div>
          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
			<button type="submit" className="btn btn-primary">Lưu</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const WarrantyList: React.FC = () => {
  const { state } = useAuth();
  const { notify } = useToast();
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [showForm, setShowForm] = useState(false);
	const [editingWarranty, setEditingWarranty] = useState<Warranty | null>(null);
  const [searchCode, setSearchCode] = useState('');
  const [debouncedSearchCode, setDebouncedSearchCode] = useState('');
  const [searchCustomer, setSearchCustomer] = useState('');
  const [debouncedSearchCustomer, setDebouncedSearchCustomer] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const load = () => {
    setWarranties(Database.getWarranties());
    setCustomers(Database.getCustomers());
    setOrders(Database.getOrders());
    setPackages(Database.getPackages());
    setProducts(Database.getProducts());
    setInventoryItems(Database.getInventory());
  };

  useEffect(() => { load(); }, []);

  // Initialize from URL/localStorage
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code') || '';
      const customer = params.get('customer') || '';
      const status = params.get('status') || '';
      const p = parseInt(params.get('page') || '1', 10);
      const l = parseInt((params.get('limit') || localStorage.getItem('warrantyList.limit') || '10'), 10);
      setSearchCode(code);
      setDebouncedSearchCode(code);
      setSearchCustomer(customer);
      setDebouncedSearchCustomer(customer);
      setSearchStatus(status);
      setPage(!Number.isNaN(p) && p > 0 ? p : 1);
      if (!Number.isNaN(l) && l > 0) setLimit(l);
    } catch {}
  }, []);

  // Debounce search inputs
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchCode(searchCode), 300);
    return () => clearTimeout(t);
  }, [searchCode]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchCustomer(searchCustomer), 300);
    return () => clearTimeout(t);
  }, [searchCustomer]);

  // Reset page on filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchCode, debouncedSearchCustomer, searchStatus]);

  // Persist limit
  useEffect(() => {
    try { localStorage.setItem('warrantyList.limit', String(limit)); } catch {}
  }, [limit]);

  // Sync URL
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (debouncedSearchCode) params.set('code', debouncedSearchCode); else params.delete('code');
      if (debouncedSearchCustomer) params.set('customer', debouncedSearchCustomer); else params.delete('customer');
      if (searchStatus) params.set('status', searchStatus); else params.delete('status');
      params.set('page', String(page));
      params.set('limit', String(limit));
      const s = params.toString();
      const url = `${window.location.pathname}${s ? `?${s}` : ''}`;
      window.history.replaceState(null, '', url);
    } catch {}
  }, [debouncedSearchCode, debouncedSearchCustomer, searchStatus, page, limit]);

  const getCustomerName = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    const customer = customers.find(c => c.id === (order?.customerId || ''));
    return customer?.name || 'Không xác định';
  };

  const getProductText = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    const pkg = packages.find(p => p.id === (order?.packageId || ''));
    const prod = products.find(p => p.id === (pkg?.productId || ''));
    return `${prod?.name || ''} / ${pkg?.name || ''}`;
  };

  const getReplacementProductText = (inventoryId?: string) => {
    if (!inventoryId) return '-';
    const item = inventoryItems.find(i => i.id === inventoryId);
    if (!item) return '-';
    const product = products.find(p => p.id === item.productId)?.name || '';
    const pkg = packages.find(p => p.id === item.packageId)?.name || '';
    return `${product} / ${pkg}`;
  };

  const filteredWarranties = useMemo(() => {
    return warranties.filter(w => {
      const matchesCode = !debouncedSearchCode || w.code.toLowerCase().includes(debouncedSearchCode.toLowerCase());
      const customerName = getCustomerName(w.orderId).toLowerCase();
      const matchesCustomer = !debouncedSearchCustomer || customerName.includes(debouncedSearchCustomer.toLowerCase());
      const matchesStatus = !searchStatus || w.status === searchStatus;
      return matchesCode && matchesCustomer && matchesStatus;
    });
  }, [warranties, searchCode, searchCustomer, searchStatus, orders, customers]);

  const total = filteredWarranties.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;
  const pageItems = filteredWarranties.slice(start, start + limit);

  const exportWarrantiesXlsx = (items: Warranty[], filename: string) => {
    const rows = items.map((w, idx) => ({
      code: w.code || `BH${idx + 1}`,
      createdAt: new Date(w.createdAt).toLocaleDateString('vi-VN'),
      customer: getCustomerName(w.orderId),
      productPackage: getProductText(w.orderId),
      reason: (w.reason || ''),
      status: WARRANTY_STATUSES.find(s => s.value === w.status)?.label || w.status,
      replacement: getReplacementProductText(w.replacementInventoryId)
    }));
    exportToXlsx(rows, [
      { header: 'Mã BH', key: 'code', width: 12 },
      { header: 'Ngày tạo', key: 'createdAt', width: 14 },
      { header: 'Khách hàng', key: 'customer', width: 22 },
      { header: 'Sản phẩm/Gói', key: 'productPackage', width: 28 },
      { header: 'Lý do', key: 'reason', width: 50 },
      { header: 'Trạng thái', key: 'status', width: 14 },
      { header: 'Sản phẩm thay thế', key: 'replacement', width: 26 },
    ], filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, 'Bảo hành');
  };

  const toggleSelectAll = (checked: boolean, ids: string[]) => setSelectedIds(checked ? ids : []);
  const toggleSelect = (id: string, checked: boolean) => setSelectedIds(prev => checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id));
  const bulkDelete = () => {
    if (selectedIds.length === 0) return;
    setConfirmState({
      message: `Xóa ${selectedIds.length} đơn bảo hành đã chọn?`,
      onConfirm: () => {
        selectedIds.forEach(id => Database.deleteWarranty(id));
        (async () => {
          try {
            const sb2 = getSupabase();
            if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Xóa hàng loạt bảo hành', details: `ids=${selectedIds.join(',')}` });
          } catch {}
        })();
        setSelectedIds([]);
        load();
        notify('Đã xóa đơn bảo hành đã chọn', 'success');
      }
    });
  };
  const bulkSetStatus = (status: string) => {
    if (selectedIds.length === 0) return;
    selectedIds.forEach(id => Database.updateWarranty(id, { status: status as any }));
    (async () => {
      try {
        const sb2 = getSupabase();
        if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Cập nhật trạng thái bảo hành hàng loạt', details: `status=${status}; ids=${selectedIds.join(',')}` });
      } catch {}
    })();
    load();
    notify('Đã cập nhật trạng thái', 'success');
  };

const [confirmState, setConfirmState] = useState<null | { message: string; onConfirm: () => void }>(null);

const handleDelete = (id: string) => {
		setConfirmState({
			message: 'Xóa đơn bảo hành này?',
            onConfirm: () => {
				const w = warranties.find(x => x.id === id);
				Database.deleteWarranty(id);
                (async () => {
                    try {
                        const sb2 = getSupabase();
                        if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Xóa đơn bảo hành', details: `warrantyId=${id}; orderId=${w?.orderId || ''}; status=${w?.status || ''}` });
                    } catch {}
                })();
				notify('Đã xóa đơn bảo hành', 'success');
				load();
			}
		});
	};

	return (
    <div className="card">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h2 className="card-title">Đơn bảo hành</h2>
        <div className="d-flex gap-2">
          <button className="btn btn-light" onClick={() => exportWarrantiesXlsx(pageItems, 'warranties_page.xlsx')}>Xuất Excel (trang hiện tại)</button>
          <button className="btn btn-light" onClick={() => exportWarrantiesXlsx(filteredWarranties, 'warranties_filtered.xlsx')}>Xuất Excel (kết quả đã lọc)</button>
          {selectedIds.length > 0 && (
            <>
              <button className="btn btn-danger" onClick={bulkDelete}>Xóa đã chọn ({selectedIds.length})</button>
              <div className="dropdown">
                <button className="btn btn-secondary dropdown-toggle" data-bs-toggle="dropdown">Trạng thái</button>
                <div className="dropdown-menu show" style={{ position: 'absolute' }}>
                  {WARRANTY_STATUSES.map(s => (
                    <button key={s.value} className="dropdown-item" onClick={() => bulkSetStatus(s.value)}>{s.label}</button>
                  ))}
                </div>
              </div>
            </>
          )}
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>Tạo đơn bảo hành</button>
        </div>
      </div>
      
      <div className="card-body">
        <div className="row g-3 mb-3">
          <div className="col-md-4">
            <label className="form-label">Tìm theo mã bảo hành</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Nhập mã bảo hành..."
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">Tìm theo khách hàng</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Nhập tên khách hàng..."
              value={searchCustomer}
              onChange={(e) => setSearchCustomer(e.target.value)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">Lọc theo trạng thái</label>
            <select 
              className="form-control" 
              value={searchStatus}
              onChange={(e) => setSearchStatus(e.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              {WARRANTY_STATUSES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={pageItems.length > 0 && pageItems.every(w => selectedIds.includes(w.id))}
                  onChange={(e) => toggleSelectAll(e.target.checked, pageItems.map(w => w.id))}
                />
              </th>
              <th>Mã bảo hành</th>
              <th>Ngày tạo</th>
              <th>Khách hàng</th>
              <th>Sản phẩm/Gói</th>
              <th>Lý do</th>
              <th>Trạng thái</th>
              <th>Sản phẩm thay thế</th>
              <th>Thông tin đơn mới</th>
							<th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
							<tr><td colSpan={9} className="text-center">
                {warranties.length === 0 ? 'Chưa có đơn bảo hành' : 'Không tìm thấy đơn bảo hành phù hợp'}
              </td></tr>
            ) : (
              pageItems
                .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
                .map((w, index) => (
                <tr key={w.id}>
                  <td>
                    <input type="checkbox" checked={selectedIds.includes(w.id)} onChange={(e) => toggleSelect(w.id, e.target.checked)} />
                  </td>
                  <td>{w.code || `BH${index + 1}`}</td>
                  <td>{new Date(w.createdAt).toLocaleDateString('vi-VN')}</td>
                  <td>{getCustomerName(w.orderId)}</td>
                  <td>{getProductText(w.orderId)}</td>
                  <td>
                    <div className="line-clamp-3" title={w.reason} style={{ maxWidth: 420 }}>{w.reason}</div>
                  </td>
                  <td>
                    <span className={`status-badge ${w.status === 'DONE' ? 'status-completed' : 'status-processing'}`}>
                      {WARRANTY_STATUSES.find(s => s.value === w.status)?.label}
                    </span>
                  </td>
                  <td>{getReplacementProductText(w.replacementInventoryId)}</td>
                  <td style={{ maxWidth: 260 }}>
                    <div className="line-clamp-3" title={w.newOrderInfo || ''}>{w.newOrderInfo || '-'}</div>
                  </td>
									<td>
										<div className="d-flex gap-2">
											<button className="btn btn-secondary" onClick={() => setEditingWarranty(w)}>Sửa</button>
											<button className="btn btn-danger" onClick={() => handleDelete(w.id)}>Xóa</button>
										</div>
									</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
			<WarrantyForm onClose={() => setShowForm(false)} onSuccess={load} />
		)}
		{editingWarranty && (
			<WarrantyForm
				warranty={editingWarranty}
				onClose={() => setEditingWarranty(null)}
				onSuccess={() => { setEditingWarranty(null); load(); }}
			/>
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
    </div>
  );
};

export default WarrantyList;


