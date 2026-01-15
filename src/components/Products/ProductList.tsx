import React, { useState, useEffect } from 'react';
import { Product } from '../../types';
import { getSupabase } from '../../utils/supabaseClient';
import { Database } from '../../utils/database';
import ProductForm from './ProductForm';
import { IconEdit, IconTrash, IconBox, IconClipboard } from '../Icons';
// removed export button
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { exportToXlsx, generateExportFilename } from '../../utils/excel';
import useMediaQuery from '../../hooks/useMediaQuery';

type ProductWithUsage = Product & {
  hasLinkedOrders?: boolean;
  hasLinkedInventory?: boolean;
};

const ProductList: React.FC = () => {
  const { state } = useAuth();
  const { notify } = useToast();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [products, setProducts] = useState<ProductWithUsage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [formKey, setFormKey] = useState(0);
  const canDeleteProduct = (product?: ProductWithUsage | null) => !!product && !product.hasLinkedOrders && !product.hasLinkedInventory;
  const getUsageLabel = (product: ProductWithUsage) => {
    const reasons: string[] = [];
    if (product.hasLinkedOrders) reasons.push('đơn hàng');
    if (product.hasLinkedInventory) reasons.push('kho hàng');
    if (reasons.length === 0) return '';
    return `Đang gắn với ${reasons.join(' & ')}`;
  };

  const fetchProductUsageMap = async (productIds: string[], client?: ReturnType<typeof getSupabase>) => {
    if (!productIds.length) return {} as Record<string, { hasLinkedOrders: boolean; hasLinkedInventory: boolean }>;
    const sbClient = client ?? getSupabase();
    if (!sbClient) return {} as Record<string, { hasLinkedOrders: boolean; hasLinkedInventory: boolean }>;
    const packagesRes = await sbClient.from('packages').select('id, product_id').in('product_id', productIds);
    const inventoryRes = await sbClient.from('inventory').select('id, product_id').in('product_id', productIds);
    if (packagesRes.error) {
      console.error('Không thể lấy packages để kiểm tra liên kết sản phẩm', packagesRes.error);
    }
    if (inventoryRes.error) {
      console.error('Không thể lấy inventory để kiểm tra liên kết sản phẩm', inventoryRes.error);
    }
    const packages = Array.isArray(packagesRes.data) ? packagesRes.data : [];
    const inventory = Array.isArray(inventoryRes.data) ? inventoryRes.data : [];
    const packageIds = packages.map((pkg: any) => pkg.id).filter(Boolean);
    let orderPackages = new Set<string>();
    if (packageIds.length > 0) {
      const ordersRes = await sbClient.from('orders').select('package_id').in('package_id', packageIds);
      if (ordersRes.error) {
        console.error('Không thể lấy orders để kiểm tra liên kết sản phẩm', ordersRes.error);
      }
      const orderRows = Array.isArray(ordersRes.data) ? ordersRes.data : [];
      orderPackages = new Set(orderRows.map((o: any) => o.package_id).filter(Boolean));
    }
    const usageMap: Record<string, { hasLinkedOrders: boolean; hasLinkedInventory: boolean }> = {};
    const inventoryByProduct = new Set(inventory.map((inv: any) => inv.product_id).filter(Boolean));
    const packagesByProduct = new Map<string, string[]>();
    packages.forEach((pkg: any) => {
      if (!pkg.product_id) return;
      const list = packagesByProduct.get(pkg.product_id) || [];
      list.push(pkg.id);
      packagesByProduct.set(pkg.product_id, list);
    });
    productIds.forEach(pid => {
      const pkgIds = packagesByProduct.get(pid) || [];
      const hasLinkedOrders = pkgIds.some(pkgId => orderPackages.has(pkgId));
      const hasLinkedInventory = inventoryByProduct.has(pid);
      usageMap[pid] = { hasLinkedOrders, hasLinkedInventory };
    });
    return usageMap;
  };

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
    } catch { }
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
    } catch { }
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
        // ensure shared inventory pool flag is preserved when editing
        sharedInventoryPool: !!r.shared_inventory_pool,
        createdAt: r.created_at ? new Date(r.created_at) : new Date(),
        updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
      })) as Product[];
      const usageMap = await fetchProductUsageMap(pageProducts.map(p => p.id), sb);
      const decoratedProducts = pageProducts.map(product => ({
        ...product,
        hasLinkedOrders: usageMap[product.id]?.hasLinkedOrders || false,
        hasLinkedInventory: usageMap[product.id]?.hasLinkedInventory || false
      }));
      setProducts(decoratedProducts);
      setSelectedIds(prev => prev.filter(id => {
        const usage = usageMap[id];
        if (!usage) return true;
        return !(usage.hasLinkedInventory || usage.hasLinkedOrders);
      }));
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
    return () => { try { channel.unsubscribe(); } catch { } };
  }, [page, limit, debouncedSearchTerm]);

  // Load when page/limit/search changes
  useEffect(() => {
    loadProducts();
  }, [page, limit, debouncedSearchTerm]);

  const handleCreate = () => {
    setEditingProduct(null);
    setShowForm(false); // Force close first
    setFormKey(prev => prev + 1); // Force refresh form key
    setTimeout(() => {
      setShowForm(true); // Then open with fresh state
    }, 50); // Reduced delay for better UX
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setShowForm(true);
  };

  const [confirmState, setConfirmState] = useState<null | { message: string; onConfirm: () => void }>(null);

  const handleDelete = (id: string) => {
    const target = products.find(p => p.id === id);
    if (!target) return;
    if (!canDeleteProduct(target)) {
      notify('Sản phẩm đang gắn với đơn hàng hoặc kho hàng, không thể xóa', 'warning');
      return;
    }
    setConfirmState({
      message: 'Bạn có chắc chắn muốn xóa sản phẩm này?',
      onConfirm: () => {
        (async () => {
          const sb = getSupabase();
          if (!sb) return notify('Không thể xóa sản phẩm', 'error');
          const usageMap = await fetchProductUsageMap([id], sb);
          const usage = usageMap[id];
          if (usage?.hasLinkedOrders || usage?.hasLinkedInventory) {
            notify('Sản phẩm đang gắn với đơn hàng hoặc kho hàng, không thể xóa', 'error');
            loadProducts();
            return;
          }
          const snapshot = products.find(p => p.id === id);
          const { error } = await sb.from('products').delete().eq('id', id);
          if (!error) {
            // Update local storage immediately
            const currentProducts = Database.getProducts();
            Database.setProducts(currentProducts.filter(p => p.id !== id));

            // Force refresh form if it's open
            if (showForm && !editingProduct) {
              setShowForm(false);
              setFormKey(prev => prev + 1); // Force refresh form key
              setTimeout(() => {
                setShowForm(true);
              }, 50); // Reduced delay for better UX
            }

            try {
              const sb2 = getSupabase();
              if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Xóa sản phẩm', details: `productId=${id}; productCode=${snapshot?.code || ''}; productName=${snapshot?.name || ''}` });
            } catch { }
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
    const eligibleIds = ids.filter(id => {
      const product = products.find(p => p.id === id);
      return canDeleteProduct(product);
    });
    if (eligibleIds.length === 0) {
      if (checked) notify('Các sản phẩm đã chọn đang được sử dụng nên không thể xóa', 'warning');
      return;
    }
    if (checked) {
      setSelectedIds(prev => Array.from(new Set([...prev, ...eligibleIds])));
    } else {
      setSelectedIds(prev => prev.filter(id => !eligibleIds.includes(id)));
    }
  };

  const handleToggleSelect = (id: string, checked: boolean) => {
    const product = products.find(p => p.id === id);
    if (!canDeleteProduct(product)) {
      if (checked) notify('Sản phẩm đang gắn với đơn hàng hoặc kho hàng, không thể xóa', 'warning');
      return;
    }
    setSelectedIds(prev => checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id));
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    const deletableIds = selectedIds.filter(id => {
      const product = products.find(p => p.id === id);
      return canDeleteProduct(product);
    });
    const blockedCount = selectedIds.length - deletableIds.length;
    if (blockedCount > 0) {
      notify(`${blockedCount} sản phẩm đang được sử dụng nên không thể xóa`, 'warning');
      setSelectedIds(deletableIds);
    }
    if (deletableIds.length === 0) {
      notify('Không còn sản phẩm nào có thể xóa', 'warning');
      return;
    }
    const count = deletableIds.length;
    setConfirmState({
      message: `Xóa ${count} sản phẩm đã chọn?`,
      onConfirm: () => {
        (async () => {
          const sb = getSupabase();
          if (!sb) return notify('Không thể xóa sản phẩm', 'error');
          const usageMap = await fetchProductUsageMap(deletableIds, sb);
          const lockedNow = deletableIds.filter(id => {
            const usage = usageMap[id];
            return usage?.hasLinkedOrders || usage?.hasLinkedInventory;
          });
          if (lockedNow.length > 0) {
            notify('Một số sản phẩm vừa phát sinh liên kết, hãy thử lại sau', 'error');
            setSelectedIds(prev => prev.filter(id => !lockedNow.includes(id)));
            loadProducts();
            return;
          }
          const snapshots = products.filter(p => deletableIds.includes(p.id));
          const names = snapshots.map(p => p.name).filter(Boolean).join(',').slice(0, 200);
          const codes = snapshots.map(p => p.code).filter(Boolean).join(',').slice(0, 200);
          const { error } = await sb.from('products').delete().in('id', deletableIds);
          if (!error) {
            // Update local storage immediately
            const currentProducts = Database.getProducts();
            Database.setProducts(currentProducts.filter(p => !deletableIds.includes(p.id)));

            // Force refresh form if it's open
            if (showForm && !editingProduct) {
              setShowForm(false);
              setFormKey(prev => prev + 1); // Force refresh form key
              setTimeout(() => {
                setShowForm(true);
              }, 50); // Reduced delay for better UX
            }

            try {
              const sb2 = getSupabase();
              if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Xóa hàng loạt sản phẩm', details: `ids=${deletableIds.join(',')}; names=${names}; codes=${codes}` });
            } catch { }
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
  const sortedProducts = products
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
  const paginatedProducts = sortedProducts;
  const selectablePageIds = paginatedProducts.filter(p => canDeleteProduct(p)).map(p => p.id);

  const exportProductsXlsx = (items: Product[], filename: string) => {
    const rows = items.map((p, idx) => ({
      // Basic info
      code: p.code || `SP${idx + 1}`,
      name: p.name || '',
      description: p.description || '',

      // Product features
      sharedInventoryPool: p.sharedInventoryPool ? 'Có' : 'Không',
      sharedInventoryPoolValue: p.sharedInventoryPool || false,

      // System info
      createdAt: new Date(p.createdAt).toLocaleDateString('vi-VN'),
      updatedAt: new Date(p.updatedAt).toLocaleDateString('vi-VN'),

      // Raw dates for sorting
      createdAtRaw: p.createdAt.toISOString(),
      updatedAtRaw: p.updatedAt.toISOString(),
    }));

    exportToXlsx(rows, [
      // Basic info
      { header: 'Mã sản phẩm', key: 'code', width: 16 },
      { header: 'Tên sản phẩm', key: 'name', width: 28 },
      { header: 'Mô tả', key: 'description', width: 60 },

      // Product features
      { header: 'Kho chung', key: 'sharedInventoryPool', width: 12 },
      { header: 'Kho chung (giá trị)', key: 'sharedInventoryPoolValue', width: 16 },

      // System info
      { header: 'Ngày tạo', key: 'createdAt', width: 14 },
      { header: 'Ngày cập nhật', key: 'updatedAt', width: 14 },
    ], filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, 'Sản phẩm');
  };

  const resetFilters = () => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setPage(1);
  };


  return (
    <div className="card">
      <div className="card-header">
        <div className="d-flex justify-content-between align-items-center">
          <h2 className="card-title">Danh sách sản phẩm</h2>
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
                  const filename = generateExportFilename('SanPham', {
                    debouncedSearchTerm,
                    total: sortedProducts.length
                  }, 'KetQuaLoc');
                  exportProductsXlsx(sortedProducts, filename);
                }}>Xuất Excel (kết quả đã lọc)</button>
              </>
            )}
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
        <div className="mb-3">
          <input
            type="text"
            className="form-control"
            placeholder="Tìm kiếm sản phẩm..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
          <div style={{ gridColumn: isMobile ? '1 / -1' : 'auto' }}>
            <button className="btn btn-light w-100" onClick={resetFilters}>Reset bộ lọc</button>
          </div>
        </div>
      </div>

      {paginatedProducts.length === 0 ? (
        <div className="text-center py-4" style={{ animation: 'fadeInUp 0.5s ease-out' }}>
          <div style={{ marginBottom: '1rem', opacity: 0.6, display: 'inline-flex' }}>
            <IconBox size={32} />
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>Không có sản phẩm nào</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="product-mobile">
            {paginatedProducts.map((product, index) => (
              <div key={product.id} className="product-card">
                <div className="product-card-header">
                  <div className="d-flex align-items-center gap-2">
                    <div className="product-card-title">{product.name}</div>
                  </div>
                  <div className="product-card-subtitle">{product.code || `SP${index + 1}`}</div>
                </div>

                <div className="product-card-row">
                  <div className="product-card-label">Mã SP</div>
                  <div className="product-card-value">{product.code || `SP${index + 1}`}</div>
                </div>
                <div className="product-card-row">
                  <div className="product-card-label">Ngày tạo</div>
                  <div className="product-card-value">{new Date(product.createdAt).toLocaleDateString('vi-VN')}</div>
                </div>

                {product.description && (
                  <div className="product-card-description">
                    {product.description}
                  </div>
                )}

                <div className="product-card-actions">
                  <button
                    onClick={() => handleCopyDescription(product)}
                    className="btn btn-light"
                    title="Copy mô tả"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => handleEdit(product)}
                    className="btn btn-secondary"
                  >
                    Sửa
                  </button>
                  {canDeleteProduct(product) ? (
                    <button
                      onClick={() => handleDelete(product.id)}
                      className="btn btn-danger"
                    >
                      Xóa
                    </button>
                  ) : (
                    <span className="badge bg-light text-dark" title={getUsageLabel(product)}>
                      Đang dùng
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="table-responsive product-table">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36, minWidth: 36, maxWidth: 36 }}>
                    <input
                      type="checkbox"
                      checked={selectablePageIds.length > 0 && selectablePageIds.every(id => selectedIds.includes(id))}
                      disabled={selectablePageIds.length === 0}
                      onChange={(e) => handleToggleSelectAll(e.target.checked, selectablePageIds)}
                    />
                  </th>
                  <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Mã sản phẩm</th>
                  <th style={{ width: '150px', minWidth: '150px', maxWidth: '180px' }}>Tên sản phẩm</th>
                  <th style={{ width: '200px', minWidth: '200px', maxWidth: '250px' }}>Mô tả</th>
                  <th style={{ width: '80px', minWidth: '80px', maxWidth: '100px' }}>Ngày tạo</th>
                  <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {paginatedProducts.map((product, index) => (
                  <tr key={product.id}>
                    <td style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(product.id)}
                        disabled={!canDeleteProduct(product)}
                        title={canDeleteProduct(product) ? undefined : 'Sản phẩm đang được sử dụng, không thể xóa'}
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
                      <div className="d-flex gap-2">
                        <button
                          onClick={() => handleCopyDescription(product)}
                          className="btn btn-light btn-sm"
                          title="Copy mô tả"
                        >
                          Copy
                        </button>
                        <button
                          onClick={() => handleEdit(product)}
                          className="btn btn-secondary btn-sm"
                        >
                          Sửa
                        </button>
                        {canDeleteProduct(product) ? (
                          <button
                            onClick={() => handleDelete(product.id)}
                            className="btn btn-danger btn-sm"
                          >
                            Xóa
                          </button>
                        ) : (
                          <span
                            className="badge bg-light text-dark align-self-center"
                            title={getUsageLabel(product)}
                            style={{ cursor: 'not-allowed' }}
                          >
                            Đang dùng
                          </span>
                        )}
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
        <ProductForm
          key={`${editingProduct?.id || 'new'}-${formKey}`}
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
