import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useBadgeCounts } from '../../hooks/useBadgeCounts';
import { IconBox, IconClipboard, IconUsers, IconCart, IconChart, IconTrendingUp, IconReceipt, IconPackage, IconShield } from '../Icons';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  const { isManager } = useAuth();
  const badgeCounts = useBadgeCounts();

  const getBadgeCount = (itemId: string): number => {
    switch (itemId) {
      case 'orders':
        return badgeCounts.orders;
      case 'warehouse':
        return badgeCounts.warehouse;
      case 'warranties':
        return badgeCounts.warranties;
      default:
        return 0;
    }
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <IconTrendingUp /> },
    { id: 'orders', label: 'Đơn hàng', icon: <IconCart /> },
    { id: 'customers', label: 'Khách hàng', icon: <IconUsers /> },
    { id: 'products', label: 'Sản phẩm', icon: <IconBox /> },
    { id: 'packages', label: 'Gói sản phẩm', icon: <IconPackage /> },
    { id: 'warehouse', label: 'Kho hàng', icon: <IconClipboard /> },
    { id: 'warranties', label: 'Bảo hành', icon: <IconShield /> },
    { id: 'expenses', label: 'Chi phí', icon: <IconReceipt /> },
    // Chỉ còn Lịch sử hoạt động cho quản lý
    ...(isManager() ? [ { id: 'activity-logs', label: 'Lịch sử hoạt động', icon: <IconChart /> } ] : [])
  ];

  return (
    <div className="sidebar">
      <nav>
        <ul className="sidebar-nav">
          {menuItems.map((item, index) => (
            <li 
              key={item.id}
              style={{ 
                animation: `slideInLeft 0.4s ease-out ${index * 0.1}s both`,
                animationFillMode: 'both'
              }}
            >
              <button
                className={`sidebar-link ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => { try { window.history.replaceState(null, '', window.location.pathname); } catch {}; onTabChange(item.id); }}
                style={{ 
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                  overflow: 'hidden',
                  gap: '12px'
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {item.icon}
                </span>
                <span 
                  className={`sidebar-label ${item.id === 'activity-logs' ? 'sidebar-label-2' : 'sidebar-label-1'}`}
                  style={{ fontWeight: '500' }}
                >
                  {item.label}
                </span>
                {(() => {
                  const count = getBadgeCount(item.id);
                  return count > 0 && (
                    <span className="sidebar-notification-badge">
                      {count > 99 ? '99+' : count}
                    </span>
                  );
                })()}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;

