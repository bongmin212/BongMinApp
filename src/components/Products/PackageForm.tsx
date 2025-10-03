import React, { useState, useEffect } from 'react';
import { ProductPackage, Product, PackageFormData, PackageCustomField } from '../../types';
import { Database } from '../../utils/database';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface PackageFormProps {
  package?: ProductPackage | null;
  onClose: () => void;
  onSuccess: () => void;
}

const PackageForm: React.FC<PackageFormProps> = ({ package: pkg, onClose, onSuccess }) => {
  const { state } = useAuth();
  const { notify } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [formData, setFormData] = useState<PackageFormData>({
    code: '',
    productId: '',
    name: '',
    warrantyPeriod: 24,
    costPrice: 0,
    ctvPrice: 0,
    retailPrice: 0,
    customFields: [],
    isAccountBased: false,
    accountColumns: [],
    defaultSlots: undefined
  });
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [priceDisplay, setPriceDisplay] = useState<{ costPrice: string; ctvPrice: string; retailPrice: string }>({ costPrice: '0', ctvPrice: '0', retailPrice: '0' });

  useEffect(() => {
    const allProducts = Database.getProducts();
    setProducts(allProducts);
    
    if (pkg) {
      setFormData({
        code: pkg.code,
        productId: pkg.productId,
        name: pkg.name,
        warrantyPeriod: pkg.warrantyPeriod,
        costPrice: pkg.costPrice,
        ctvPrice: pkg.ctvPrice,
        retailPrice: pkg.retailPrice,
        customFields: pkg.customFields || [],
        isAccountBased: !!pkg.isAccountBased,
        accountColumns: pkg.accountColumns || [],
        defaultSlots: pkg.defaultSlots
      });
      setPriceDisplay({
        costPrice: new Intl.NumberFormat('vi-VN').format(pkg.costPrice),
        ctvPrice: new Intl.NumberFormat('vi-VN').format(pkg.ctvPrice),
        retailPrice: new Intl.NumberFormat('vi-VN').format(pkg.retailPrice)
      });
    } else {
      const nextCode = Database.generateNextPackageCode();
      setFormData(prev => ({ ...prev, code: nextCode }));
      setPriceDisplay({
        costPrice: formData.costPrice ? new Intl.NumberFormat('vi-VN').format(formData.costPrice) : '0',
        ctvPrice: formData.ctvPrice ? new Intl.NumberFormat('vi-VN').format(formData.ctvPrice) : '0',
        retailPrice: formData.retailPrice ? new Intl.NumberFormat('vi-VN').format(formData.retailPrice) : '0'
      });
    }
  }, [pkg]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const newErrors: {[key: string]: string} = {};
    const ensuredCode = (formData.code || '').trim() || Database.generateNextPackageCode();
    if (!(formData.code || '').trim()) {
      setFormData(prev => ({ ...prev, code: ensuredCode }));
    }
    if (!ensuredCode.trim()) {
      newErrors.code = 'Mã gói sản phẩm là bắt buộc';
    }
    if (!formData.productId) {
      newErrors.productId = 'Vui lòng chọn sản phẩm';
    }
    if (!formData.name.trim()) {
      newErrors.name = 'Tên gói là bắt buộc';
    }
    if (formData.warrantyPeriod <= 0) {
      newErrors.warrantyPeriod = 'Thời hạn bảo hành phải lớn hơn 0';
    }
    if (formData.costPrice < 0) {
      newErrors.costPrice = 'Giá gốc không được âm';
    }
    if (formData.ctvPrice < 0) {
      newErrors.ctvPrice = 'Giá cộng tác viên không được âm';
    }
    if (formData.retailPrice < 0) {
      newErrors.retailPrice = 'Giá khách lẻ không được âm';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      if (pkg) {
        // Update existing package with diff logging
        const prevSnapshot = {
          code: pkg.code || '',
          productId: pkg.productId,
          name: pkg.name,
          warrantyPeriod: pkg.warrantyPeriod,
          costPrice: pkg.costPrice,
          ctvPrice: pkg.ctvPrice,
          retailPrice: pkg.retailPrice,
          customFields: JSON.stringify(pkg.customFields || [])
        } as const;

        const nextSnapshot = {
          code: formData.code || '',
          productId: formData.productId,
          name: formData.name,
          warrantyPeriod: formData.warrantyPeriod,
          costPrice: formData.costPrice,
          ctvPrice: formData.ctvPrice,
          retailPrice: formData.retailPrice,
          customFields: JSON.stringify(formData.customFields || [])
        } as const;

        const changedEntries: string[] = [];
        (Object.keys(prevSnapshot) as Array<keyof typeof prevSnapshot>).forEach((key) => {
          const beforeVal = String(prevSnapshot[key] as any);
          const afterVal = String(nextSnapshot[key] as any);
          if (beforeVal !== afterVal) {
            changedEntries.push(`${key}=${beforeVal}->${afterVal}`);
          }
        });

        try {
        // Enforce defaultSlots rules before saving
        const normalizedForm = {
          ...formData,
          defaultSlots: formData.isAccountBased ? Math.max(1, (formData.defaultSlots ?? 5)) : undefined
        };
        const updated = Database.updatePackage(pkg.id, normalizedForm);
          if (updated) {
            const base = [`packageId=${pkg.id}; packageCode=${pkg.code}`, `productId=${nextSnapshot.productId}`];
            const detail = [...base, ...changedEntries].join('; ');
            Database.saveActivityLog({
              employeeId: state.user?.id || 'system',
              action: 'Cập nhật gói sản phẩm',
              details: detail
            });
            notify('Cập nhật gói sản phẩm thành công', 'success');
            onSuccess();
          } else {
            notify('Không thể cập nhật gói sản phẩm', 'error');
          }
        } catch (updateError) {
          const errorMessage = updateError instanceof Error ? updateError.message : 'Có lỗi xảy ra khi cập nhật gói sản phẩm';
          notify(errorMessage, 'error');
        }
      } else {
        // Create new package
        const normalizedForm = {
          ...formData,
          code: ensuredCode,
          defaultSlots: formData.isAccountBased ? Math.max(1, (formData.defaultSlots ?? 5)) : undefined
        };
        const created = Database.savePackage(normalizedForm as any);
        Database.saveActivityLog({
          employeeId: state.user?.id || 'system',
          action: 'Tạo gói sản phẩm',
          details: `packageId=${created.id}; packageCode=${created.code}; productId=${created.productId}; name=${created.name}`
        });
        notify('Thêm gói sản phẩm thành công', 'success');
        onSuccess();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Có lỗi xảy ra khi lưu gói sản phẩm';
      notify(errorMessage, 'error');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name.includes('Price') || name === 'warrantyPeriod' ? Number(value) : value
    }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const formatNumberVn = (num: number): string => {
    return new Intl.NumberFormat('vi-VN').format(Number.isFinite(num) ? num : 0);
  };

  const parseVnCurrencyString = (input: string): number => {
    const digitsOnly = input.replace(/\D/g, '');
    return digitsOnly ? Number(digitsOnly) : 0;
  };

  const handlePriceChange = (field: 'costPrice' | 'ctvPrice' | 'retailPrice', raw: string) => {
    const numeric = parseVnCurrencyString(raw);
    setFormData(prev => ({ ...prev, [field]: numeric }));
    setPriceDisplay(prev => ({ ...prev, [field]: formatNumberVn(numeric) }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleWarrantyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === 'permanent') {
      setFormData(prev => ({ ...prev, warrantyPeriod: 24 }));
    } else {
      setFormData(prev => ({ ...prev, warrantyPeriod: Number(value) }));
    }
  };

  const addCustomField = () => {
    const newField: PackageCustomField = {
      id: (Date.now().toString(36) + Math.random().toString(36).slice(2)),
      title: '',
      placeholder: ''
    };
    setFormData(prev => ({ ...prev, customFields: [...(prev.customFields || []), newField] }));
  };

  const updateCustomField = (id: string, updates: Partial<PackageCustomField>) => {
    setFormData(prev => ({
      ...prev,
      customFields: (prev.customFields || []).map(f => f.id === id ? { ...f, ...updates } : f)
    }));
  };

  const removeCustomField = (id: string) => {
    setFormData(prev => ({
      ...prev,
      customFields: (prev.customFields || []).filter(f => f.id !== id)
    }));
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <div className="modal-header">
          <h3 className="modal-title">
            {pkg ? 'Sửa gói sản phẩm' : 'Thêm gói sản phẩm mới'}
          </h3>
          <button
            type="button"
            className="close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">
              Mã gói sản phẩm <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              name="code"
              className={`form-control ${errors.code ? 'is-invalid' : ''}`}
              value={formData.code}
              onChange={handleChange}
              placeholder="Tự tạo như PK001"
              readOnly
              disabled
              aria-disabled
              title={'Mã tự động tạo - không chỉnh sửa'}
              style={{ opacity: 0.6 } as React.CSSProperties}
            />
            {errors.code && (
              <div className="text-danger small mt-1">{errors.code}</div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">
              Sản phẩm <span className="text-danger">*</span>
            </label>
            <select
              name="productId"
              className={`form-control ${errors.productId ? 'is-invalid' : ''}`}
              value={formData.productId}
              onChange={handleChange}
            >
              <option value="">Chọn sản phẩm</option>
              {products.map(product => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
            {errors.productId && (
              <div className="text-danger small mt-1">{errors.productId}</div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">
              Tên gói <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              name="name"
              className={`form-control ${errors.name ? 'is-invalid' : ''}`}
              value={formData.name}
              onChange={handleChange}
              placeholder="Nhập tên gói sản phẩm"
            />
            {errors.name && (
              <div className="text-danger small mt-1">{errors.name}</div>
            )}
          </div>

          <div className="form-group">
            <div className="row align-items-center">
              <div className="col-md-3">
                <label className="form-label mb-0">
                  Thời hạn bảo hành <span className="text-danger">*</span>
                </label>
              </div>
              <div className="col-md-9">
                <div className="d-flex align-items-center gap-4 flex-wrap">
                  <label className="d-flex align-items-center mb-0">
                    <input
                      type="radio"
                      name="warrantyType"
                      value="permanent"
                      checked={formData.warrantyPeriod === 24}
                      onChange={handleWarrantyChange}
                      className="me-2"
                    />
                    Vĩnh viễn (2 năm)
                  </label>
                  <label className="d-flex align-items-center mb-0">
                    <input
                      type="radio"
                      name="warrantyType"
                      value="custom"
                      checked={formData.warrantyPeriod !== 24}
                      onChange={handleWarrantyChange}
                      className="me-2"
                    />
                    Tùy chỉnh
                  </label>
                  {formData.warrantyPeriod !== 24 && (
                    <div className="d-flex align-items-center gap-2">
                      <input
                        type="number"
                        name="warrantyPeriod"
                        className={`form-control ${errors.warrantyPeriod ? 'is-invalid' : ''}`}
                        value={formData.warrantyPeriod}
                        onChange={handleChange}
                        min="1"
                        placeholder="Nhập số tháng"
                        style={{ width: 140 }}
                      />
                      <span className="text-muted" style={{ fontSize: 16, fontWeight: 600 }}>tháng</span>
                    </div>
                  )}
                </div>
                {errors.warrantyPeriod && (
                  <div className="text-danger small mt-1">{errors.warrantyPeriod}</div>
                )}
              </div>
            </div>
          </div>

          <div className="row">
            <div className="col-md-4">
              <div className="form-group">
                <label className="form-label">
                  Giá gốc (giá vốn) <span className="text-danger">*</span>
                </label>
                <div className="currency-input">
                  <input
                    type="text"
                    inputMode="numeric"
                    name="costPrice"
                    className={`form-control ${errors.costPrice ? 'is-invalid' : ''}`}
                    value={priceDisplay.costPrice}
                    onChange={(e) => handlePriceChange('costPrice', e.target.value)}
                    placeholder="Nhập giá gốc"
                  />
                  <span className="currency-suffix" aria-hidden>đ</span>
                </div>
                {errors.costPrice && (
                  <div className="text-danger small mt-1">{errors.costPrice}</div>
                )}
              </div>
            </div>
            <div className="col-md-4">
              <div className="form-group">
                <label className="form-label">
                  Giá cộng tác viên <span className="text-danger">*</span>
                </label>
                <div className="currency-input">
                  <input
                    type="text"
                    inputMode="numeric"
                    name="ctvPrice"
                    className={`form-control ${errors.ctvPrice ? 'is-invalid' : ''}`}
                    value={priceDisplay.ctvPrice}
                    onChange={(e) => handlePriceChange('ctvPrice', e.target.value)}
                    placeholder="Nhập giá cộng tác viên"
                  />
                  <span className="currency-suffix" aria-hidden>đ</span>
                </div>
                {errors.ctvPrice && (
                  <div className="text-danger small mt-1">{errors.ctvPrice}</div>
                )}
              </div>
            </div>
            <div className="col-md-4">
              <div className="form-group">
                <label className="form-label">
                  Giá khách lẻ <span className="text-danger">*</span>
                </label>
                <div className="currency-input">
                  <input
                    type="text"
                    inputMode="numeric"
                    name="retailPrice"
                    className={`form-control ${errors.retailPrice ? 'is-invalid' : ''}`}
                    value={priceDisplay.retailPrice}
                    onChange={(e) => handlePriceChange('retailPrice', e.target.value)}
                    placeholder="Nhập giá khách lẻ"
                  />
                  <span className="currency-suffix" aria-hidden>đ</span>
                </div>
                {errors.retailPrice && (
                  <div className="text-danger small mt-1">{errors.retailPrice}</div>
                )}
              </div>
            </div>
          </div>

          <div className="card mt-3">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Trường tùy chỉnh</h5>
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={addCustomField}>+ Thêm trường</button>
            </div>
            <div className="card-body">
              {(formData.customFields || []).length === 0 && (
                <div className="text-muted">Chưa có trường nào. Nhấn "Thêm trường" để tạo.</div>
              )}
              {(formData.customFields || []).map((field) => (
                <div key={field.id} className="row g-2 align-items-end mb-2">
                  <div className="col-md-5">
                    <label className="form-label">Tiêu đề</label>
                    <input
                      type="text"
                      className="form-control"
                      value={field.title}
                      onChange={(e) => updateCustomField(field.id, { title: e.target.value })}
                      placeholder={"Ví dụ: Email Youtube"}
                    />
                  </div>
                  <div className="col-md-5">
                    <label className="form-label">Gợi ý nội dung</label>
                    <input
                      type="text"
                      className="form-control"
                      value={field.placeholder || ''}
                      onChange={(e) => updateCustomField(field.id, { placeholder: e.target.value })}
                      placeholder={"Ví dụ: user@gmail.com"}
                    />
                  </div>
                  <div className="col-md-2 d-flex">
                    <button type="button" className="btn btn-outline-danger ms-auto" onClick={() => removeCustomField(field.id)}>Xóa</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card mt-3">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Tài khoản nhiều slot</h5>
              <div className="d-flex align-items-center gap-2">
                <input
                  type="checkbox"
                  id="pkg_isAccountBased"
                  checked={!!formData.isAccountBased}
                  onChange={(e) => setFormData(prev => ({ ...prev, isAccountBased: e.target.checked }))}
                />
                <label htmlFor="pkg_isAccountBased" className="mb-0">Bật quản lý slot ở kho</label>
              </div>
            </div>
            {formData.isAccountBased && (
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Số slot mặc định</label>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.defaultSlots ?? ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, defaultSlots: e.target.value ? Number(e.target.value) : undefined }))}
                    min={1}
                    placeholder="vd: 5"
                  />
                </div>
                <div className="form-group">
                  <div className="d-flex justify-content-between align-items-center">
                    <label className="form-label mb-0">Cột tài khoản (import vào đơn nếu tick)</label>
                    <button
                      type="button"
                      className="btn btn-sm btn-light"
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        accountColumns: [...(prev.accountColumns || []), { id: `col-${Date.now()}`, title: '', includeInOrderInfo: true }]
                      }))}
                    >Thêm cột</button>
                  </div>
                  {(formData.accountColumns || []).map((col, idx) => (
                    <div key={col.id} className="d-flex align-items-center gap-2 mt-2">
                      <input
                        type="text"
                        className="form-control"
                        placeholder={`Tên cột #${idx + 1} (vd: Email, Pass, Hướng dẫn)`}
                        value={(col as any).title || ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          accountColumns: (prev.accountColumns || []).map(c => c.id === col.id ? { ...c, title: e.target.value } : c)
                        }))}
                      />
                      <div className="d-flex align-items-center gap-1">
                        <input
                          type="checkbox"
                          checked={!!(col as any).includeInOrderInfo}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            accountColumns: (prev.accountColumns || []).map(c => c.id === col.id ? { ...c, includeInOrderInfo: e.target.checked } : c)
                          }))}
                        />
                        <span style={{ whiteSpace: 'nowrap' }}>Import</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          accountColumns: (prev.accountColumns || []).filter(c => c.id !== col.id)
                        }))}
                      >Xóa</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="d-flex justify-content-end gap-2 mt-3">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-primary"
            >
              {pkg ? 'Cập nhật' : 'Thêm mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PackageForm;

