import React, { useEffect, useMemo, useState } from 'react';
import { InventoryFormData, Product, ProductPackage, InventoryAccountColumn } from '../../types';
import { Database } from '../../utils/database';
import { useAuth } from '../../contexts/AuthContext';
import { getSupabase } from '../../utils/supabaseClient';

interface WarehouseFormProps {
  item?: any;
  onClose: () => void;
  onSuccess: () => void;
}

const WarehouseForm: React.FC<WarehouseFormProps> = ({ item, onClose, onSuccess }) => {
  const { state } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [formData, setFormData] = useState<InventoryFormData>({
    code: '',
    productId: '',
    packageId: '',
    purchaseDate: new Date(),
    sourceNote: '',
    purchasePrice: undefined,
    productInfo: '',
    notes: '',
    isAccountBased: false,
    accountColumns: [],
    accountData: {},
    totalSlots: undefined
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const isLockedProduct = !!item && ((item.linkedOrderId && String(item.linkedOrderId).length > 0) || item.status === 'SOLD' || item.status === 'RESERVED');

  useEffect(() => {
    setProducts(Database.getProducts());
    setPackages(Database.getPackages());
  }, []);

  useEffect(() => {
    if (!item) return;
    // Prefill for edit
    setSelectedProduct(item.productId);
    setFormData({
      code: item.code || '',
      productId: item.productId,
      packageId: item.packageId,
      purchaseDate: new Date(item.purchaseDate),
      sourceNote: item.sourceNote || '',
      purchasePrice: item.purchasePrice,
      productInfo: item.productInfo || '',
      notes: item.notes || '',
      isAccountBased: !!item.isAccountBased,
      accountColumns: item.accountColumns || [],
      accountData: item.accountData || {},
      totalSlots: item.totalSlots
    });
  }, [item]);

  // Prefill code for new inventory item
  useEffect(() => {
    if (!item) {
      const nextCode = Database.generateNextInventoryCode();
      setFormData(prev => ({ ...prev, code: nextCode }));
    }
  }, [item]);

  const filteredPackages = useMemo(() => {
    if (!selectedProduct) return packages;
    return packages.filter(p => p.productId === selectedProduct);
  }, [packages, selectedProduct]);

  const currentProduct = useMemo(() => products.find(p => p.id === selectedProduct), [products, selectedProduct]);

  // Auto-pick a package for shared pool products to satisfy required fields and expiry calc
  useEffect(() => {
    if (!selectedProduct) return;
    const prod = products.find(p => p.id === selectedProduct);
    if (prod?.sharedInventoryPool) {
      const firstPkg = packages.find(pk => pk.productId === selectedProduct);
      setFormData(prev => ({ ...prev, packageId: firstPkg ? firstPkg.id : '' }));
    }
  }, [selectedProduct, products, packages]);

  const selectedPkg = useMemo(() => packages.find(p => p.id === formData.packageId), [packages, formData.packageId]);
  const pkgColumns = useMemo<InventoryAccountColumn[]>(() => {
    // Prefer columns from selected package; fallback to item columns in edit
    const cols = (selectedPkg?.accountColumns && selectedPkg.accountColumns.length > 0)
      ? selectedPkg.accountColumns
      : (item?.accountColumns || []);
    return cols || [];
  }, [selectedPkg, item]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { [key: string]: string } = {};
    const ensuredCode = (formData.code || '').trim() || Database.generateNextInventoryCode();
    if (!(formData.code || '').trim()) {
      setFormData(prev => ({ ...prev, code: ensuredCode }));
    }
    if (!ensuredCode.trim()) newErrors.code = 'Mã kho hàng là bắt buộc';
    if (!selectedProduct) newErrors.productId = 'Chọn sản phẩm';
    if (!formData.packageId) newErrors.packageId = 'Chọn gói sản phẩm';
    if (!formData.purchaseDate) newErrors.purchaseDate = 'Chọn ngày nhập kho';
    if (!formData.productInfo || !formData.productInfo.trim()) newErrors.productInfo = 'Nhập thông tin sản phẩm';
    if (formData.purchasePrice == null || isNaN(formData.purchasePrice) || formData.purchasePrice < 0) newErrors.purchasePrice = 'Giá mua không được âm';
    // Validate account-based required fields when package is account-based
    if (selectedPkg?.isAccountBased) {
      (pkgColumns || []).forEach((col: InventoryAccountColumn) => {
        const val = (formData.accountData || {})[col.id] || '';
        if (!String(val).trim()) {
          newErrors[`account_${col.id}`] = `Nhập "${col.title}"`;
        }
      });
    }
    // no account config here; package defines structure
    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }

    try {
      if (item) {
        // Edit mode
        const updates: any = {
          code: formData.code,
          productId: selectedProduct,
          packageId: formData.packageId,
          purchaseDate: formData.purchaseDate,
          sourceNote: formData.sourceNote,
          purchasePrice: formData.purchasePrice,
          productInfo: formData.productInfo,
          notes: formData.notes,
          // account config comes from package; keep existing profiles as-is
          accountData: formData.accountData
        };
        // Do not touch profiles/slots here
        const updated = Database.updateInventoryItem(item.id, updates);
        if (!updated) throw new Error('Không thể cập nhật kho');
        // Propagate changes to linked orders
        Database.refreshOrdersForInventory(item.id);
        try {
          const sb2 = getSupabase();
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Sửa kho', details: `inventoryId=${item.id}; code=${formData.code}` });
        } catch {}
        onSuccess();
      } else {
        const created = Database.saveInventoryItem({
          ...formData,
          code: ensuredCode,
          productId: selectedProduct,
          // profiles auto-generated from package config if applicable
        });
        try {
          const sb2 = getSupabase();
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Nhập kho', details: `productId=${selectedProduct}; packageId=${formData.packageId}; inventoryId=${created.id}; inventoryCode=${created.code}; price=${formData.purchasePrice ?? '-'}; source=${formData.sourceNote || '-'}; notes=${(formData.notes || '-').toString().slice(0,80)}` });
        } catch {}
        onSuccess();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Có lỗi xảy ra khi nhập kho';
      alert(errorMessage);
    }
  };

  return (
    <div className="modal">
      <div className="modal-content" style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{item ? 'Sửa kho' : 'Nhập kho'}</h3>
          <button type="button" className="close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Mã kho hàng *</label>
            <input
              type="text"
              className={`form-control ${errors.code ? 'is-invalid' : ''}`}
              value={formData.code}
              onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
              placeholder="Tự tạo như KHO001"
              readOnly
              disabled
              aria-disabled
              title={'Mã tự động tạo - không chỉnh sửa'}
              style={{ opacity: 0.6 } as React.CSSProperties}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Sản phẩm</label>
            <select
              className={`form-control ${errors.productId ? 'is-invalid' : ''}`}
              value={selectedProduct}
              onChange={(e) => {
                setSelectedProduct(e.target.value);
                setFormData(prev => ({ ...prev, packageId: '' }));
              }}
              disabled={isLockedProduct}
            >
              <option value="">Chọn sản phẩm</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {isLockedProduct && <div className="small text-muted mt-1">Đang liên kết đơn hàng - không thể đổi sản phẩm</div>}
          </div>

          <div className="form-group">
            <label className="form-label">Gói sản phẩm</label>
            {currentProduct?.sharedInventoryPool ? (
              <input className="form-control" value="Pool chung" disabled />
            ) : (
              <select
                className={`form-control ${errors.packageId ? 'is-invalid' : ''}`}
                value={formData.packageId}
                onChange={(e) => setFormData(prev => ({ ...prev, packageId: e.target.value }))}
                disabled={!selectedProduct || isLockedProduct}
              >
                <option value="">Chọn gói</option>
                {filteredPackages.map(pkg => (
                  <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
                ))}
              </select>
            )}
            {isLockedProduct && <div className="small text-muted mt-1">Đang liên kết đơn hàng - không thể đổi gói</div>}
          </div>

          <div className="form-group">
            <label className="form-label">Ngày nhập</label>
            <input
              type="date"
              className={`form-control ${errors.purchaseDate ? 'is-invalid' : ''}`}
              value={formData.purchaseDate.toISOString().split('T')[0]}
              onChange={(e) => setFormData(prev => ({ ...prev, purchaseDate: new Date(e.target.value) }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Nhập từ nguồn (không bắt buộc)</label>
            <input
              type="text"
              className="form-control"
              value={formData.sourceNote || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, sourceNote: e.target.value }))}
              placeholder="vd: Bạn hàng, key khuyến mãi, ..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Giá mua <span className="text-danger">*</span></label>
            <input
              type="text"
              className={`form-control ${errors.purchasePrice ? 'is-invalid' : ''}`}
              value={
                (formData.purchasePrice ?? '') === ''
                  ? ''
                  : new Intl.NumberFormat('vi-VN').format(Number(formData.purchasePrice)) + ' đ'
              }
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                const num = raw ? Number(raw) : NaN;
                setFormData(prev => ({ ...prev, purchasePrice: isNaN(num) ? undefined : num }));
                if (errors.purchasePrice) setErrors(prev => ({ ...prev, purchasePrice: '' }));
              }}
              placeholder="0 đ"
              inputMode="numeric"
            />
            {errors.purchasePrice && (
              <div className="text-danger small mt-1">{errors.purchasePrice}</div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Thông tin sản phẩm <span className="text-danger">*</span></label>
            <textarea
              className={`form-control ${errors.productInfo ? 'is-invalid' : ''}`}
              value={formData.productInfo || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, productInfo: e.target.value }))}
              placeholder="Serial/Key/Tài khoản..."
              rows={3}
            />
            {errors.productInfo && (
              <div className="text-danger small mt-1">{errors.productInfo}</div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Ghi chú (nội bộ)</label>
            <textarea
              className="form-control"
              value={formData.notes || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Ghi chú cho sản phẩm trong kho"
              rows={2}
            />
          </div>

          {/* Account-based values: render inputs for package-defined columns */}
          {selectedPkg?.isAccountBased && (
            <div className="card mt-3">
              <div className="card-header">
                <h5 className="mb-0">Thông tin tài khoản</h5>
              </div>
              <div className="card-body">
                {(pkgColumns || []).length === 0 && (
                  <div className="text-muted">Gói chưa cấu hình cột tài khoản.</div>
                )}
                {(pkgColumns || []).map((col: InventoryAccountColumn) => (
                  <div key={col.id} className="form-group">
                    <label className="form-label">{col.title} <span className="text-danger">*</span></label>
                    <textarea
                      className={`form-control ${errors[`account_${col.id}`] ? 'is-invalid' : ''}`}
                      value={(formData.accountData || {})[col.id] || ''}
                      onChange={(e) =>
                        setFormData(prev => ({
                          ...prev,
                          accountData: { ...(prev.accountData || {}), [col.id]: e.target.value }
                        }))
                      }
                      placeholder={col.title}
                      rows={col.title.toLowerCase().includes('hướng dẫn') ? 4 : 2}
                    />
                    {errors[`account_${col.id}`] && (
                      <div className="text-danger small mt-1">{errors[`account_${col.id}`]}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary">{item ? 'Cập nhật' : 'Lưu'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default WarehouseForm;


