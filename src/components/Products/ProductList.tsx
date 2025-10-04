import React, { useState, useEffect } from 'react';
import { Product } from '../../types';
import { getSupabase } from '../../utils/supabaseClient';
import ProductForm from './ProductForm';
import { IconEdit, IconTrash, IconBox, IconClipboard } from '../Icons';
// removed export button
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { exportToXlsx } from '../../utils/excel';

const ProductList: React.FC = () => {
  const { state } = useAuth();
  const { notify } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    loadProducts();
  }, []);

  // Initialize from URL (no localStorage)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q') || '';
      const p = parseInt(params.get('page') || '1', 10);
      const l = parseInt((params.get('limit') || '10'), 10);
      setSearchTerm(q);
      setDebouncedSearchTerm(q);
      setPage(!Number.isNaN(p) && p > 0 ? p : 1);
      if (!Number.isNaN(l) && l > 0) setLimit(l);
    } catch {}
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchTerm]);

  // No localStorage persistence

  // Sync URL
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (debouncedSearchTerm) params.set('q', debouncedSearchTerm); else params.delete('q');
      params.set('page', String(page));
      params.set('limit', String(limit));
      const s = params.toString();
      const url = `${window.location.pathname}${s ? `?${s}` : ''}`;
      window.history.replaceState(null, '', url);
    } catch {}
  }, [debouncedSearchTerm, page, limit]);

  const loadProducts = async () => {
    const sb = getSupabase();
    if (!sb) return;
    try {
      setLoading(true);
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      const q = (debouncedSearchTerm || '').trim();
      let query = sb
        .from('products')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: true })
        .range(from, to);
      if (q) {
        query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
      }
      const { data, count } = await query;
      const pageProducts = (data || []).map((r: any) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description || '',
        createdAt: r.created_at ? new Date(r.created_at) : new Date(),
        updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
      })) as Product[];
      setProducts(pageProducts);
      setTotal(count || 0);
    } finally {
      setLoading(false);
    }
  };

  // Realtime subscribe
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const channel = sb
      .channel('realtime:products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        loadProducts();
      })
      .subscribe();
    return () => { try { channel.unsubscribe(); } catch {} };
  }, [page, limit, debouncedSearchTerm]);

  // Load server-side when page/limit/search changes
  useEffect(() => {
    loadProducts();
  }, [page, limit, debouncedSearchTerm]);

  const handleCreate = () => {
    setEditingProduct(null);
    setShowForm(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setShowForm(true);
  };

  const [confirmState, setConfirmState] = useState<null | { message: string; onConfirm: () => void }>(null);

  const handleDelete = (id: string) => {
    setConfirmState({
      message: 'Bạn có chắc chắn muốn xóa sản phẩm này?',
      onConfirm: () => {
        (async () => {
          const sb = getSupabase();
          if (!sb) return notify('Không thể xóa sản phẩm', 'error');
          const { error } = await sb.from('products').delete().eq('id', id);
          if (!error) {
            try {
              const sb2 = getSupabase();
              if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Xóa sản phẩm', details: `productId=${id}` });
            } catch {}
            loadProducts();
            notify('Xóa sản phẩm thành công', 'success');
          } else {
            notify('Không thể xóa sản phẩm', 'error');
          }
        })();
      }
    });
  };

  const handleToggleSelectAll = (checked: boolean, ids: string[]) => {
    setSelectedIds(checked ? ids : []);
  };

  const handleToggleSelect = (id: string, checked: boolean) => {
    setSelectedIds(prev => checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id));
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    setConfirmState({
      message: `Xóa ${count} sản phẩm đã chọn?`,
      onConfirm: () => {
        (async () => {
          const sb = getSupabase();
          if (!sb) return notify('Không thể xóa sản phẩm', 'error');
          const { error } = await sb.from('products').delete().in('id', selectedIds);
          if (!error) {
            try {
              const sb2 = getSupabase();
              if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Xóa hàng loạt sản phẩm', details: `ids=${selectedIds.join(',')}` });
            } catch {}
            setSelectedIds([]);
            loadProducts();
            notify('Đã xóa sản phẩm đã chọn', 'success');
          } else {
            notify('Không thể xóa sản phẩm', 'error');
          }
        })();
      }
    });
  };

  const handleCopyDescription = async (product: Product) => {
    const text = product.description || '';
    try {
      await navigator.clipboard.writeText(text);
      notify('Đã copy mô tả sản phẩm', 'success');
    } catch (e) {
      notify('Không thể copy vào clipboard', 'error');
    }
  };

  const handleFormSubmit = () => {
    setShowForm(false);
    setEditingProduct(null);
    loadProducts();
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const paginatedProducts = products;

  const exportProductsXlsx = (items: Product[], filename: string) => {
    const rows = items.map((p, idx) => ({
      code: p.code || `SP${idx + 1}`,
      name: p.name || '',
      description: p.description || '',
      createdAt: new Date(p.createdAt).toLocaleDateString('vi-VN')
    }));
    exportToXlsx(rows, [
      { header: 'Mã SP', key: 'code', width: 16 },
      { header: 'Tên', key: 'name', width: 28 },
      { header: 'Mô tả', key: 'description', width: 60 },
      { header: 'Ngày tạo', key: 'createdAt', width: 14 },
    ], filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, 'Sản phẩm');
  };


  return (
    <div className="card">
      <div className="card-header">
        <div className="d-flex justify-content-between align-items-center">
          <h2 className="card-title">Danh sách sản phẩm</h2>
          <div className="d-flex gap-2">
            {selectedIds.length > 0 && (
              <button onClick={handleBulkDelete} className="btn btn-danger">Xóa đã chọn ({selectedIds.length})</button>
            )}
            <button className="btn btn-light" onClick={() => exportProductsXlsx(paginatedProducts, 'products_page.xlsx')}>Xuất Excel (trang hiện tại)</button>
            <button className="btn btn-light" onClick={async () => {
              const sb = getSupabase();
              if (!sb) return notify('Không thể xuất Excel', 'error');
              const q = (debouncedSearchTerm || '').trim();
              let query = sb
                .from('products')
                .select('*')
                .order('created_at', { ascending: true })
                .range(0, 999);
              if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
              const { data } = await query;
              const rows = (data || []).map((r: any, idx: number) => ({
                code: r.code || `SP${idx + 1}`,
                name: r.name || '',
                description: r.description || '',
                createdAt: r.created_at ? new Date(r.created_at).toLocaleDateString('vi-VN') : ''
              }));
              exportToXlsx(rows, [
                { header: 'Mã SP', key: 'code', width: 16 },
                { header: 'Tên', key: 'name', width: 28 },
                { header: 'Mô tả', key: 'description', width: 60 },
                { header: 'Ngày tạo', key: 'createdAt', width: 14 },
              ], 'products_filtered.xlsx', 'Sản phẩm');
            }}>Xuất Excel (kết quả đã lọc ≤ 1000)</button>
            <button
              onClick={handleCreate}
              className="btn btn-primary"
            >
              Thêm sản phẩm
            </button>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <input
          type="text"
          className="form-control"
          placeholder="Tìm kiếm sản phẩm..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {paginatedProducts.length === 0 ? (
        <div className="text-center py-4" style={{ animation: 'fadeInUp 0.5s ease-out' }}>
          <div style={{ marginBottom: '1rem', opacity: 0.6, display: 'inline-flex' }}>
            <IconBox size={32} />
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>Không có sản phẩm nào</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={paginatedProducts.length > 0 && paginatedProducts.every(p => selectedIds.includes(p.id))}
                    onChange={(e) => handleToggleSelectAll(e.target.checked, paginatedProducts.map(p => p.id))}
                  />
                </th>
                <th style={{ width: '15%' }}>Mã sản phẩm</th>
                <th style={{ width: '20%' }}>Tên sản phẩm</th>
                <th style={{ width: '35%' }}>Mô tả</th>
                <th style={{ width: '15%' }}>Ngày tạo</th>
                <th style={{ width: '15%' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map((product, index) => (
                <tr key={product.id}>
                  <td style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(product.id)}
                      onChange={(e) => handleToggleSelect(product.id, e.target.checked)}
                    />
                  </td>
                  <td style={{ width: '15%' }}>
                    <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
                      {product.code || `SP${index + 1}`}
                    </div>
                  </td>
                  <td style={{ width: '20%' }}>
                    <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
                      {product.name}
                    </div>
                  </td>
                  <td style={{ width: '35%', color: 'var(--text-secondary)' }}>
                    <div
                      title={product.description || ''}
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical' as any,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'normal'
                      }}
                    >
                      {product.description || '-'}
                    </div>
                  </td>
                  <td style={{ width: '15%', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    {new Date(product.createdAt).toLocaleDateString('vi-VN')}
                  </td>
                  <td style={{ width: '15%' }}>
                    <div className="d-flex" style={{ gap: 8 }}>
                      <button
                        onClick={() => handleCopyDescription(product)}
                        className="btn btn-light btn-sm"
                        style={{ transition: 'all 0.2s ease' }}
                        title="Copy mô tả"
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <IconClipboard />
                          <span className="ms-1">Copy</span>
                        </span>
                      </button>
                      <button
                        onClick={() => handleEdit(product)}
                        className="btn btn-secondary btn-sm"
                        style={{ transition: 'all 0.2s ease' }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <IconEdit />
                          <span className="ms-1">Sửa</span>
                        </span>
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="btn btn-danger btn-sm"
                        style={{ transition: 'all 0.2s ease' }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <IconTrash />
                          <span className="ms-1">Xóa</span>
                        </span>
                      </button>
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
        <ProductForm
          product={editingProduct}
          onClose={() => {
            setShowForm(false);
            setEditingProduct(null);
          }}
          onSuccess={handleFormSubmit}
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

export default ProductList;
