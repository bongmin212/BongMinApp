import React, { useState, useEffect } from 'react';
import { Product, ProductFormData } from '../../types';
import { Database } from '../../utils/database';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface ProductFormProps {
  product?: Product | null;
  onClose: () => void;
  onSuccess: () => void;
}

const ProductForm: React.FC<ProductFormProps> = ({ product, onClose, onSuccess }) => {
  const { state } = useAuth();
  const { notify } = useToast();
  const [formData, setFormData] = useState<ProductFormData>({
    code: '',
    name: '',
    description: '',
    sharedInventoryPool: false
  });
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  useEffect(() => {
    if (product) {
      setFormData({
        code: product.code,
        name: product.name,
        description: product.description || '',
        sharedInventoryPool: !!product.sharedInventoryPool
      });
    } else {
      const nextCode = Database.generateNextProductCode();
      setFormData(prev => ({ ...prev, code: nextCode }));
    }
  }, [product]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const newErrors: {[key: string]: string} = {};
    const ensuredCode = (formData.code || '').trim() || Database.generateNextProductCode();
    if (!(formData.code || '').trim()) {
      setFormData(prev => ({ ...prev, code: ensuredCode }));
    }
    if (!ensuredCode.trim()) {
      newErrors.code = 'Mã sản phẩm là bắt buộc';
    }
    if (!formData.name.trim()) {
      newErrors.name = 'Tên sản phẩm là bắt buộc';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      if (product) {
        // Update existing product with diff logging
        const prevSnapshot = {
          code: product.code || '',
          name: product.name || '',
          description: product.description || '',
          sharedInventoryPool: !!product.sharedInventoryPool
        } as const;
        const nextSnapshot = {
          code: formData.code || '',
          name: formData.name || '',
          description: formData.description || '',
          sharedInventoryPool: !!formData.sharedInventoryPool
        } as const;
        const changedEntries: string[] = [];
        (Object.keys(prevSnapshot) as Array<keyof typeof prevSnapshot>).forEach((key) => {
          const beforeVal = String(prevSnapshot[key] ?? '');
          const afterVal = String(nextSnapshot[key] ?? '');
          if (beforeVal !== afterVal) {
            changedEntries.push(`${key}=${beforeVal}->${afterVal}`);
          }
        });

        try {
          const updated = Database.updateProduct(product.id, formData);
          if (updated) {
            const detail = [`productId=${product.id}; productCode=${product.code}`, ...changedEntries].join('; ');
            try {
              const sb2 = getSupabase();
              if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Cập nhật sản phẩm', details: detail });
            } catch {}
            notify('Cập nhật sản phẩm thành công', 'success');
            onSuccess();
          } else {
            notify('Không thể cập nhật sản phẩm', 'error');
          }
        } catch (updateError) {
          const errorMessage = updateError instanceof Error ? updateError.message : 'Có lỗi xảy ra khi cập nhật sản phẩm';
          notify(errorMessage, 'error');
        }
      } else {
        // Create new product
        const created = Database.saveProduct({ ...formData, code: ensuredCode });
        try {
          const sb2 = getSupabase();
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Tạo sản phẩm', details: `productId=${created.id}; productCode=${created.code}; name=${created.name}` });
        } catch {}
        notify('Thêm sản phẩm thành công', 'success');
        onSuccess();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Có lỗi xảy ra khi lưu sản phẩm';
      notify(errorMessage, 'error');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <div className="modal-header">
          <h3 className="modal-title">
            {product ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}
          </h3>
          <button
            type="button"
            className="close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

          <div className="form-group">
            <div className="d-flex align-items-center gap-2">
              <input
                type="checkbox"
                id="sharedInventoryPool"
                checked={!!formData.sharedInventoryPool}
                onChange={(e) => setFormData(prev => ({ ...prev, sharedInventoryPool: e.target.checked }))}
              />
              <label htmlFor="sharedInventoryPool" className="mb-0">Dùng chung kho hàng cho các gói</label>
            </div>
          </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">
              Mã sản phẩm <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              name="code"
              className={`form-control ${errors.code ? 'is-invalid' : ''}`}
              value={formData.code}
              onChange={handleChange}
              placeholder="Tự tạo như SP001"
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
              Tên sản phẩm <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              name="name"
              className={`form-control ${errors.name ? 'is-invalid' : ''}`}
              value={formData.name}
              onChange={handleChange}
              placeholder="Nhập tên sản phẩm"
            />
            {errors.name && (
              <div className="text-danger small mt-1">{errors.name}</div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Mô tả</label>
            <textarea
              name="description"
              className="form-control"
              value={formData.description}
              onChange={handleChange}
              placeholder="Nhập mô tả sản phẩm"
              rows={3}
            />
          </div>

          <div className="d-flex justify-content-end gap-2">
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
              {product ? 'Cập nhật' : 'Thêm mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductForm;

