import React, { useState, useEffect, useLayoutEffect } from 'react';
import { Customer, CustomerType, CustomerSource, CUSTOMER_TYPES, CUSTOMER_SOURCES } from '../../types';
import { getSupabase } from '../../utils/supabaseClient';
import { Database } from '../../utils/database';
import CustomerForm from './CustomerForm';
import CustomerOrderHistory from './CustomerOrderHistory';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
// removed export button
import { exportToXlsx, generateExportFilename } from '../../utils/excel';
import useMediaQuery from '../../hooks/useMediaQuery';

const CustomerList: React.FC = () => {
  const { state } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { notify } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [formKey, setFormKey] = useState(0);
  const [filterType, setFilterType] = useState<CustomerType | ''>('');
  const [filterSource, setFilterSource] = useState<CustomerSource | ''>('');

  // Initialize state from URL once
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q') || '';
      const t = (params.get('type') || '') as CustomerType | '';
      const s = (params.get('source') || '') as CustomerSource | '';
      const p = parseInt(params.get('page') || '1', 10);
      const lsLimit = params.get('limit');
      const savedLimit = parseInt((lsLimit || '10'), 10);

      if (!Number.isNaN(savedLimit) && savedLimit > 0) {
        setLimit(savedLimit);
      }

      // Update all states in a batch to avoid timing issues
      setSearchTerm(q);
      setDebouncedSearchTerm(q);
      setFilterType(t || '');
      setFilterSource(s || '');
      setPage(!Number.isNaN(p) && p > 0 ? p : 1);
    } catch (e) {
      // Error reading URL params - ignore
    }
  }, []);

  // Re-read URL parameters after a short delay (for lazy loading and app:search events)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const params = new URLSearchParams(window.location.search);
        const t = (params.get('type') || '') as CustomerType | '';
        const s = (params.get('source') || '') as CustomerSource | '';
        const p = parseInt(params.get('page') || '1', 10);

        // Only update if values are different to avoid infinite loops
        if (t !== filterType) setFilterType(t);
        if (s !== filterSource) setFilterSource(s);
        if (p !== page) setPage(p);
      } catch { }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Debounce search term
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Reset page when filters or search change (debounced)
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchTerm, filterType, filterSource]);

  // Sync URL with state
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (debouncedSearchTerm) params.set('q', debouncedSearchTerm); else params.delete('q');
      if (filterType) params.set('type', filterType as string); else params.delete('type');
      if (filterSource) params.set('source', filterSource as string); else params.delete('source');
      params.set('page', String(page));
      params.set('limit', String(limit));
      const newSearch = params.toString();
      const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`;
      window.history.replaceState(null, '', newUrl);
    } catch { }
  }, [debouncedSearchTerm, filterType, filterSource, page, limit]);

  const loadCustomers = async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.from('customers').select('*').order('created_at', { ascending: true });
    const allCustomers = (data || []).map((r: any) => ({
      ...r,
      sourceDetail: r.source_detail || '',
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
    })) as Customer[];
    setCustomers(allCustomers);
  };

  // Load customers on mount and subscribe to realtime updates
  useEffect(() => {
    loadCustomers();

    const sb = getSupabase();
    if (!sb) return;
    const channel = sb
      .channel('realtime:customers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
        loadCustomers();
      })
      .subscribe();
    return () => { try { channel.unsubscribe(); } catch { } };
  }, []);

  const handleCreate = () => {
    setEditingCustomer(null);
    setShowForm(false); // Force close first
    setFormKey(prev => prev + 1); // Force refresh form key
    setTimeout(() => {
      setShowForm(true); // Then open with fresh state
    }, 50); // Reduced delay for better UX
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setShowForm(true);
  };

  const handleViewOrders = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowOrderHistory(true);
  };

  const [confirmState, setConfirmState] = useState<null | { message: string; onConfirm: () => void }>(null);

  const handleDelete = (id: string) => {
    setConfirmState({
      message: 'Bạn có chắc chắn muốn xóa khách hàng này?',
      onConfirm: async () => {
        try {
          const sb = getSupabase();
          if (!sb) return notify('Không thể xóa khách hàng', 'error');
          const snapshot = customers.find(c => c.id === id) || null;

          // Check for orders first using the logic now embedded in Database.deleteCustomer
          // but we call it here to ensure we handle the error properly before calling Supabase
          // if we want to be safe and consistent with local state.
          Database.deleteCustomer(id);

          const { error } = await sb.from('customers').delete().eq('id', id);
          if (!error) {
            // Force refresh form if it's open
            if (showForm && !editingCustomer) {
              setShowForm(false);
              setFormKey(prev => prev + 1); // Force refresh form key
              setTimeout(() => {
                setShowForm(true);
              }, 50); // Reduced delay for better UX
            }

            try {
              const sb2 = getSupabase();
              if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Xóa khách hàng', details: `customerId=${id}; name=${snapshot?.name || ''}; phone=${snapshot?.phone || ''}; email=${snapshot?.email || ''}` });
            } catch { }
            loadCustomers();
            notify('Xóa khách hàng thành công', 'success');
          } else {
            notify('Không thể xóa khách hàng', 'error');
          }
        } catch (err: any) {
          notify(err.message || 'Không thể xóa khách hàng', 'error');
        }
      }
    });
  };

  const handleToggleSelectAll = (checked: boolean, ids: string[]) => {
    if (checked) {
      setSelectedIds(prev => Array.from(new Set([...prev, ...ids])));
    } else {
      setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
    }
  };

  const handleToggleSelect = (id: string, checked: boolean) => {
    setSelectedIds(prev => checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id));
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    setConfirmState({
      message: `Xóa ${count} khách hàng đã chọn?`,
      onConfirm: async () => {
        try {
          const sb = getSupabase();
          if (!sb) return notify('Không thể xóa khách hàng', 'error');

          // Check each customer for linked orders before batch deleting
          for (const id of selectedIds) {
            const orders = Database.getOrdersByCustomer(id);
            if (orders.length > 0) {
              const customer = customers.find(c => c.id === id);
              throw new Error(`Khách hàng "${customer?.name || id}" có đơn hàng liên kết. Không thể xóa hàng loạt.`);
            }
          }

          const { error } = await sb.from('customers').delete().in('id', selectedIds);
          if (!error) {
            // Update local storage immediately
            const currentCustomers = Database.getCustomers();
            Database.setCustomers(currentCustomers.filter(c => !selectedIds.includes(c.id)));

            // Force refresh form if it's open
            if (showForm && !editingCustomer) {
              setShowForm(false);
              setFormKey(prev => prev + 1); // Force refresh form key
              setTimeout(() => {
                setShowForm(true);
              }, 50); // Reduced delay for better UX
            }

            try {
              const sb2 = getSupabase();
              const codes = selectedIds.map(id => customers.find(c => c.id === id)?.code).filter(Boolean);
              const names = selectedIds.map(id => customers.find(c => c.id === id)?.name).filter(Boolean);
              if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Xóa hàng loạt khách hàng', details: `codes=${codes.join(',')}; names=${names.join(',')}` });
            } catch { }
            setSelectedIds([]);
            loadCustomers();
            notify('Đã xóa khách hàng đã chọn', 'success');
          } else {
            notify('Không thể xóa khách hàng', 'error');
          }
        } catch (err: any) {
          notify(err.message || 'Không thể xóa khách hàng', 'error');
        }
      }
    });
  };

  const handleFormSubmit = () => {
    setShowForm(false);
    setEditingCustomer(null);
    loadCustomers();
  };

  const getCustomerTypeLabel = (type: CustomerType) => {
    return CUSTOMER_TYPES.find(t => t.value === type)?.label || type;
  };

  const getCustomerSourceLabel = (source: CustomerSource) => {
    return CUSTOMER_SOURCES.find(s => s.value === source)?.label || source;
  };

  const filteredCustomers = customers.filter(customer => {
    const normalizedSearch = debouncedSearchTerm.trim().toLowerCase();
    const matchesSearch = customer.name.toLowerCase().includes(normalizedSearch) ||
      customer.phone?.includes(normalizedSearch) ||
      customer.email?.toLowerCase().includes(normalizedSearch) ||
      (customer.code || '').toLowerCase().includes(normalizedSearch) ||
      (customer.notes || '').toLowerCase().includes(normalizedSearch) ||
      (customer.sourceDetail || '').toLowerCase().includes(normalizedSearch) ||
      customer.type.toLowerCase().includes(normalizedSearch) ||
      (customer.source || '').toLowerCase().includes(normalizedSearch);
    const matchesType = !filterType || customer.type === filterType;
    const matchesSource = !filterSource || customer.source === filterSource;


    return matchesSearch && matchesType && matchesSource;
  });

  const total = filteredCustomers.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;
  const sortedCustomers = filteredCustomers
    .slice()
    .sort((a, b) => {
      const getNum = (code?: string | null) => {
        if (!code) return Number.POSITIVE_INFINITY;
        const m = String(code).match(/\d+/);
        return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
      };
      const na = getNum(a.code as any);
      const nb = getNum(b.code as any);
      if (na !== nb) return na - nb;
      return (a.code || '').localeCompare(b.code || '');
    });
  const paginatedCustomers = sortedCustomers.slice(start, start + limit);

  const exportCustomersXlsx = (items: Customer[], filename: string) => {
    const rows = items.map((c, idx) => ({
      // Basic info
      code: c.code || `KH${idx + 1}`,
      name: c.name || '',
      type: getCustomerTypeLabel(c.type as CustomerType),
      typeValue: c.type || '',

      // Contact info
      phone: c.phone || '',
      email: c.email || '',

      // Source info
      source: c.source ? getCustomerSourceLabel(c.source as CustomerSource) : '',
      sourceValue: c.source || '',
      sourceDetail: c.sourceDetail || '',

      // Additional info
      notes: c.notes || '',

      // System info
      createdAt: new Date(c.createdAt).toLocaleDateString('vi-VN'),
      updatedAt: new Date(c.updatedAt).toLocaleDateString('vi-VN'),

      // Raw dates for sorting
      createdAtRaw: c.createdAt.toISOString(),
      updatedAtRaw: c.updatedAt.toISOString(),
    }));

    exportToXlsx(rows, [
      // Basic info
      { header: 'Mã KH', key: 'code', width: 14 },
      { header: 'Tên khách hàng', key: 'name', width: 24 },
      { header: 'Loại khách', key: 'type', width: 12 },
      { header: 'Loại (giá trị)', key: 'typeValue', width: 10 },

      // Contact info
      { header: 'SĐT', key: 'phone', width: 16 },
      { header: 'Email', key: 'email', width: 26 },

      // Source info
      { header: 'Nguồn', key: 'source', width: 16 },
      { header: 'Nguồn (giá trị)', key: 'sourceValue', width: 12 },
      { header: 'Chi tiết nguồn', key: 'sourceDetail', width: 30 },

      // Additional info
      { header: 'Ghi chú', key: 'notes', width: 30 },

      // System info
      { header: 'Ngày tạo', key: 'createdAt', width: 14 },
      { header: 'Ngày cập nhật', key: 'updatedAt', width: 14 },
    ], filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, 'Khách hàng');
  };

  const resetFilters = () => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setFilterType('');
    setFilterSource('');
    setPage(1);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="d-flex justify-content-between align-items-center">
          <h2 className="card-title">Danh sách khách hàng</h2>
          <div className="d-flex gap-2">
            {selectedIds.length > 0 && !isMobile && (
              <>
                <span className="badge bg-primary">Đã chọn: {selectedIds.length}</span>
                <button onClick={handleBulkDelete} className="btn btn-danger">Xóa đã chọn ({selectedIds.length})</button>
              </>
            )}
            {!isMobile && (
              <>
                <button className="btn btn-light" onClick={() => {
                  const filename = generateExportFilename('KhachHang', {
                    debouncedSearchTerm,
                    filterType,
                    filterSource,
                    total: filteredCustomers.length
                  }, 'KetQuaLoc');
                  exportCustomersXlsx(filteredCustomers, filename);
                }}>Xuất Excel (kết quả đã lọc)</button>
              </>
            )}
            <button
              onClick={handleCreate}
              className="btn btn-primary"
            >
              Thêm khách hàng
            </button>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <div>
            <input
              type="text"
              className="form-control"
              placeholder="Tìm kiếm khách hàng..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <select
              className="form-control"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as CustomerType | '')}
            >
              <option value="">Tất cả loại khách</option>
              {CUSTOMER_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select
              className="form-control"
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value as CustomerSource | '')}
            >
              <option value="">Tất cả nguồn</option>
              {CUSTOMER_SOURCES.map(source => (
                <option key={source.value} value={source.value}>
                  {source.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <button className="btn btn-light w-100" onClick={resetFilters}>Reset bộ lọc</button>
          </div>
        </div>
      </div>

      {filteredCustomers.length === 0 ? (
        <div className="text-center py-4">
          <p>Không có khách hàng nào</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="customer-mobile">
            {paginatedCustomers.map((customer, index) => (
              <div key={customer.id} className="customer-card">
                <div className="customer-card-header">
                  <div className="d-flex align-items-center gap-2">
                    <div className="customer-card-title">{customer.name}</div>
                  </div>
                  <div className="customer-card-subtitle">{customer.code || `KH${index + 1}`}</div>
                </div>

                <div className="customer-card-row">
                  <div className="customer-card-label">Loại</div>
                  <div className="customer-card-value">
                    <span className={`customer-type ${customer.type === 'CTV' ? 'customer-ctv' : 'customer-retail'}`}>
                      {getCustomerTypeLabel(customer.type)}
                    </span>
                  </div>
                </div>
                <div className="customer-card-row">
                  <div className="customer-card-label">SĐT</div>
                  <div className="customer-card-value">{customer.phone || '-'}</div>
                </div>
                <div className="customer-card-row">
                  <div className="customer-card-label">Email</div>
                  <div className="customer-card-value">{customer.email || '-'}</div>
                </div>
                <div className="customer-card-row">
                  <div className="customer-card-label">Nguồn</div>
                  <div className="customer-card-value">
                    {customer.source ? (
                      <div>
                        <div>{getCustomerSourceLabel(customer.source)}</div>
                        {customer.sourceDetail && (
                          <small className="text-muted">{customer.sourceDetail}</small>
                        )}
                      </div>
                    ) : '-'}
                  </div>
                </div>
                <div className="customer-card-row">
                  <div className="customer-card-label">Ngày tạo</div>
                  <div className="customer-card-value">{new Date(customer.createdAt).toLocaleDateString('vi-VN')}</div>
                </div>

                <div className="customer-card-actions">
                  <button
                    onClick={() => handleViewOrders(customer)}
                    className="btn btn-info"
                  >
                    Lịch sử
                  </button>
                  <button
                    onClick={() => handleEdit(customer)}
                    className="btn btn-secondary"
                  >
                    Sửa
                  </button>
                  <button
                    onClick={() => handleDelete(customer.id)}
                    className="btn btn-danger"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="table-responsive customer-table">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36, minWidth: 36, maxWidth: 36 }}>
                    <input
                      type="checkbox"
                      checked={paginatedCustomers.length > 0 && paginatedCustomers.every(c => selectedIds.includes(c.id))}
                      onChange={(e) => handleToggleSelectAll(e.target.checked, paginatedCustomers.map(c => c.id))}
                    />
                  </th>
                  <th style={{ width: '80px', minWidth: '80px', maxWidth: '100px' }}>Mã KH</th>
                  <th style={{ width: '150px', minWidth: '150px', maxWidth: '180px' }}>Tên khách hàng</th>
                  <th style={{ width: '80px', minWidth: '80px', maxWidth: '100px' }}>Loại</th>
                  <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>SĐT</th>
                  <th style={{ width: '150px', minWidth: '150px', maxWidth: '180px' }}>Email</th>
                  <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Nguồn</th>
                  <th style={{ width: '80px', minWidth: '80px', maxWidth: '100px' }}>Ngày tạo</th>
                  <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCustomers.map((customer, index) => (
                  <tr key={customer.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(customer.id)}
                        onChange={(e) => handleToggleSelect(customer.id, e.target.checked)}
                      />
                    </td>
                    <td>{customer.code || `KH${index + 1}`}</td>
                    <td>{customer.name}</td>
                    <td>
                      <span className={`customer-type ${customer.type === 'CTV' ? 'customer-ctv' : 'customer-retail'}`}>
                        {getCustomerTypeLabel(customer.type)}
                      </span>
                    </td>
                    <td>{customer.phone || '-'}</td>
                    <td>{customer.email || '-'}</td>
                    <td>
                      {customer.source ? (
                        <div>
                          <div>{getCustomerSourceLabel(customer.source)}</div>
                          {customer.sourceDetail && (
                            <small className="text-muted">{customer.sourceDetail}</small>
                          )}
                        </div>
                      ) : '-'}
                    </td>
                    <td>{new Date(customer.createdAt).toLocaleDateString('vi-VN')}</td>
                    <td>
                      <div className="d-flex gap-2">
                        <button
                          onClick={() => handleViewOrders(customer)}
                          className="btn btn-info btn-sm"
                        >
                          Lịch sử
                        </button>
                        <button
                          onClick={() => handleEdit(customer)}
                          className="btn btn-secondary btn-sm"
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => handleDelete(customer.id)}
                          className="btn btn-danger btn-sm"
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="d-flex justify-content-between align-items-center mt-3">
        <div>
          <select
            className="form-control"
            style={{ width: 100 }}
            value={limit}
            onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}
          >
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
        <CustomerForm
          key={`${editingCustomer?.id || 'new'}-${formKey}`}
          customer={editingCustomer}
          onClose={() => {
            setShowForm(false);
            setEditingCustomer(null);
          }}
          onSuccess={handleFormSubmit}
        />
      )}

      {showOrderHistory && selectedCustomer && (
        <CustomerOrderHistory
          customer={selectedCustomer}
          onClose={() => {
            setShowOrderHistory(false);
            setSelectedCustomer(null);
          }}
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

export default CustomerList;
