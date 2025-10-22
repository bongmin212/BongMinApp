import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Notification, NotificationSettings, Order, InventoryItem, ProductPackage, Product, Warranty } from '../types';
import { Database } from '../utils/database';
import { getSupabase } from '../utils/supabaseClient';
import { NotificationSound } from '../utils/notificationSound';
import { DesktopNotification } from '../utils/desktopNotification';

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  settings: NotificationSettings;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
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
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);

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

  const updateSettings = useCallback((newSettings: Partial<NotificationSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
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
        const existingIds = new Set(prev.map(n => n.id));
        const newNotifications = allNotifications.filter(n => !existingIds.has(n.id));
        
        // Mark notifications as read if they're in localStorage
        const allNotificationsWithReadStatus = [...prev, ...newNotifications].map(n => ({
          ...n,
          isRead: readIds.has(n.id) || n.isRead
        }));
        
        return allNotificationsWithReadStatus;
      });
    } catch (error) {
      console.error('Error generating notifications:', error);
    }
  }, [checkExpiryWarnings, checkNewOrders, checkPaymentReminders, checkProcessingOrders, checkProfileNeedsUpdate, checkNewWarranties, getReadNotificationIds]);

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

    // Switch tab in the SPA
    try {
      window.dispatchEvent(new CustomEvent('app:navigate', { detail: targetTab } as any));
      
      // If we're already on the target tab and have a relatedId, dispatch a specific event
      if (notification.relatedId) {
        setTimeout(() => {
          if (targetTab === 'orders') {
            window.dispatchEvent(new CustomEvent('app:viewOrder', { detail: notification.relatedId } as any));
          } else if (targetTab === 'warehouse') {
            window.dispatchEvent(new CustomEvent('app:viewWarehouse', { detail: notification.relatedId } as any));
          } else if (targetTab === 'warranties') {
            window.dispatchEvent(new CustomEvent('app:viewWarranty', { detail: notification.relatedId } as any));
          }
        }, 100);
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

        setNotifications(loadedNotifications);
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

  // Load notifications from Supabase on mount
  useEffect(() => {
    loadNotificationsFromSupabase();
  }, [loadNotificationsFromSupabase]);

  // Generate notifications on mount and every 5 minutes
  useEffect(() => {
    generateNotifications();
    const interval = setInterval(generateNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [generateNotifications]);

  const value = useMemo(() => ({
    notifications,
    unreadCount,
    settings,
    markAsRead,
    markAllAsRead,
    removeNotification,
    updateSettings,
    refreshNotifications,
    navigateToNotification
  }), [notifications, unreadCount, settings, markAsRead, markAllAsRead, removeNotification, updateSettings, refreshNotifications, navigateToNotification]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
