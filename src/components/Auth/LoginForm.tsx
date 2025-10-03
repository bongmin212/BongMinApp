import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getSupabase } from '../../utils/supabaseClient';
import { IconLogo } from '../Icons';

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

  useEffect(() => {
    // Supabase-only mode
    setIsFirstRun(false);
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

  // removed first-time setup for Supabase-only mode

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
            <div className="animate-glow" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 72, height: 72, borderRadius: 16, background: 'var(--bg-tertiary)', boxShadow: '0 0 20px rgba(59, 130, 246, 0.25), var(--shadow-md)', marginBottom: '1rem' }}>
              <div className="animate-spin animate-pulse" style={{ animation: 'spin 1.2s linear infinite' }}>
                <IconLogo size={40} className="text-primary" />
              </div>
            </div>
            <div className="wordmark tracking-in" style={{ marginTop: '-4px' }}>BongMin</div>
            <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>Đang tải...</div>
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
        {
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                name="username"
                className="form-control"
                value={formData.username}
                onChange={handleChange}
                placeholder="Nhập email Supabase"
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
        }
      </div>
    </div>
  );
};

export default LoginForm;

