import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useBadgeCounts } from '../../hooks/useBadgeCounts';
import { getNavItems, NavItem } from './navigation';
import { IconMoreHorizontal } from '../Icons';

interface MobileNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

// Primary navigation items (shown directly in bottom nav)
const PRIMARY_NAV_IDS = ['dashboard', 'orders', 'customers', 'warehouse', 'warranties'];

const MobileNav: React.FC<MobileNavProps> = ({ activeTab, onTabChange }) => {
  const { isManager } = useAuth();
  const badgeCounts = useBadgeCounts();
  const allItems = getNavItems(isManager());
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Split items into primary (shown in nav bar) and secondary (in "More" menu)
  const primaryItems = allItems.filter(item => PRIMARY_NAV_IDS.includes(item.id));
  const secondaryItems = allItems.filter(item => !PRIMARY_NAV_IDS.includes(item.id));

  // Check if current active tab is in secondary items
  const isSecondaryActive = secondaryItems.some(item => item.id === activeTab);

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

  const getTotalSecondaryBadge = (): number => {
    return secondaryItems.reduce((acc, item) => acc + getBadge(item.id), 0);
  };

  const handleItemClick = (id: string) => {
    onTabChange(id);
    setShowMoreMenu(false);
  };

  const renderNavItem = (item: NavItem) => {
    const isActive = activeTab === item.id;
    const count = getBadge(item.id);
    return (
      <button
        key={item.id}
        className={`mobile-nav-item ${isActive ? 'active' : ''}`}
        onClick={() => handleItemClick(item.id)}
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
  };

  return (
    <>
      {/* More Menu Overlay */}
      {showMoreMenu && (
        <div
          className="mobile-more-overlay"
          onClick={() => setShowMoreMenu(false)}
        />
      )}

      {/* More Menu Panel */}
      {showMoreMenu && (
        <div className="mobile-more-menu">
          <div className="mobile-more-menu-header">
            <span>Thêm</span>
            <button
              className="mobile-more-close"
              onClick={() => setShowMoreMenu(false)}
              type="button"
              aria-label="Đóng menu"
            >
              ×
            </button>
          </div>
          <div className="mobile-more-menu-items">
            {secondaryItems.map(item => {
              const isActive = activeTab === item.id;
              const count = getBadge(item.id);
              return (
                <button
                  key={item.id}
                  className={`mobile-more-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleItemClick(item.id)}
                  type="button"
                >
                  <span className="mobile-more-icon">{item.icon}</span>
                  <span className="mobile-more-label">{item.label}</span>
                  {count > 0 && (
                    <span className="mobile-more-badge">{count > 99 ? '99+' : count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="mobile-nav" aria-label="Điều hướng di động">
        {primaryItems.map(renderNavItem)}

        {/* More Button */}
        {secondaryItems.length > 0 && (
          <button
            className={`mobile-nav-item ${isSecondaryActive ? 'active' : ''}`}
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            type="button"
            aria-expanded={showMoreMenu}
            aria-haspopup="true"
          >
            <span className="mobile-nav-icon"><IconMoreHorizontal /></span>
            <span className="mobile-nav-label">Thêm</span>
            {getTotalSecondaryBadge() > 0 && (
              <span className="mobile-nav-badge">
                {getTotalSecondaryBadge() > 99 ? '99+' : getTotalSecondaryBadge()}
              </span>
            )}
          </button>
        )}
      </nav>
    </>
  );
};

export default MobileNav;
