import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useBadgeCounts } from '../../hooks/useBadgeCounts';
import { getNavItems } from './navigation';

interface MobileNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const MobileNav: React.FC<MobileNavProps> = ({ activeTab, onTabChange }) => {
  const { isManager } = useAuth();
  const badgeCounts = useBadgeCounts();
  const items = getNavItems(isManager());

  const getBadge = (id: string): number => {
    switch (id) {
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

  return (
    <nav className="mobile-nav" aria-label="Điều hướng di động">
      {items.map(item => {
        const isActive = activeTab === item.id;
        const count = getBadge(item.id);
        return (
          <button
            key={item.id}
            className={`mobile-nav-item ${isActive ? 'active' : ''}`}
            onClick={() => onTabChange(item.id)}
            type="button"
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="mobile-nav-icon">{item.icon}</span>
            <span className="mobile-nav-label">{item.label}</span>
            {count > 0 && (
              <span className="mobile-nav-badge">{count > 99 ? '99+' : count}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
};

export default MobileNav;

