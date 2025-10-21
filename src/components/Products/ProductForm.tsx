import React, { useState, useEffect } from 'react';
import { Product, ProductFormData } from '../../types';
import { Database } from '../../utils/database';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getSupabase } from '../../utils/supabaseClient';

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
      // Always generate fresh code for new product (from Supabase)
      (async () => {
        try {
          const sb = getSupabase();
          if (!sb) return;
          const { data } = await sb.from('products').select('code').order('created_at', { ascending: false }).limit(2000);
          const codes = (data || []).map((r: any) => String(r.code || '')) as string[];
          const nextCode = Database.generateNextCodeFromList(codes, 'SP', 3);
          setFormData({
            code: nextCode,
            name: '',
            description: '',
            sharedInventoryPool: false
          });
        } catch {
          // Fallback to local storage method
          const nextCode = Database.generateNextProductCode();
          setFormData({
            code: nextCode,
            name: '',
            description: '',
            sharedInventoryPool: false
          });
        }
      })();
    }
  }, [product]);

  // Force refresh code when form opens for new product (after deletion)
  useEffect(() => {
    if (!product) {
      (async () => {
        try {
          const sb = getSupabase();
          if (!sb) return;
          const { data } = await sb.from('products').select('code').order('created_at', { ascending: false }).limit(2000);
          const codes = (data || []).map((r: any) => String(r.code || '')) as string[];
          const nextCode = Database.generateNextCodeFromList(codes, 'SP', 3);
          setFormData(prev => ({
            ...prev,
            code: nextCode
          }));
        } catch {
          // Fallback to local storage method
          const nextCode = Database.generateNextProductCode();
          setFormData(prev => ({
            ...prev,
            code: nextCode
          }));
        }
      })();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
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
        // Update existing product directly in Supabase with diff logging
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
            // Use friendly field names
            const fieldLabels: Record<string, string> = {
              code: 'Mã sản phẩm',
              name: 'Tên sản phẩm', 
              description: 'Mô tả',
              sharedInventoryPool: 'Kho chung'
            };
            const label = fieldLabels[key] || key;
            changedEntries.push(`${key}=${beforeVal}->${afterVal}`);
          }
        });

        try {
          const sb = getSupabase();
          if (!sb) throw new Error('Supabase not configured');
          const { error } = await sb
            .from('products')
            .update({
              code: formData.code,
              name: formData.name,
              description: formData.description,
              shared_inventory_pool: !!formData.sharedInventoryPool
            })
            .eq('id', product.id);
          if (!error) {
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
        // Create new product directly in Supabase
        const sb = getSupabase();
        if (!sb) throw new Error('Supabase not configured');
        const { error: insertError } = await sb
          .from('products')
          .insert({
            code: ensuredCode,
            name: formData.name,
            description: formData.description,
            shared_inventory_pool: !!formData.sharedInventoryPool
          });
        if (insertError) throw new Error(insertError.message || 'Không thể tạo sản phẩm');
        
        // Update local storage immediately to avoid code conflicts
        const newProduct = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          code: ensuredCode,
          name: formData.name,
          description: formData.description,
          sharedInventoryPool: !!formData.sharedInventoryPool,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        const currentProducts = Database.getProducts();
        Database.setProducts([...currentProducts, newProduct]);
        
        try {
          const sb2 = getSupabase();
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Tạo sản phẩm', details: `productCode=${ensuredCode}; name=${formData.name}` });
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

