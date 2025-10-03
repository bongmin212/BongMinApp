import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Database } from '../../utils/database';

interface LoginFormProps {
  onSuccess?: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const { login, state } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [setupData, setSetupData] = useState({
    username: 'admin',
    password: ''
  });

  useEffect(() => {
    try {
      setIsFirstRun(Database.getEmployees().length === 0);
    } catch {
      setIsFirstRun(false);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.username || !formData.password) {
      setError('Vui lòng nhập đầy đủ thông tin');
      return;
    }

    const success = await login(formData.username, formData.password);
    if (success) {
      onSuccess?.();
    } else {
      setError('Tên đăng nhập hoặc mật khẩu không đúng');
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const username = setupData.username.trim();
      const password = setupData.password;
      if (!username || !password) {
        setError('Nhập username và password cho tài khoản quản lý');
        return;
      }
      // Prevent duplicate username if user somehow has data
      const exists = Database.getEmployees().some(e => e.username === username);
      if (exists) {
        setError('Tên đăng nhập đã tồn tại');
        return;
      }
      const { createPasswordRecord, serializePasswordRecord } = await import('../../utils/auth');
      const rec = await createPasswordRecord(password);
      const passwordHash = serializePasswordRecord(rec);
      Database.saveEmployee({
        code: Database.generateNextEmployeeCode(),
        username,
        password: password, // not stored; just to satisfy type parity if any legacy code reads it
        role: 'MANAGER'
      } as any);
      // Immediately upgrade to hashed field and remove plain password by updating the saved record
      const created = Database.getEmployees().find(e => e.username === username);
      if (created) {
        Database.updateEmployee(created.id, { passwordHash });
      }
      // Auto login after setup
      const ok = await login(username, password);
      if (!ok) throw new Error('Tạo tài khoản xong nhưng đăng nhập thất bại');
      onSuccess?.();
    } catch (err: any) {
      setError(err?.message || 'Không thể tạo tài khoản quản lý');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  if (state.loading) {
    return (
      <div className="modal">
        <div className="modal-content">
          <div className="text-center">
            <div className="loading" style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>⏳</div>
            <div>Đang tải...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal">
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">{isFirstRun ? 'Thiết lập lần đầu' : 'Đăng nhập hệ thống'}</h2>
        </div>
        {error && (
          <div className="alert alert-danger">
            {error}
          </div>
        )}
        {isFirstRun ? (
          <form onSubmit={handleSetup}>
            <div className="form-group">
              <label className="form-label">Tên đăng nhập quản lý</label>
              <input
                type="text"
                name="setup_username"
                className="form-control"
                value={setupData.username}
                onChange={(e) => setSetupData({ ...setupData, username: e.target.value })}
                placeholder="admin"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Mật khẩu</label>
              <input
                type="password"
                name="setup_password"
                className="form-control"
                value={setupData.password}
                onChange={(e) => setSetupData({ ...setupData, password: e.target.value })}
                placeholder="Nhập mật khẩu"
                required
              />
            </div>
            <div className="d-flex justify-content-between align-items-center">
              <button type="submit" className="btn btn-primary" disabled={state.loading}>
                {state.loading ? 'Đang tạo...' : 'Tạo tài khoản quản lý'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Tên đăng nhập</label>
              <input
                type="text"
                name="username"
                className="form-control"
                value={formData.username}
                onChange={handleChange}
                placeholder="Nhập tên đăng nhập"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Mật khẩu</label>
              <input
                type="password"
                name="password"
                className="form-control"
                value={formData.password}
                onChange={handleChange}
                placeholder="Nhập mật khẩu"
                required
              />
            </div>
            <div className="d-flex justify-content-between align-items-center">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={state.loading}
              >
                {state.loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default LoginForm;

