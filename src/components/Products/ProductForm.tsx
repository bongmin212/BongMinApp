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

  useEffect(() => {
    if (product) {
      setFormData({
        code: product.code,
        name: product.name,
        description: product.description || '',
        sharedInventoryPool: !!product.sharedInventoryPool
      });
    } else {
      // Code will be generated server-side
      setFormData({
        code: '',
        name: '',
        description: '',
        sharedInventoryPool: false
      });
    }
  }, [product]);

  // No need to refresh code - server will generate it

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const newErrors: {[key: string]: string} = {};
    // Code will be generated server-side, no validation needed
    if (!formData.name.trim()) {
      newErrors.name = 'Tên sản phẩm là bắt buộc';
    }
    
    if (Object.keys(newErrors).length > 0) {
      const errorMessages = Object.values(newErrors).join(', ');
      notify(`Vui lòng kiểm tra: ${errorMessages}`, 'warning', 4000);
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
        const { data: createdProduct, error: insertError } = await sb
          .from('products')
          .insert({
            code: null, // Let server generate
            name: formData.name,
            description: formData.description,
            shared_inventory_pool: !!formData.sharedInventoryPool
          })
          .select('*')
          .single();
        if (insertError || !createdProduct) throw new Error(insertError?.message || 'Không thể tạo sản phẩm');
        
        // Update local storage with server-generated data
        const newProduct = {
          id: createdProduct.id,
          code: createdProduct.code,
          name: createdProduct.name,
          description: createdProduct.description,
          sharedInventoryPool: !!createdProduct.shared_inventory_pool,
          createdAt: new Date(createdProduct.created_at),
          updatedAt: new Date(createdProduct.updated_at)
        };
        const currentProducts = Database.getProducts();
        Database.setProducts([...currentProducts, newProduct]);
        
        try {
          const sb2 = getSupabase();
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Tạo sản phẩm', details: `productCode=${createdProduct.code}; name=${formData.name}` });
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
              className="form-control"
              value={formData.code || 'Sẽ được tạo tự động...'}
              onChange={handleChange}
              placeholder="Sẽ được tạo tự động..."
              readOnly
              disabled
              aria-disabled
              title={'Mã được tạo tự động bởi server - không chỉnh sửa'}
              style={{ opacity: 0.6 } as React.CSSProperties}
            />
            <div className="text-muted small mt-1">
              Mã sản phẩm được tạo tự động bởi server và không thể chỉnh sửa.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              Tên sản phẩm <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              name="name"
              className="form-control"
              value={formData.name}
              onChange={handleChange}
              placeholder="Nhập tên sản phẩm"
            />
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

