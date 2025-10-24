import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNotifications } from '../../contexts/NotificationContext';
import { Notification } from '../../types';
import { 
  IconBell, 
  IconAlertTriangle, 
  IconClock, 
  IconPackage, 
  IconCreditCard, 
  IconX,
  IconShield,
  IconSettings,
  IconChevronDown,
  IconChevronUp
} from '../Icons';

const NotificationPanel: React.FC = () => {
  const { 
    notifications, 
    archivedNotifications,
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    archiveNotification,
    navigateToNotification
  } = useNotifications();
  
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 768px)').matches;
  }, []);

  // Lock body scroll when the notification panel is open on mobile
  useEffect(() => {
    if (!isMobile) return;
    if (isOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [isOpen, isMobile]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'EXPIRY_WARNING':
        return <IconClock className="text-orange-500" />;
      case 'NEW_ORDER':
        return <IconPackage className="text-blue-500" />;
      case 'PAYMENT_REMINDER':
        return <IconCreditCard className="text-red-500" />;
      case 'PROCESSING_DELAY':
        return <IconAlertTriangle className="text-red-600" />;
      case 'PROFILE_NEEDS_UPDATE':
        return <IconSettings className="text-purple-500" />;
      case 'NEW_WARRANTY':
        return <IconShield className="text-green-500" />;
      default:
        return <IconBell className="text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'border-l-red-500 bg-red-50 dark:bg-red-900/20';
      case 'medium':
        return 'border-l-orange-500 bg-orange-50 dark:bg-orange-900/20';
      case 'low':
        return 'border-l-blue-500 bg-blue-50 dark:bg-blue-900/20';
      default:
        return 'border-l-gray-500 bg-gray-50 dark:bg-gray-900/20';
    }
  };

  const getActionButtonText = (type: string) => {
    switch (type) {
      case 'EXPIRY_WARNING':
      case 'NEW_ORDER':
      case 'PAYMENT_REMINDER':
      case 'PROCESSING_DELAY':
        return 'Xem đơn';
      case 'PROFILE_NEEDS_UPDATE':
        return 'Xem kho';
      case 'NEW_WARRANTY':
        return 'Xem bảo hành';
      default:
        return 'Xem chi tiết';
    }
  };


  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) {
      return `${minutes} phút trước`;
    } else if (hours < 24) {
      return `${hours} giờ trước`;
    } else {
      return `${days} ngày trước`;
    }
  };

  // Get current notifications based on active tab
  const currentNotifications = useMemo(() => {
    return activeTab === 'active' ? notifications : archivedNotifications;
  }, [activeTab, notifications, archivedNotifications]);

  // Filter notifications
  const filteredNotifications = useMemo(() => {
    return currentNotifications.filter(notification => {
      if (filterType !== 'all' && notification.type !== filterType) return false;
      if (filterPriority !== 'all' && notification.priority !== filterPriority) return false;
      return true;
    }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); // Sort by time (latest to earliest)
  }, [currentNotifications, filterType, filterPriority]);

  // Group notifications by type (only for active notifications)
  const groupedNotifications = useMemo((): Array<[string, Notification[]]> => {
    if (activeTab === 'archived') {
      // For archived notifications, return as a single group
      return [['archived', filteredNotifications]];
    }

    const groups: { [key: string]: Notification[] } = {};
    
    filteredNotifications.forEach(notification => {
      if (!groups[notification.type]) {
        groups[notification.type] = [];
      }
      groups[notification.type].push(notification);
    });

    // Sort groups by priority and count
    return Object.entries(groups).sort(([, a], [, b]) => {
      const aHigh = a.filter(n => n.priority === 'high').length;
      const bHigh = b.filter(n => n.priority === 'high').length;
      if (aHigh !== bHigh) return bHigh - aHigh;
      return b.length - a.length;
    });
  }, [filteredNotifications, activeTab]);

  const toggleGroup = (type: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(type)) {
      newExpanded.delete(type);
    } else {
      newExpanded.add(type);
    }
    setExpandedGroups(newExpanded);
  };

  const dropdown = isOpen ? (
    <>
      {/* click-away overlay on mobile to ensure proper stacking and outside-click */}
      {isMobile && (
        <div
          className="notification-overlay"
          onClick={() => setIsOpen(false)}
        />
      )}
      <div className={`notification-dropdown${isMobile ? ' mobile' : ''}`}>
        <div className="notification-header">
          <h3 className="notification-title">
            Thông báo
          </h3>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && activeTab === 'active' && (
              <button
                onClick={markAllAsRead}
                className="notification-mark-all"
              >
                Đánh dấu tất cả đã đọc
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="notification-tabs">
          <button
            onClick={() => setActiveTab('active')}
            className={`notification-tab ${activeTab === 'active' ? 'active' : ''}`}
          >
            Hoạt động ({notifications.length})
          </button>
          <button
            onClick={() => setActiveTab('archived')}
            className={`notification-tab ${activeTab === 'archived' ? 'active' : ''}`}
          >
            Lưu trữ ({archivedNotifications.length})
          </button>
        </div>

        {/* Filter Controls */}
        <div className="notification-filters">
          <div className="filter-group">
            <label className="filter-label">Loại:</label>
            <select 
              value={filterType} 
              onChange={(e) => setFilterType(e.target.value)}
              className="filter-select"
            >
              <option value="all">Tất cả</option>
              <option value="EXPIRY_WARNING">Sắp hết hạn</option>
              <option value="NEW_ORDER">Đơn hàng mới</option>
              <option value="PAYMENT_REMINDER">Thanh toán</option>
              <option value="PROCESSING_DELAY">Xử lý chậm</option>
              <option value="PROFILE_NEEDS_UPDATE">Profile cần cập nhật</option>
              <option value="NEW_WARRANTY">Bảo hành</option>
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label">Ưu tiên:</label>
            <select 
              value={filterPriority} 
              onChange={(e) => setFilterPriority(e.target.value)}
              className="filter-select"
            >
              <option value="all">Tất cả</option>
              <option value="high">Cao</option>
              <option value="medium">Trung bình</option>
              <option value="low">Thấp</option>
            </select>
          </div>
        </div>

        <div className="notification-list">
          {groupedNotifications.length === 0 ? (
            <div className="notification-empty">
              <IconBell size={48} className="notification-empty-icon" />
              <p>Không có thông báo nào</p>
            </div>
          ) : (
            <div>
              {groupedNotifications.map(([type, groupNotifications]) => {
                const isExpanded = expandedGroups.has(type);
                const unreadCount = groupNotifications.filter(n => !n.isRead).length;
                const totalCount = groupNotifications.length;
                
                return (
                  <div key={type} className="notification-group">
                    {activeTab === 'archived' ? (
                      // For archived tab, show all notifications without grouping
                      <div className="notification-group-content">
                        {groupNotifications.map((notification) => (
                          <div
                            key={notification.id}
                            className={`notification-item ${getPriorityColor(notification.priority)} ${
                              !notification.isRead ? 'unread' : ''
                            }`}
                          >
                            <div className="notification-content">
                              <div className="notification-icon">
                                {getNotificationIcon(notification.type)}
                              </div>
                              <div className="notification-details">
                                <div className="notification-item-header">
                                  <p className="notification-item-title">
                                    {notification.title}
                                  </p>
                                  <div className="flex items-center space-x-2">
                                    <span className="notification-item-time">
                                      {formatTime(notification.createdAt)}
                                    </span>
                                  </div>
                                </div>
                                <p className="notification-item-message">
                                  {notification.message}
                                </p>
                                <div className="notification-actions">
                                  <button
                                    onClick={() => navigateToNotification(notification)}
                                    className="notification-action-button"
                                  >
                                    {getActionButtonText(notification.type)}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      // For active tab, show grouped notifications
                      <>
                        <div 
                          className="notification-group-header"
                          onClick={() => toggleGroup(type)}
                        >
                          <div className="flex items-center gap-2">
                            {getNotificationIcon(type)}
                            <span className="notification-group-title">
                              {type === 'EXPIRY_WARNING' && 'Sắp hết hạn'}
                              {type === 'NEW_ORDER' && 'Đơn hàng mới'}
                              {type === 'PAYMENT_REMINDER' && 'Thanh toán'}
                              {type === 'PROCESSING_DELAY' && 'Xử lý chậm'}
                              {type === 'PROFILE_NEEDS_UPDATE' && 'Profile cần cập nhật'}
                              {type === 'NEW_WARRANTY' && 'Bảo hành'}
                            </span>
                            <span className="notification-group-count">
                              {unreadCount > 0 && `${unreadCount}/`}{totalCount}
                            </span>
                          </div>
                          <div className="notification-group-toggle">
                            {isExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                          </div>
                        </div>
                    
                    {isExpanded && (
                      <div className="notification-group-content">
                        {groupNotifications.map((notification) => (
                          <div
                            key={notification.id}
                            className={`notification-item ${getPriorityColor(notification.priority)} ${
                              !notification.isRead ? 'unread' : ''
                            }`}
                          >
                            <div className="notification-content">
                              <div className="notification-icon">
                                {getNotificationIcon(notification.type)}
                              </div>
                              <div className="notification-details">
                                <div className="notification-item-header">
                                  <p className="notification-item-title">
                                    {notification.title}
                                  </p>
                                  <div className="flex items-center space-x-2">
                                    <span className="notification-item-time">
                                      {formatTime(notification.createdAt)}
                                    </span>
                                    <button
                                      onClick={() => archiveNotification(notification.id)}
                                      className="notification-remove"
                                    >
                                      <IconX size={14} />
                                    </button>
                                  </div>
                                </div>
                                <p className="notification-item-message">
                                  {notification.message}
                                </p>
                                <div className="notification-actions">
                                  {!notification.isRead && (
                                    <button
                                      onClick={() => markAsRead(notification.id)}
                                      className="notification-mark-read"
                                    >
                                      Đánh dấu đã đọc
                                    </button>
                                  )}
                                  <button
                                    onClick={() => navigateToNotification(notification)}
                                    className="notification-action-button"
                                  >
                                    {getActionButtonText(notification.type)}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  ) : null;

  return (
    <div className="notification-panel">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="notification-toggle interactive"
        title="Thông báo"
      >
        <span className="notification-toggle-icon" style={{ display: 'inline-flex' }}>
          <IconBell size={18} />
        </span>
        <span>Thông báo</span>
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isMobile ? createPortal(dropdown, document.body) : dropdown}
    </div>
  );
};

export default NotificationPanel;
