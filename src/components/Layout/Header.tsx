import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { IconMoon, IconSun, IconLogout } from '../Icons';
// import NotificationPanel from '../Notifications/NotificationPanel';

const Header: React.FC = () => {
  const { state, logout, isManager } = useAuth();
  const { theme, toggleTheme } = useTheme();

  if (!state.isAuthenticated || !state.user) {
    return null;
  }

  return (
    <header className="navbar">
      <div className="container">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <a href="/" className="navbar-brand" style={{ 
              background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              transition: 'all 0.3s ease'
            }}>
              BongMin App
            </a>
            <span className="text-muted ms-3" style={{ 
              animation: 'fadeInUp 0.6s ease-out 0.2s both',
              fontSize: '0.95rem'
            }}>
              Xin chào, <strong>{state.user.username}</strong>
            </span>
            <span 
              className={`customer-type ${isManager() ? 'customer-ctv' : 'customer-retail'} ms-2`}
              style={{ 
                animation: 'bounce 0.8s ease-out 0.4s both',
                fontSize: '0.8rem'
              }}
            >
              {isManager() ? 'Quản lý' : 'Nhân viên'}
            </span>
          </div>
          
          <div className="d-flex align-items-center gap-3">
            {/* <div style={{ 
              animation: 'fadeInUp 0.6s ease-out 0.5s both'
            }}>
              <NotificationPanel />
            </div> */}
            <button
              onClick={toggleTheme}
              className="theme-toggle interactive"
              title={`Chuyển sang ${theme === 'light' ? 'dark' : 'light'} mode`}
              style={{ 
                animation: 'fadeInUp 0.6s ease-out 0.6s both'
              }}
            >
              <span className="theme-toggle-icon" style={{ display: 'inline-flex' }}>
                {theme === 'light' ? <IconMoon /> : <IconSun />}
              </span>
              <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
            </button>
            <button
              onClick={logout}
              className="btn btn-secondary interactive"
              style={{ 
                animation: 'fadeInUp 0.6s ease-out 0.7s both'
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <IconLogout />
                <span className="ms-1">Đăng xuất</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;

