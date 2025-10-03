import React, { useState, useEffect } from 'react';
import { Employee, EmployeeFormData, EmployeeRole, EMPLOYEE_ROLES } from '../../types';
import { Database } from '../../utils/database';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface EmployeeFormProps {
  employee?: Employee | null;
  onClose: () => void;
  onSuccess: () => void;
}

const EmployeeForm: React.FC<EmployeeFormProps> = ({ employee, onClose, onSuccess }) => {
  const { state } = useAuth();
  const { notify } = useToast();
  const [formData, setFormData] = useState<EmployeeFormData>({
    code: '',
    username: '',
    password: '',
    role: 'EMPLOYEE'
  });
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  useEffect(() => {
    if (employee) {
      setFormData({
        code: employee.code,
        username: employee.username,
        password: '', // Don't show existing password
        role: employee.role
      });
    } else {
      const nextCode = Database.generateNextEmployeeCode();
      setFormData(prev => ({ ...prev, code: nextCode }));
    }
  }, [employee]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const newErrors: {[key: string]: string} = {};
    const ensuredCode = (formData.code || '').trim() || Database.generateNextEmployeeCode();
    if (!(formData.code || '').trim()) {
      setFormData(prev => ({ ...prev, code: ensuredCode }));
    }
    if (!ensuredCode.trim()) {
      newErrors.code = 'Mã nhân viên là bắt buộc';
    }
    if (!formData.username.trim()) {
      newErrors.username = 'Tên đăng nhập là bắt buộc';
    }
    if (!employee && !formData.password.trim()) {
      newErrors.password = 'Mật khẩu là bắt buộc';
    }
    if (formData.password && formData.password.length < 6) {
      newErrors.password = 'Mật khẩu phải có ít nhất 6 ký tự';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      let passwordHashStr: string | undefined = undefined;
      if (formData.password) {
        const { createPasswordRecord, serializePasswordRecord } = await import('../../utils/auth');
        const rec = await createPasswordRecord(formData.password);
        passwordHashStr = serializePasswordRecord(rec);
      }
      const employeeData: any = {
        code: ensuredCode,
        username: formData.username,
        role: formData.role
      };
      if (passwordHashStr) employeeData.passwordHash = passwordHashStr;

      if (employee) {
        // Update existing employee with diff logging
        const prevSnapshot = {
          code: employee.code || '',
          username: employee.username,
          role: employee.role,
          // Don't include passwordHash
        } as const;

        const nextSnapshot = {
          code: employeeData.code || '',
          username: employeeData.username,
          role: employeeData.role
        } as const;

        const changedEntries: string[] = [];
        (Object.keys(prevSnapshot) as Array<keyof typeof prevSnapshot>).forEach((key) => {
          const beforeVal = String(prevSnapshot[key] ?? '');
          const afterVal = String(nextSnapshot[key] ?? '');
          if (beforeVal !== afterVal) {
            changedEntries.push(`${key}=${beforeVal}->${afterVal}`);
          }
        });
        if (formData.password) {
          changedEntries.push(`password=****->****`);
        }

        try {
          const updated = Database.updateEmployee(employee.id, employeeData);
          if (updated) {
            const detail = [`employeeId=${employee.id}; employeeCode=${employee.code}`, ...changedEntries].join('; ');
            Database.saveActivityLog({
              employeeId: state.user?.id || 'system',
              action: 'Cập nhật nhân viên',
              details: detail
            });
            notify('Cập nhật nhân viên thành công', 'success');
            onSuccess();
          } else {
            notify('Không thể cập nhật nhân viên', 'error');
          }
        } catch (updateError) {
          const errorMessage = updateError instanceof Error ? updateError.message : 'Có lỗi xảy ra khi cập nhật nhân viên';
          notify(errorMessage, 'error');
        }
      } else {
        // Create new employee
        if (!passwordHashStr) throw new Error('Mật khẩu là bắt buộc');
        const created = Database.saveEmployee({ ...employeeData, passwordHash: passwordHashStr });
        Database.saveActivityLog({
          employeeId: state.user?.id || 'system',
          action: 'Tạo nhân viên',
          details: `employeeId=${created.id}; employeeCode=${created.code}; username=${created.username}; role=${created.role}`
        });
        notify('Thêm nhân viên thành công', 'success');
        onSuccess();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Có lỗi xảy ra khi lưu nhân viên';
      notify(errorMessage, 'error');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
            {employee ? 'Sửa nhân viên' : 'Thêm nhân viên mới'}
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
              Mã nhân viên <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              name="code"
              className={`form-control ${errors.code ? 'is-invalid' : ''}`}
              value={formData.code}
              onChange={handleChange}
              placeholder="Tự tạo như NV001"
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
              Tên đăng nhập <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              name="username"
              className={`form-control ${errors.username ? 'is-invalid' : ''}`}
              value={formData.username}
              onChange={handleChange}
              placeholder="Nhập tên đăng nhập"
            />
            {errors.username && (
              <div className="text-danger small mt-1">{errors.username}</div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">
              Mật khẩu {!employee && <span className="text-danger">*</span>}
            </label>
            <input
              type="password"
              name="password"
              className={`form-control ${errors.password ? 'is-invalid' : ''}`}
              value={formData.password}
              onChange={handleChange}
              placeholder={employee ? "Để trống nếu không muốn đổi mật khẩu" : "Nhập mật khẩu"}
            />
            {errors.password && (
              <div className="text-danger small mt-1">{errors.password}</div>
            )}
            {employee && (
              <small className="text-muted">Để trống nếu không muốn thay đổi mật khẩu</small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">
              Vai trò <span className="text-danger">*</span>
            </label>
            <select
              name="role"
              className="form-control"
              value={formData.role}
              onChange={handleChange}
            >
              {EMPLOYEE_ROLES.map(role => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
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
              {employee ? 'Cập nhật' : 'Thêm mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EmployeeForm;

