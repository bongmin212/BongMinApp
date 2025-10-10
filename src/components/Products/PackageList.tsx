import React, { useState, useEffect } from 'react';
import { ProductPackage, Product } from '../../types';
import { Database } from '../../utils/database';
import PackageForm from './PackageForm';
// removed export button
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getSupabase } from '../../utils/supabaseClient';

const PackageList: React.FC = () => {
  const { state } = useAuth();
  const { notify } = useToast();
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingPackage, setEditingPackage] = useState<ProductPackage | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const sb = getSupabase();
    if (!sb) return;
    const [pkRes, prRes] = await Promise.all([
      sb.from('packages').select('*').order('created_at', { ascending: true }),
      sb.from('products').select('*').order('created_at', { ascending: true })
    ]);
    const allPackages = (pkRes.data || []).map((r: any) => ({
      id: r.id,
      code: r.code,
      productId: r.product_id,
      name: r.name,
      warrantyPeriod: r.warranty_period,
      costPrice: r.cost_price,
      ctvPrice: r.ctv_price,
      retailPrice: r.retail_price,
      customFields: r.custom_fields || [],
      isAccountBased: !!r.is_account_based,
      accountColumns: r.account_columns || [],
      defaultSlots: r.default_slots,
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
    })) as ProductPackage[];
    const allProducts = (prRes.data || []).map((r: any) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description || '',
      sharedInventoryPool: !!r.shared_inventory_pool,
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
    })) as Product[];
    setPackages(allPackages);
    setProducts(allProducts);
  };

  // Realtime subscribe packages
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const ch = sb
      .channel('realtime:packages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packages' }, () => loadData())
      .subscribe();
    return () => { try { ch.unsubscribe(); } catch {} };
  }, []);

  const handleCreate = () => {
    setEditingPackage(null);
    setShowForm(false); // Force close first
    setTimeout(() => {
      setShowForm(true); // Then open with fresh state
    }, 50); // Small delay to ensure fresh state
  };

  const handleEdit = (pkg: ProductPackage) => {
    setEditingPackage(pkg);
    setShowForm(true);
  };

  const [confirmState, setConfirmState] = useState<null | { message: string; onConfirm: () => void }>(null);

  const handleDelete = (id: string) => {
    const target = packages.find(p => p.id === id);
    setConfirmState({
      message: 'Bạn có chắc chắn muốn xóa gói sản phẩm này?',
      onConfirm: async () => {
        const sb = getSupabase();
        if (!sb) return notify('Không thể xóa gói sản phẩm', 'error');
        const { error } = await sb.from('packages').delete().eq('id', id);
        if (!error) {
          // Update local storage immediately
          const currentPackages = Database.getPackages();
          Database.setPackages(currentPackages.filter(p => p.id !== id));
          
          // Force refresh form if it's open
          if (showForm && !editingPackage) {
            setShowForm(false);
            setTimeout(() => {
              setShowForm(true);
            }, 50); // Reduced delay for better UX
          }
          
          try {
            const sb2 = getSupabase();
            if (sb2) await sb2.from('activity_logs').insert({
              employee_id: state.user?.id || 'system',
              action: 'Xóa gói sản phẩm',
              details: [
                `packageId=${id}`,
                target?.code ? `packageCode=${target.code}` : '',
                target?.name ? `packageName=${target.name}` : '',
                target?.productId ? `productId=${target.productId}` : '',
                target?.productId ? `productName=${getProductName(target.productId)}` : ''
              ].filter(Boolean).join('; ')
            });
          } catch {}
          loadData();
          notify('Xóa gói sản phẩm thành công', 'success');
        } else {
          notify('Không thể xóa gói sản phẩm', 'error');
        }
      }
    });
  };

  const handleFormSubmit = () => {
    setShowForm(false);
    setEditingPackage(null);
    loadData();
  };

  const toggleSelectAll = (checked: boolean, ids: string[]) => setSelectedIds(checked ? ids : []);
  const toggleSelect = (id: string, checked: boolean) => setSelectedIds(prev => checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id));
  const bulkDelete = () => {
    if (selectedIds.length === 0) return;
    const targets = packages.filter(p => selectedIds.includes(p.id));
    setConfirmState({
      message: `Xóa ${selectedIds.length} gói sản phẩm đã chọn?`,
      onConfirm: async () => {
        const sb = getSupabase();
        if (!sb) return notify('Không thể xóa gói sản phẩm', 'error');
        const { error } = await sb.from('packages').delete().in('id', selectedIds);
        if (!error) {
          // Update local storage immediately
          const currentPackages = Database.getPackages();
          Database.setPackages(currentPackages.filter(p => !selectedIds.includes(p.id)));
          
          // Force refresh form if it's open
          if (showForm && !editingPackage) {
            setShowForm(false);
            setTimeout(() => {
              setShowForm(true);
            }, 50); // Reduced delay for better UX
          }
          
          try {
            const sb2 = getSupabase();
            if (sb2) await sb2.from('activity_logs').insert({
              employee_id: state.user?.id || 'system',
              action: 'Xóa hàng loạt gói',
              details: [
                `ids=${selectedIds.join(',')}`,
                `codes=${targets.map(t => t.code).filter(Boolean).join(',')}`,
                `names=${targets.map(t => t.name).filter(Boolean).join(',')}`
              ].filter(Boolean).join('; ')
            });
          } catch {}
          setSelectedIds([]);
          loadData();
          notify('Đã xóa gói đã chọn', 'success');
        } else {
          notify('Không thể xóa gói sản phẩm', 'error');
        }
      }
    });
  };

  const getProductName = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : 'Không xác định';
  };

  const formatWarrantyPeriod = (months: number) => {
    if (months >= 24) {
      return 'Vĩnh viễn';
    } else if (months >= 12) {
      const years = Math.floor(months / 12);
      return `${years} năm`;
    } else {
      return `${months} tháng`;
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price);
  };

  const filteredPackages = packages.filter(pkg => {
    const normalizedSearch = searchTerm.toLowerCase();
    const productName = getProductName(pkg.productId).toLowerCase();
    const matchesSearch = pkg.name.toLowerCase().includes(normalizedSearch) ||
                         (pkg.code || '').toLowerCase().includes(normalizedSearch) ||
                         productName.includes(normalizedSearch);
    const matchesProduct = !selectedProduct || pkg.productId === selectedProduct;
    return matchesSearch && matchesProduct;
  });

  const total = filteredPackages.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;
  const sortedPackages = filteredPackages
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
  const pageItems = sortedPackages.slice(start, start + limit);

  return (
    <div className="card">
      <div className="card-header">
        <div className="d-flex justify-content-between align-items-center">
          <h2 className="card-title">Danh sách gói sản phẩm</h2>
          <div className="d-flex gap-2">
            {selectedIds.length > 0 && (
              <button className="btn btn-danger" onClick={bulkDelete}>Xóa đã chọn ({selectedIds.length})</button>
            )}
            <button
              onClick={handleCreate}
              className="btn btn-primary"
            >
              Thêm gói sản phẩm
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
              placeholder="Tìm kiếm gói sản phẩm..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <select
              className="form-control"
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
            >
              <option value="">Tất cả sản phẩm</option>
              {products.map(product => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {filteredPackages.length === 0 ? (
        <div className="text-center py-4">
          <p>Không có gói sản phẩm nào</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={pageItems.length > 0 && pageItems.every(p => selectedIds.includes(p.id))}
                    onChange={(e) => toggleSelectAll(e.target.checked, pageItems.map(p => p.id))}
                  />
                </th>
                <th>Mã gói</th>
                <th>Tên gói</th>
                <th>Sản phẩm</th>
                <th>Thời hạn bảo hành</th>
                <th>Giá gốc</th>
                <th>Giá CTV</th>
                <th>Giá khách lẻ</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((pkg, index) => (
                <tr key={pkg.id}>
                  <td>
                    <input type="checkbox" checked={selectedIds.includes(pkg.id)} onChange={(e) => toggleSelect(pkg.id, e.target.checked)} />
                  </td>
                  <td>{pkg.code || `PK${index + 1}`}</td>
                  <td>
                    <div className="line-clamp-3" title={pkg.name} style={{ maxWidth: 360 }}>
                      {pkg.name}
                    </div>
                  </td>
                  <td>{getProductName(pkg.productId)}</td>
                  <td>{formatWarrantyPeriod(pkg.warrantyPeriod)}</td>
                  <td>{formatPrice(pkg.costPrice)}</td>
                  <td>{formatPrice(pkg.ctvPrice)}</td>
                  <td>{formatPrice(pkg.retailPrice)}</td>
                  <td>
                    <div className="d-flex gap-2">
                      <button
                        onClick={() => handleEdit(pkg)}
                        className="btn btn-secondary"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => handleDelete(pkg.id)}
                        className="btn btn-danger"
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
        <PackageForm
          key={editingPackage?.id || 'new'}
          package={editingPackage}
          onClose={() => {
            setShowForm(false);
            setEditingPackage(null);
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

export default PackageList;
