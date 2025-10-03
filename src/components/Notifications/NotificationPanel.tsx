import React, { useState } from 'react';
import { useNotifications } from '../../contexts/NotificationContext';
import { 
  IconBell, 
  IconAlertTriangle, 
  IconClock, 
  IconPackage, 
  IconCreditCard, 
  IconX
} from '../Icons';

const NotificationPanel: React.FC = () => {
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    removeNotification 
  } = useNotifications();
  
  const [isOpen, setIsOpen] = useState(false);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'EXPIRY_WARNING':
        return <IconClock className="text-orange-500" />;
      case 'NEW_ORDER':
        return <IconPackage className="text-blue-500" />;
      case 'PAYMENT_REMINDER':
        return <IconCreditCard className="text-red-500" />;
      case 'LOW_STOCK':
        return <IconAlertTriangle className="text-yellow-500" />;
      default:
        return <IconBell className="text-gray-500" />;
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

  const sortedNotifications = [...notifications].sort((a, b) => {
    // Sort by priority first, then by date
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
    const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
    
    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }
    
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

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
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          <div className="notification-dropdown">
            <div className="notification-header">
              <h3 className="notification-title">
                Thông báo
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="notification-mark-all"
                >
                  Đánh dấu tất cả đã đọc
                </button>
              )}
            </div>

            <div className="notification-list">
              {sortedNotifications.length === 0 ? (
                <div className="notification-empty">
                  <IconBell size={48} className="notification-empty-icon" />
                  <p>Không có thông báo nào</p>
                </div>
              ) : (
                <div>
                  {sortedNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`notification-item ${notification.priority}-priority ${
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
                                onClick={() => removeNotification(notification.id)}
                                className="notification-remove"
                              >
                                <IconX size={14} />
                              </button>
                            </div>
                          </div>
                          <p className="notification-item-message">
                            {notification.message}
                          </p>
                          {!notification.isRead && (
                            <div className="notification-actions">
                              <button
                                onClick={() => markAsRead(notification.id)}
                                className="notification-mark-read"
                              >
                                Đánh dấu đã đọc
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationPanel;
