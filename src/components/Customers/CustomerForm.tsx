import React, { useState, useEffect } from 'react';
import { getSupabase } from '../../utils/supabaseClient';
import { Customer, CustomerFormData, CustomerType, CustomerSource, CUSTOMER_TYPES, CUSTOMER_SOURCES } from '../../types';
import { Database } from '../../utils/database';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface CustomerFormProps {
  customer?: Customer | null;
  onClose: () => void;
  onSuccess: () => void;
}

const CustomerForm: React.FC<CustomerFormProps> = ({ customer, onClose, onSuccess }) => {
  const { state } = useAuth();
  const { notify } = useToast();
  const [formData, setFormData] = useState<CustomerFormData>({
    code: '',
    name: '',
    type: 'RETAIL',
    phone: '',
    email: '',
    source: undefined,
    sourceDetail: '',
    notes: ''
  });
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  useEffect(() => {
    if (customer) {
      setFormData({
        code: customer.code,
        name: customer.name,
        type: customer.type,
        phone: customer.phone || '',
        email: customer.email || '',
        source: customer.source,
        sourceDetail: customer.sourceDetail || '',
        notes: customer.notes || ''
      });
    } else {
      // Always generate fresh code for new customers
      const nextCode = Database.generateNextCustomerCode();
      setFormData(prev => ({ ...prev, code: nextCode }));
    }
  }, [customer]);

  // Force refresh code when form opens for new customer
  useEffect(() => {
    if (!customer) {
      const nextCode = Database.generateNextCustomerCode();
      setFormData(prev => ({ ...prev, code: nextCode }));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const newErrors: {[key: string]: string} = {};
    const ensuredCode = (formData.code || '').trim() || Database.generateNextCustomerCode();
    if (!(formData.code || '').trim()) {
      setFormData(prev => ({ ...prev, code: ensuredCode }));
    }
    if (!ensuredCode.trim()) {
      newErrors.code = 'Mã khách hàng là bắt buộc';
    }
    if (!formData.name.trim()) {
      newErrors.name = 'Tên khách hàng là bắt buộc';
    }
    if (formData.email && !isValidEmail(formData.email)) {
      newErrors.email = 'Email không hợp lệ';
    }
    if (formData.phone && !isValidPhone(formData.phone)) {
      newErrors.phone = 'Số điện thoại không hợp lệ';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      if (customer) {
        // Update existing customer with diff logging
        const prevSnapshot = {
          code: customer.code || '',
          name: customer.name || '',
          type: customer.type,
          phone: customer.phone || '',
          email: customer.email || '',
          source: customer.source || '',
          sourceDetail: customer.sourceDetail || '',
          notes: customer.notes || ''
        } as const;

        const nextSnapshot = {
          code: formData.code || '',
          name: formData.name || '',
          type: formData.type,
          phone: formData.phone || '',
          email: formData.email || '',
          source: formData.source || '',
          sourceDetail: formData.sourceDetail || '',
          notes: formData.notes || ''
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
          const sb = getSupabase();
          if (!sb) throw new Error('Supabase not configured');
          const { error } = await sb
            .from('customers')
            .update({
              code: formData.code,
              name: formData.name,
              type: formData.type,
              phone: formData.phone,
              email: formData.email,
              source: formData.source,
              source_detail: formData.sourceDetail,
              notes: formData.notes
            })
            .eq('id', customer.id);
          if (!error) {
            const detail = [`customerId=${customer.id}; customerCode=${customer.code}`, ...changedEntries].join('; ');
            try {
              const sb2 = getSupabase();
              if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Cập nhật khách hàng', details: detail });
            } catch {}
            notify('Cập nhật khách hàng thành công', 'success');
            onSuccess();
          } else {
            notify('Không thể cập nhật khách hàng', 'error');
          }
        } catch (updateError) {
          const errorMessage = updateError instanceof Error ? updateError.message : 'Có lỗi xảy ra khi cập nhật khách hàng';
          notify(errorMessage, 'error');
        }
      } else {
        // Create new customer
        const sb = getSupabase();
        if (!sb) throw new Error('Supabase not configured');
        const { error: insertError } = await sb
          .from('customers')
          .insert({
            code: ensuredCode,
            name: formData.name,
            type: formData.type,
            phone: formData.phone,
            email: formData.email,
            source: formData.source,
            source_detail: formData.sourceDetail,
            notes: formData.notes
          });
        if (insertError) throw new Error(insertError.message || 'Không thể tạo khách hàng');
        
        // Update local storage immediately to avoid code conflicts
        const newCustomer = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          code: ensuredCode,
          name: formData.name,
          type: formData.type,
          phone: formData.phone,
          email: formData.email,
          source: formData.source,
          sourceDetail: formData.sourceDetail,
          notes: formData.notes,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        const currentCustomers = Database.getCustomers();
        Database.setCustomers([...currentCustomers, newCustomer]);
        
        try {
          const sb2 = getSupabase();
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Tạo khách hàng', details: `customerCode=${ensuredCode}; name=${formData.name}` });
        } catch {}
        notify('Thêm khách hàng thành công', 'success');
        onSuccess();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Có lỗi xảy ra khi lưu khách hàng';
      notify(errorMessage, 'error');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
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

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const isValidPhone = (phone: string): boolean => {
    const phoneRegex = /^[0-9]{10,11}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  };

  const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as CustomerSource | '';
    setFormData(prev => ({
      ...prev,
      source: value || undefined,
      sourceDetail: '' // Reset source detail when source changes
    }));
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <div className="modal-header">
          <h3 className="modal-title">
            {customer ? 'Sửa khách hàng' : 'Thêm khách hàng mới'}
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
              Mã khách hàng <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              name="code"
              className={`form-control ${errors.code ? 'is-invalid' : ''}`}
              value={formData.code}
              onChange={handleChange}
              placeholder="Tự tạo như KH001"
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
              Tên khách hàng <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              name="name"
              className={`form-control ${errors.name ? 'is-invalid' : ''}`}
              value={formData.name}
              onChange={handleChange}
              placeholder="Nhập tên khách hàng"
            />
            {errors.name && (
              <div className="text-danger small mt-1">{errors.name}</div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">
              Loại khách hàng <span className="text-danger">*</span>
            </label>
            <select
              name="type"
              className="form-control"
              value={formData.type}
              onChange={handleChange}
            >
              {CUSTOMER_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="row">
            <div className="col-md-6">
              <div className="form-group">
                <label className="form-label">Số điện thoại</label>
                <input
                  type="tel"
                  name="phone"
                  className={`form-control ${errors.phone ? 'is-invalid' : ''}`}
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="Nhập số điện thoại"
                />
                {errors.phone && (
                  <div className="text-danger small mt-1">{errors.phone}</div>
                )}
              </div>
            </div>
            <div className="col-md-6">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  name="email"
                  className={`form-control ${errors.email ? 'is-invalid' : ''}`}
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Nhập email"
                />
                {errors.email && (
                  <div className="text-danger small mt-1">{errors.email}</div>
                )}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Nguồn khách hàng</label>
            <select
              name="source"
              className="form-control"
              value={formData.source || ''}
              onChange={handleSourceChange}
            >
              <option value="">Chọn nguồn khách hàng</option>
              {CUSTOMER_SOURCES.map(source => (
                <option key={source.value} value={source.value}>
                  {source.label}
                </option>
              ))}
            </select>
          </div>

          {formData.source && (
            <div className="form-group">
              <label className="form-label">Chi tiết nguồn</label>
              <input
                type="text"
                name="sourceDetail"
                className="form-control"
                value={formData.sourceDetail}
                onChange={handleChange}
                placeholder={`Nhập chi tiết về nguồn ${CUSTOMER_SOURCES.find(s => s.value === formData.source)?.label}`}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Ghi chú</label>
            <textarea
              name="notes"
              className="form-control"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Nhập ghi chú thêm"
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
              {customer ? 'Cập nhật' : 'Thêm mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CustomerForm;

