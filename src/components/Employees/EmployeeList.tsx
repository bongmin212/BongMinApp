import React, { useState, useEffect } from 'react';
import { Employee, EmployeeRole, EMPLOYEE_ROLES } from '../../types';
import { Database } from '../../utils/database';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import EmployeeForm from './EmployeeForm';

const EmployeeList: React.FC = () => {
  const { isManager, state } = useAuth();
  const { notify } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = () => {
    const allEmployees = Database.getEmployees();
    setEmployees(allEmployees);
  };

  const handleCreate = () => {
    setEditingEmployee(null);
    setShowForm(true);
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setShowForm(true);
  };

  const [confirmState, setConfirmState] = useState<null | { message: string; onConfirm: () => void }>(null);

  const handleDelete = (id: string) => {
    setConfirmState({
      message: 'Bạn có chắc chắn muốn xóa nhân viên này?',
      onConfirm: () => {
        const success = Database.deleteEmployee(id);
        if (success) {
          Database.saveActivityLog({
            employeeId: state.user?.id || 'system',
            action: 'Xóa nhân viên',
            details: `employeeId=${id}`
          });
          loadEmployees();
          notify('Xóa nhân viên thành công', 'success');
        } else {
          notify('Không thể xóa nhân viên', 'error');
        }
      }
    });
  };

  const handleFormSubmit = () => {
    setShowForm(false);
    setEditingEmployee(null);
    loadEmployees();
  };

  const toggleSelectAll = (checked: boolean, ids: string[]) => {
    setSelectedIds(checked ? ids : []);
  };

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds(prev => checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id));
  };

  const bulkDelete = () => {
    if (selectedIds.length === 0) return;
    setConfirmState({
      message: `Xóa ${selectedIds.length} nhân viên đã chọn?`,
      onConfirm: () => {
        selectedIds.forEach(id => Database.deleteEmployee(id));
        setSelectedIds([]);
        loadEmployees();
      }
    });
  };

  const getRoleLabel = (role: EmployeeRole) => {
    return EMPLOYEE_ROLES.find(r => r.value === role)?.label || role;
  };

  const filteredEmployees = employees.filter(employee => {
    const normalizedSearch = searchTerm.toLowerCase();
    return employee.username.toLowerCase().includes(normalizedSearch) ||
           (employee.code || '').toLowerCase().includes(normalizedSearch);
  });

  const total = filteredEmployees.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;
  const pageItems = filteredEmployees.slice(start, start + limit);

  if (!isManager()) {
    return (
      <div className="card">
        <div className="alert alert-danger">
          <h4>Không có quyền truy cập</h4>
          <p>Chỉ tài khoản quản lý mới có thể xem danh sách nhân viên.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="d-flex justify-content-between align-items-center">
          <h2 className="card-title">Danh sách nhân viên</h2>
          <div className="d-flex gap-2">
            {selectedIds.length > 0 && (
              <button className="btn btn-danger" onClick={bulkDelete}>Xóa đã chọn ({selectedIds.length})</button>
            )}
            <button
              onClick={handleCreate}
              className="btn btn-primary"
            >
              Thêm nhân viên
            </button>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <input
          type="text"
          className="form-control"
          placeholder="Tìm kiếm nhân viên..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {filteredEmployees.length === 0 ? (
        <div className="text-center py-4">
          <p>Không có nhân viên nào</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={pageItems.length > 0 && pageItems.every(e => selectedIds.includes(e.id))}
                    onChange={(e) => toggleSelectAll(e.target.checked, pageItems.map(e => e.id))}
                  />
                </th>
                <th>Mã nhân viên</th>
                <th>Tên đăng nhập</th>
                <th>Vai trò</th>
                <th>Ngày tạo</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((employee, index) => (
                <tr key={employee.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(employee.id)}
                      onChange={(e) => toggleSelect(employee.id, e.target.checked)}
                    />
                  </td>
                  <td>{employee.code || `NV${index + 1}`}</td>
                  <td>{employee.username}</td>
                  <td>
                    <span className={`customer-type ${employee.role === 'MANAGER' ? 'customer-ctv' : 'customer-retail'}`}>
                      {getRoleLabel(employee.role)}
                    </span>
                  </td>
                  <td>{new Date(employee.createdAt).toLocaleDateString('vi-VN')}</td>
                  <td>
                    <div className="d-flex gap-2">
                      <button
                        onClick={() => handleEdit(employee)}
                        className="btn btn-secondary"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => handleDelete(employee.id)}
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
        <EmployeeForm
          employee={editingEmployee}
          onClose={() => {
            setShowForm(false);
            setEditingEmployee(null);
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

export default EmployeeList;

