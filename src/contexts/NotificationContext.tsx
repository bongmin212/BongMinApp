import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Notification, NotificationSettings, Order, InventoryItem, ProductPackage, Product, Warranty } from '../types';
import { Database } from '../utils/database';
import { getSupabase } from '../utils/supabaseClient';
import { NotificationSound } from '../utils/notificationSound';
import { DesktopNotification } from '../utils/desktopNotification';

interface NotificationContextValue {
  notifications: Notification[];
  archivedNotifications: Notification[];
  unreadCount: number;
  settings: NotificationSettings;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  archiveNotification: (id: string) => void;
  updateSettings: (settings: Partial<NotificationSettings>) => void;
  refreshNotifications: () => void;
  navigateToNotification: (notification: Notification) => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export const useNotifications = (): NotificationContextValue => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
};

const DEFAULT_SETTINGS: NotificationSettings = {
  expiryWarningDays: 7,
  enableNewOrderNotifications: true,
  enablePaymentReminders: true,
  enableExpiryWarnings: true,
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [archivedNotifications, setArchivedNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(() => {
    // Load settings from localStorage on initialization
    try {
      const stored = localStorage.getItem('notification-settings');
      return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Load read notification IDs from localStorage
  const getReadNotificationIds = useCallback((): Set<string> => {
    try {
      const stored = localStorage.getItem('read-notifications');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  }, []);

  // Save notifications to localStorage as backup
  const saveNotificationsToLocalStorage = useCallback((notifications: Notification[]) => {
    try {
      const notificationsToSave = notifications.map(n => ({
        ...n,
        createdAt: n.createdAt.toISOString()
      }));
      localStorage.setItem('notifications-backup', JSON.stringify(notificationsToSave));
    } catch (error) {
      console.error('Error saving notifications to localStorage:', error);
    }
  }, []);

  // Save archived notifications to localStorage
  const saveArchivedNotificationsToLocalStorage = useCallback((archivedNotifications: Notification[]) => {
    try {
      const archivedToSave = archivedNotifications.map(n => ({
        ...n,
        createdAt: n.createdAt.toISOString()
      }));
      localStorage.setItem('archived-notifications-backup', JSON.stringify(archivedToSave));
    } catch (error) {
      console.error('Error saving archived notifications to localStorage:', error);
    }
  }, []);

  // Load archived notifications from localStorage
  const loadArchivedNotificationsFromLocalStorage = useCallback((): Notification[] => {
    try {
      const stored = localStorage.getItem('archived-notifications-backup');
      if (!stored) return [];
      
      const parsed = JSON.parse(stored);
      return parsed.map((n: any) => ({
        ...n,
        createdAt: new Date(n.createdAt)
      }));
    } catch {
      return [];
    }
  }, []);

  // Load notifications from localStorage backup
  const loadNotificationsFromLocalStorage = useCallback((): Notification[] => {
    try {
      const stored = localStorage.getItem('notifications-backup');
      if (!stored) return [];
      
      const parsed = JSON.parse(stored);
      return parsed.map((n: any) => ({
        ...n,
        createdAt: new Date(n.createdAt)
      }));
    } catch {
      return [];
    }
  }, []);

  // Save read notification IDs to localStorage
  const saveReadNotificationIds = useCallback((readIds: Set<string>) => {
    try {
      localStorage.setItem('read-notifications', JSON.stringify(Array.from(readIds)));
    } catch (error) {
      console.error('Error saving read notifications:', error);
    }
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, isRead: true } : n)
    );
    
    // Persist to localStorage
    const readIds = getReadNotificationIds();
    readIds.add(id);
    saveReadNotificationIds(readIds);
  }, [getReadNotificationIds, saveReadNotificationIds]);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => 
      prev.map(n => ({ ...n, isRead: true }))
    );
    
    // Persist all current notification IDs to localStorage
    const readIds = getReadNotificationIds();
    notifications.forEach(n => readIds.add(n.id));
    saveReadNotificationIds(readIds);
  }, [notifications, getReadNotificationIds, saveReadNotificationIds]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const archiveNotification = useCallback((id: string) => {
    setNotifications(prev => {
      const notificationToArchive = prev.find(n => n.id === id);
      if (notificationToArchive) {
        setArchivedNotifications(archived => {
          const updatedArchived = [...archived, notificationToArchive];
          saveArchivedNotificationsToLocalStorage(updatedArchived);
          return updatedArchived;
        });
      }
      return prev.filter(n => n.id !== id);
    });
  }, [saveArchivedNotificationsToLocalStorage]);

  const updateSettings = useCallback((newSettings: Partial<NotificationSettings>) => {
    setSettings(prev => {
      const updatedSettings = { ...prev, ...newSettings };
      // Persist to localStorage
      try {
        localStorage.setItem('notification-settings', JSON.stringify(updatedSettings));
      } catch (error) {
        console.error('Error saving notification settings:', error);
      }
      return updatedSettings;
    });
  }, []);

  const checkExpiryWarnings = useCallback((orders: Order[], packages: ProductPackage[]): Notification[] => {
    if (!settings.enableExpiryWarnings) return [];

    const warnings: Notification[] = [];
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + settings.expiryWarningDays);

    orders.forEach(order => {
      if (order.status === 'COMPLETED' && order.expiryDate <= warningDate) {
        const packageInfo = packages.find(p => p.id === order.packageId);
        const daysUntilExpiry = Math.ceil((order.expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        
        warnings.push({
          id: `expiry-${order.id}`,
          type: 'EXPIRY_WARNING',
          title: 'Sản phẩm sắp hết hạn',
          message: `Đơn hàng ${order.code} (${packageInfo?.name || 'Unknown'}) sẽ hết hạn trong ${daysUntilExpiry} ngày`,
          priority: daysUntilExpiry <= 3 ? 'high' : daysUntilExpiry <= 7 ? 'medium' : 'low',
          isRead: false,
          createdAt: new Date(),
          relatedId: order.id,
          actionUrl: '/orders'
        });
      }
    });

    return warnings;
  }, [settings]);

  const checkNewOrders = useCallback((orders: Order[]): Notification[] => {
    if (!settings.enableNewOrderNotifications) return [];

    const newOrders: Notification[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    orders.forEach(order => {
      const orderDate = new Date(order.createdAt);
      orderDate.setHours(0, 0, 0, 0);
      
      if (orderDate.getTime() === today.getTime() && order.status === 'PROCESSING') {
        newOrders.push({
          id: `new-order-${order.id}`,
          type: 'NEW_ORDER',
          title: 'Đơn hàng mới',
          message: `Có đơn hàng mới: ${order.code}`,
          priority: 'medium',
          isRead: false,
          createdAt: new Date(),
          relatedId: order.id,
          actionUrl: '/orders'
        });
      }
    });

    return newOrders;
  }, [settings]);

  const checkPaymentReminders = useCallback((orders: Order[]): Notification[] => {
    if (!settings.enablePaymentReminders) return [];

    const reminders: Notification[] = [];
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    orders.forEach(order => {
      if (order.paymentStatus === 'UNPAID' && 
          order.status === 'PROCESSING' && 
          new Date(order.createdAt) <= threeDaysAgo) {
        reminders.push({
          id: `payment-${order.id}`,
          type: 'PAYMENT_REMINDER',
          title: 'Nhắc nhở thanh toán',
          message: `Đơn hàng ${order.code} chưa thanh toán (${Math.ceil((new Date().getTime() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24))} ngày)`,
          priority: 'high',
          isRead: false,
          createdAt: new Date(),
          relatedId: order.id,
          actionUrl: '/orders'
        });
      }
    });

    return reminders;
  }, [settings]);

  const checkProcessingOrders = useCallback((orders: Order[]): Notification[] => {
    const warnings: Notification[] = [];
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    orders.forEach(order => {
      if (order.status === 'PROCESSING' && new Date(order.createdAt) <= oneHourAgo) {
        const hoursProcessing = Math.ceil((new Date().getTime() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60));
        
        warnings.push({
          id: `processing-delay-${order.id}`,
          type: 'PROCESSING_DELAY',
          title: 'Đơn hàng xử lý quá lâu',
          message: `Đơn hàng ${order.code} đang xử lý ${hoursProcessing} giờ`,
          priority: hoursProcessing >= 24 ? 'high' : hoursProcessing >= 4 ? 'medium' : 'low',
          isRead: false,
          createdAt: new Date(),
          relatedId: order.id,
          actionUrl: '/orders'
        });
      }
    });

    return warnings;
  }, []);

  const checkProfileNeedsUpdate = useCallback((inventoryItems: InventoryItem[]): Notification[] => {
    const notifications: Notification[] = [];

    inventoryItems.forEach(item => {
      if (item.isAccountBased && item.profiles) {
        const needsUpdateProfiles = item.profiles.filter(profile => profile.needsUpdate);
        
        if (needsUpdateProfiles.length > 0) {
          notifications.push({
            id: `profile-update-${item.id}`,
            type: 'PROFILE_NEEDS_UPDATE',
            title: 'Profile cần cập nhật',
            message: `${item.code} có ${needsUpdateProfiles.length} profile cần cập nhật`,
            priority: needsUpdateProfiles.length >= 3 ? 'high' : 'medium',
            isRead: false,
            createdAt: new Date(),
            relatedId: item.id,
            actionUrl: '/warehouse'
          });
        }
      }
    });

    return notifications;
  }, []);

  const checkNewWarranties = useCallback((warranties: Warranty[]): Notification[] => {
    const notifications: Notification[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    warranties.forEach(warranty => {
      const warrantyDate = new Date(warranty.createdAt);
      warrantyDate.setHours(0, 0, 0, 0);
      
      if (warrantyDate.getTime() === today.getTime() && warranty.status === 'PENDING') {
        notifications.push({
          id: `new-warranty-${warranty.id}`,
          type: 'NEW_WARRANTY',
          title: 'Bảo hành mới',
          message: `Có yêu cầu bảo hành mới: ${warranty.code}`,
          priority: 'medium',
          isRead: false,
          createdAt: new Date(),
          relatedId: warranty.id,
          actionUrl: '/warranties'
        });
      }
    });

    return notifications;
  }, []);

  const generateNotifications = useCallback(async () => {
    try {
      const [orders, packages, inventoryItems, warranties] = await Promise.all([
        Database.getOrders(),
        Database.getPackages(),
        Database.getInventory(),
        Database.getWarranties()
      ]);

      const allNotifications = [
        ...checkExpiryWarnings(orders, packages),
        ...checkNewOrders(orders),
        ...checkPaymentReminders(orders),
        ...checkProcessingOrders(orders),
        ...checkProfileNeedsUpdate(inventoryItems),
        ...checkNewWarranties(warranties)
      ];

      // Save to Supabase if available
      const sb = getSupabase();
      if (sb) {
        try {
          const currentUser = await sb.auth.getUser();
          if (currentUser.data.user?.id) {
            const userId = currentUser.data.user.id;
            const notificationsToSave = allNotifications.map(notification => ({
              type: notification.type,
              title: notification.title,
              message: notification.message,
              priority: notification.priority,
              is_read: notification.isRead,
              created_at: notification.createdAt.toISOString(),
              related_id: notification.relatedId,
              action_url: notification.actionUrl,
              employee_id: userId
            }));

            // Check for existing notifications to avoid duplicates
            const { data: existingNotifications } = await sb
              .from('notifications')
              .select('id, type, related_id')
              .eq('employee_id', userId);

            const existingIds = new Set(
              existingNotifications?.map(n => `${n.type}-${n.related_id}`) || []
            );

            const newNotifications = notificationsToSave.filter(n => 
              !existingIds.has(`${n.type}-${n.related_id}`)
            );

            if (newNotifications.length > 0) {
              await sb.from('notifications').insert(newNotifications);
            }
          }
        } catch (error) {
          console.error('Error saving notifications to Supabase:', error);
        }
      }

      // Remove duplicates and update existing notifications
      const readIds = getReadNotificationIds();
      setNotifications(prev => {
        // Create a map of existing notifications by their unique key (type + relatedId)
        const existingMap = new Map<string, Notification>();
        prev.forEach(n => {
          const key = `${n.type}-${n.relatedId}`;
          existingMap.set(key, n);
        });

        // Merge new notifications with existing ones
        const mergedNotifications: Notification[] = [];
        const processedKeys = new Set<string>();

        // First, add all existing notifications
        prev.forEach(n => {
          const key = `${n.type}-${n.relatedId}`;
          processedKeys.add(key);
          mergedNotifications.push({
            ...n,
            isRead: readIds.has(n.id) || n.isRead
          });
        });

        // Then add new notifications that don't already exist
        allNotifications.forEach(newNotification => {
          const key = `${newNotification.type}-${newNotification.relatedId}`;
          if (!processedKeys.has(key)) {
            mergedNotifications.push({
              ...newNotification,
              isRead: readIds.has(newNotification.id) || newNotification.isRead
            });
            processedKeys.add(key);
          }
        });
        
        // Save to localStorage as backup
        saveNotificationsToLocalStorage(mergedNotifications);
        
        return mergedNotifications;
      });
    } catch (error) {
      console.error('Error generating notifications:', error);
    }
  }, [checkExpiryWarnings, checkNewOrders, checkPaymentReminders, checkProcessingOrders, checkProfileNeedsUpdate, checkNewWarranties, getReadNotificationIds, saveNotificationsToLocalStorage]);

  const refreshNotifications = useCallback(() => {
    generateNotifications();
  }, [generateNotifications]);

  const navigateToNotification = useCallback((notification: Notification) => {
    // Determine destination tab and optional deep-link params
    let targetTab: 'orders' | 'warehouse' | 'warranties' | 'dashboard' = 'dashboard';
    const params = new URLSearchParams(window.location.search);

    switch (notification.type) {
      case 'EXPIRY_WARNING':
      case 'NEW_ORDER':
      case 'PAYMENT_REMINDER':
      case 'PROCESSING_DELAY': {
        targetTab = 'orders';
        if (notification.relatedId) params.set('orderId', String(notification.relatedId));
        break;
      }
      case 'PROFILE_NEEDS_UPDATE': {
        targetTab = 'warehouse';
        break;
      }
      case 'NEW_WARRANTY': {
        targetTab = 'warranties';
        break;
      }
      default: {
        // Fallback to actionUrl if provided
        if (notification.actionUrl) {
          try {
            const url = new URL(notification.actionUrl, window.location.origin);
            window.history.replaceState(null, '', `${url.pathname}${url.search}`);
          } catch {}
        }
        // Try to infer from actionUrl path
        const path = (notification.actionUrl || '').replace(/^\/*/, '');
        if (path.startsWith('orders')) targetTab = 'orders';
        else if (path.startsWith('warehouse')) targetTab = 'warehouse';
        else if (path.startsWith('warranties')) targetTab = 'warranties';
        else targetTab = 'dashboard';
      }
    }

    // Persist updated search params (keeps existing ones)
    try {
      const s = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${s ? `?${s}` : ''}`);
    } catch {}

    // Detect current active tab by checking the sidebar active state
    const getCurrentActiveTab = (): string => {
      const activeSidebarLink = document.querySelector('.sidebar-link.active');
      if (activeSidebarLink) {
        // Find the parent li element and get the key/id from the button
        const parentLi = activeSidebarLink.closest('li');
        if (parentLi) {
          const button = parentLi.querySelector('button');
          if (button) {
            // The button's onClick handler calls onTabChange(item.id), so we need to infer from the label
            const label = button.querySelector('.sidebar-label')?.textContent;
            if (label) {
              // Map labels to tab IDs
              switch (label) {
                case 'Dashboard': return 'dashboard';
                case 'Đơn hàng': return 'orders';
                case 'Khách hàng': return 'customers';
                case 'Sản phẩm': return 'products';
                case 'Gói sản phẩm': return 'packages';
                case 'Kho hàng': return 'warehouse';
                case 'Bảo hành': return 'warranties';
                case 'Chi phí': return 'expenses';
                case 'Lịch sử hoạt động': return 'activity-logs';
                default: return 'dashboard';
              }
            }
          }
        }
      }
      return 'dashboard'; // fallback
    };

    const currentTab = getCurrentActiveTab();
    const isSameTab = currentTab === targetTab;

    // Switch tab in the SPA
    try {
      if (!isSameTab) {
        window.dispatchEvent(new CustomEvent('app:navigate', { detail: targetTab } as any));
      }
      
      // Dispatch detail event with appropriate timing
      if (notification.relatedId) {
        const dispatchDetailEvent = () => {
          if (targetTab === 'orders') {
            window.dispatchEvent(new CustomEvent('app:viewOrder', { detail: notification.relatedId } as any));
          } else if (targetTab === 'warehouse') {
            window.dispatchEvent(new CustomEvent('app:viewWarehouse', { detail: notification.relatedId } as any));
          } else if (targetTab === 'warranties') {
            window.dispatchEvent(new CustomEvent('app:viewWarranty', { detail: notification.relatedId } as any));
          }
        };

        if (isSameTab) {
          // If already on the target tab, dispatch immediately
          dispatchDetailEvent();
        } else {
          // If switching tabs, wait longer for component to mount and register listeners
          setTimeout(dispatchDetailEvent, 300);
        }
      }
    } catch {}
  }, []);

  const loadNotificationsFromSupabase = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;

    try {
      const currentUser = await sb.auth.getUser();
      if (!currentUser.data.user?.id) return;

      const userId = currentUser.data.user.id;
      const { data: notificationsData, error } = await sb
        .from('notifications')
        .select('*')
        .eq('employee_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading notifications:', error);
        return;
      }

      if (notificationsData) {
        const readIds = getReadNotificationIds();
        const loadedNotifications: Notification[] = notificationsData.map((n: any) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          priority: n.priority,
          isRead: readIds.has(n.id) || n.is_read,
          createdAt: new Date(n.created_at),
          relatedId: n.related_id,
          actionUrl: n.action_url,
          employeeId: n.employee_id
        }));

        // Only set notifications if we don't have any yet (to avoid overwriting)
        setNotifications(prev => {
          if (prev.length === 0) {
            return loadedNotifications;
          }
          // If we already have notifications, merge them
          const existingMap = new Map<string, Notification>();
          prev.forEach(n => {
            const key = `${n.type}-${n.relatedId}`;
            existingMap.set(key, n);
          });

          const mergedNotifications: Notification[] = [...prev];
          loadedNotifications.forEach(loadedNotification => {
            const key = `${loadedNotification.type}-${loadedNotification.relatedId}`;
            if (!existingMap.has(key)) {
              mergedNotifications.push(loadedNotification);
            }
          });

          return mergedNotifications;
        });
      }
    } catch (error) {
      console.error('Error loading notifications from Supabase:', error);
    }
  }, [getReadNotificationIds]);

  // Initialize sound and desktop notifications
  useEffect(() => {
    NotificationSound.init();
    DesktopNotification.requestPermission();
  }, []);

  // Show desktop notification and play sound for new high priority notifications
  useEffect(() => {
    const newHighPriorityNotifications = notifications.filter(n => 
      n.priority === 'high' && !n.isRead
    );

    newHighPriorityNotifications.forEach(async (notification) => {
      // Play sound
      await NotificationSound.playNotificationSound('high');
      
      // Show desktop notification
      await DesktopNotification.show(notification.title, {
        body: notification.message,
        priority: 'high',
        actionUrl: notification.actionUrl
      });
    });
  }, [notifications]);

  // Load notifications from Supabase on mount, then generate new ones
  useEffect(() => {
    const initializeNotifications = async () => {
      // Load archived notifications from localStorage
      const archivedFromStorage = loadArchivedNotificationsFromLocalStorage();
      setArchivedNotifications(archivedFromStorage);
      
      // First try to load existing notifications from Supabase
      await loadNotificationsFromSupabase();
      
      // If no notifications loaded from Supabase, try localStorage backup
      setNotifications(prev => {
        if (prev.length === 0) {
          const backupNotifications = loadNotificationsFromLocalStorage();
          if (backupNotifications.length > 0) {
            const readIds = getReadNotificationIds();
            const notificationsWithReadStatus = backupNotifications.map(n => ({
              ...n,
              isRead: readIds.has(n.id) || n.isRead
            }));
            return notificationsWithReadStatus;
          }
        }
        return prev;
      });
      
      // Then generate new notifications (this will merge with existing ones)
      await generateNotifications();
    };
    
    initializeNotifications();
    
    // Set up interval for generating new notifications every 5 minutes
    const interval = setInterval(generateNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadNotificationsFromSupabase, generateNotifications, loadNotificationsFromLocalStorage, getReadNotificationIds, loadArchivedNotificationsFromLocalStorage]);

  const value = useMemo(() => ({
    notifications,
    archivedNotifications,
    unreadCount,
    settings,
    markAsRead,
    markAllAsRead,
    removeNotification,
    archiveNotification,
    updateSettings,
    refreshNotifications,
    navigateToNotification
  }), [notifications, archivedNotifications, unreadCount, settings, markAsRead, markAllAsRead, removeNotification, archiveNotification, updateSettings, refreshNotifications, navigateToNotification]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
