import React, { useState, useEffect } from 'react';
import { ProductPackage, Product, PackageFormData, PackageCustomField } from '../../types';
import { Database } from '../../utils/database';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getSupabase } from '../../utils/supabaseClient';

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
  const [sharedConfigLocked, setSharedConfigLocked] = useState<boolean>(false);
  const [firstPackageId, setFirstPackageId] = useState<string | null>(null);

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
      // Determine lock state for existing package (cannot edit shared-config if not first in shared pool)
      (async () => {
        try {
          const sb = getSupabase();
          if (!sb) return;
          const pr = await sb.from('products').select('id, shared_inventory_pool').eq('id', pkg.productId).maybeSingle();
          const shared = !!(pr.data && pr.data.shared_inventory_pool);
          if (!shared) {
            setSharedConfigLocked(false);
            setFirstPackageId(null);
            return;
          }
          const first = await sb
            .from('packages')
            .select('id')
            .eq('product_id', pkg.productId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          const firstId = first.data?.id || null;
          setFirstPackageId(firstId);
          setSharedConfigLocked(!!firstId && firstId !== pkg.id);
        } catch {}
      })();
    } else {
      // Always generate fresh code for new package (from Supabase)
      (async () => {
        try {
          const sb = getSupabase();
          if (!sb) return;
          const { data } = await sb.from('packages').select('code').order('created_at', { ascending: false }).limit(2000);
          const codes = (data || []).map((r: any) => String(r.code || '')) as string[];
          const nextCode = Database.generateNextCodeFromList(codes, 'PK', 3);
          setFormData({
            code: nextCode,
            productId: '',
            name: '',
            warrantyPeriod: 0,
            costPrice: 0,
            ctvPrice: 0,
            retailPrice: 0,
            customFields: [],
            isAccountBased: false,
            accountColumns: [],
            defaultSlots: 5
          });
          setPriceDisplay({
            costPrice: '0',
            ctvPrice: '0',
            retailPrice: '0'
          });
        } catch {
          // Fallback to local storage method
          const nextCode = Database.generateNextPackageCode();
          setFormData({
            code: nextCode,
            productId: '',
            name: '',
            warrantyPeriod: 0,
            costPrice: 0,
            ctvPrice: 0,
            retailPrice: 0,
            customFields: [],
            isAccountBased: false,
            accountColumns: [],
            defaultSlots: 5
          });
          setPriceDisplay({
            costPrice: '0',
            ctvPrice: '0',
            retailPrice: '0'
          });
        }
      })();
    }
  }, [pkg]);

  // Force refresh code when form opens for new package (after deletion)
  useEffect(() => {
    if (!pkg) {
      (async () => {
        try {
          const sb = getSupabase();
          if (!sb) return;
          const { data } = await sb.from('packages').select('code').order('created_at', { ascending: false }).limit(2000);
          const codes = (data || []).map((r: any) => String(r.code || '')) as string[];
          const nextCode = Database.generateNextCodeFromList(codes, 'PK', 3);
          setFormData(prev => ({
            ...prev,
            code: nextCode
          }));
        } catch {
          // Fallback to local storage method
          const nextCode = Database.generateNextPackageCode();
          setFormData(prev => ({
            ...prev,
            code: nextCode
          }));
        }
      })();
    }
  }, []);

  // When selecting product for a NEW package, auto-copy shared settings from the first package if product uses shared pool
  useEffect(() => {
    if (!formData.productId) {
      setSharedConfigLocked(false);
      setFirstPackageId(null);
      return;
    }
    (async () => {
      try {
        const sb = getSupabase();
        if (!sb) return;
        // Check if product uses shared pool
        const pr = await sb.from('products').select('id, shared_inventory_pool').eq('id', formData.productId).maybeSingle();
        const shared = !!(pr.data && pr.data.shared_inventory_pool);
        if (!shared) {
          setSharedConfigLocked(false);
          setFirstPackageId(null);
          return;
        }
        // Find first package for this product
        const first = await sb
          .from('packages')
          .select('id, custom_fields, is_account_based, account_columns, default_slots')
          .eq('product_id', formData.productId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (first.data) {
          setFirstPackageId(first.data.id);
          // If creating a new package (no pkg), lock and copy from first
          if (!pkg) {
            setSharedConfigLocked(true);
            setFormData(prev => ({
              ...prev,
              customFields: (first.data as any).custom_fields || [],
              isAccountBased: !!(first.data as any).is_account_based,
              accountColumns: (first.data as any).account_columns || [],
              defaultSlots: (first.data as any).default_slots ?? (prev.isAccountBased ? (prev.defaultSlots ?? 5) : undefined)
            }));
          } else {
            // Editing existing: lock if not the first
            setSharedConfigLocked(first.data.id !== pkg.id);
          }
        } else {
          // No existing packages for this product → first package can edit freely
          setFirstPackageId(null);
          setSharedConfigLocked(false);
        }
      } catch {
        // leave as-is on error
      }
    })();
  }, [formData.productId]);

  const handleSubmit = async (e: React.FormEvent) => {
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
      const looksLikeUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(val || ''));
      const sbForResolve = getSupabase();
      // Resolve productId to real UUID if local id was used
      const resolveProductUuid = async (inputId: string): Promise<string> => {
        if (looksLikeUuid(inputId)) return inputId;
        const selected = products.find(p => p.id === inputId);
        if (!sbForResolve || !selected) return inputId;
        // Prefer code, fallback to name
        try {
          let productUuid: string | undefined;
          if ((selected as any).code) {
            const byCode = await sbForResolve.from('products').select('id').eq('code', (selected as any).code).maybeSingle();
            productUuid = byCode.data?.id as any;
          }
          if (!productUuid && selected.name) {
            const byName = await sbForResolve.from('products').select('id').eq('name', selected.name).maybeSingle();
            productUuid = byName.data?.id as any;
          }
          return productUuid || inputId;
        } catch {
          return inputId;
        }
      };

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
          const productUuid = await resolveProductUuid(formData.productId);
          // Enforce defaultSlots rules before saving and lock shared-config if applicable
          const normalizedForm = {
            ...formData,
            // If shared-config is locked for this package, preserve existing values
            customFields: sharedConfigLocked ? (pkg.customFields || []) : (formData.customFields || []),
            isAccountBased: sharedConfigLocked ? !!pkg.isAccountBased : !!formData.isAccountBased,
            accountColumns: sharedConfigLocked ? (pkg.accountColumns || []) : (formData.accountColumns || []),
            defaultSlots: (sharedConfigLocked ? (pkg.defaultSlots) : (formData.isAccountBased ? Math.max(1, (formData.defaultSlots ?? 5)) : undefined))
          } as PackageFormData;
          const sb = getSupabase();
          if (!sb) throw new Error('Supabase not configured');
          const { error } = await sb
            .from('packages')
            .update({
              code: normalizedForm.code,
              product_id: productUuid,
              name: normalizedForm.name,
              warranty_period: normalizedForm.warrantyPeriod,
              cost_price: normalizedForm.costPrice,
              ctv_price: normalizedForm.ctvPrice,
              retail_price: normalizedForm.retailPrice,
              custom_fields: normalizedForm.customFields,
              is_account_based: !!normalizedForm.isAccountBased,
              account_columns: normalizedForm.accountColumns,
              default_slots: normalizedForm.defaultSlots
            })
            .eq('id', pkg.id);
          if (!error) {
            const base = [`packageId=${pkg.id}; packageCode=${pkg.code}`, `productId=${nextSnapshot.productId}`];
            const detail = [...base, ...changedEntries].join('; ');
            try {
              const sb2 = getSupabase();
              if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Cập nhật gói sản phẩm', details: detail });
            } catch {}
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
        const productUuid = await resolveProductUuid(formData.productId);
        const normalizedForm = {
          ...formData,
          code: ensuredCode,
          defaultSlots: formData.isAccountBased ? Math.max(1, (formData.defaultSlots ?? 5)) : undefined
        };
        const sb = getSupabase();
        if (!sb) throw new Error('Supabase not configured');
        const { data: createdRows, error: insertError } = await sb
          .from('packages')
          .insert({
            code: normalizedForm.code,
            product_id: productUuid,
            name: normalizedForm.name,
            warranty_period: normalizedForm.warrantyPeriod,
            cost_price: normalizedForm.costPrice,
            ctv_price: normalizedForm.ctvPrice,
            retail_price: normalizedForm.retailPrice,
            custom_fields: normalizedForm.customFields,
            is_account_based: !!normalizedForm.isAccountBased,
            account_columns: normalizedForm.accountColumns,
            default_slots: normalizedForm.defaultSlots
          })
          .select('id')
          .limit(1);
        if (insertError) throw new Error(insertError.message || 'Không thể tạo gói sản phẩm');
        const createdId: string | undefined = Array.isArray(createdRows) && createdRows.length > 0 ? (createdRows[0] as any).id : undefined;
        
        // Update local storage immediately to avoid code conflicts
        const newPackage = {
          id: createdId || (Date.now().toString(36) + Math.random().toString(36).substr(2)),
          code: normalizedForm.code,
          productId: productUuid,
          name: normalizedForm.name,
          warrantyPeriod: normalizedForm.warrantyPeriod,
          costPrice: normalizedForm.costPrice,
          ctvPrice: normalizedForm.ctvPrice,
          retailPrice: normalizedForm.retailPrice,
          customFields: normalizedForm.customFields,
          isAccountBased: !!normalizedForm.isAccountBased,
          accountColumns: normalizedForm.accountColumns,
          defaultSlots: normalizedForm.defaultSlots,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        const currentPackages = Database.getPackages();
        Database.setPackages([...currentPackages, newPackage]);
        
        try {
          const sb2 = getSupabase();
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Tạo gói sản phẩm', details: `packageCode=${normalizedForm.code}; productId=${normalizedForm.productId}; name=${normalizedForm.name}` });
        } catch {}
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
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={addCustomField} disabled={sharedConfigLocked} title={sharedConfigLocked ? 'Đang dùng cấu hình chung từ gói đầu tiên' : undefined}>+ Thêm trường</button>
            </div>
            <div className="card-body">
              {sharedConfigLocked && (
                <div className="alert alert-info py-2">Cấu hình trường tùy chỉnh đang bị khóa theo gói đầu tiên của sản phẩm.</div>
              )}
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
                      disabled={sharedConfigLocked}
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
                      disabled={sharedConfigLocked}
                      placeholder={"Ví dụ: user@gmail.com"}
                    />
                  </div>
                  <div className="col-md-2 d-flex">
                    <button type="button" className="btn btn-outline-danger ms-auto" onClick={() => removeCustomField(field.id)} disabled={sharedConfigLocked}>Xóa</button>
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
                  disabled={sharedConfigLocked}
                />
                <label htmlFor="pkg_isAccountBased" className="mb-0">Bật quản lý slot ở kho</label>
              </div>
            </div>
            {formData.isAccountBased && (
              <div className="card-body">
                {sharedConfigLocked && (
                  <div className="alert alert-info py-2">Cấu hình tài khoản nhiều slot đang bị khóa theo gói đầu tiên của sản phẩm.</div>
                )}
                <div className="form-group">
                  <label className="form-label">Số slot mặc định</label>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.defaultSlots ?? ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, defaultSlots: e.target.value ? Number(e.target.value) : undefined }))}
                    disabled={sharedConfigLocked}
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
                      disabled={sharedConfigLocked}
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
                        disabled={sharedConfigLocked}
                      />
                      <div className="d-flex align-items-center gap-1">
                        <input
                          type="checkbox"
                          checked={!!(col as any).includeInOrderInfo}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            accountColumns: (prev.accountColumns || []).map(c => c.id === col.id ? { ...c, includeInOrderInfo: e.target.checked } : c)
                          }))}
                          disabled={sharedConfigLocked}
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
                        disabled={sharedConfigLocked}
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

