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
      // Error saving notifications to localStorage - ignore
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
      // Error saving archived notifications to localStorage - ignore
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
      // Error saving read notifications - ignore
    }
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, isRead: true } : n)
    );
    
    // Persist to localStorage
    const readIds = getReadNotificationIds();
    readIds.add(id);
    saveReadNotificationIds(readIds);

    // Update in Supabase
    const sb = getSupabase();
    if (sb) {
      try {
        const currentUser = await sb.auth.getUser();
        if (currentUser.data.user?.id) {
          await sb
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id)
            .eq('employee_id', currentUser.data.user.id);
        }
      } catch (error) {
        // Error updating notification read status - ignore
      }
    }
  }, [getReadNotificationIds, saveReadNotificationIds]);

  const markAllAsRead = useCallback(async () => {
    setNotifications(prev => 
      prev.map(n => ({ ...n, isRead: true }))
    );
    
    // Persist all current notification IDs to localStorage
    const readIds = getReadNotificationIds();
    notifications.forEach(n => readIds.add(n.id));
    saveReadNotificationIds(readIds);

    // Update in Supabase
    const sb = getSupabase();
    if (sb) {
      try {
        const currentUser = await sb.auth.getUser();
        if (currentUser.data.user?.id) {
          await sb
            .from('notifications')
            .update({ is_read: true })
            .eq('employee_id', currentUser.data.user.id)
            .is('archived_at', null);
        }
      } catch (error) {
        // Error updating all notifications read status - ignore
      }
    }
  }, [notifications, getReadNotificationIds, saveReadNotificationIds]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const archiveNotification = useCallback(async (id: string) => {
    setNotifications(prev => {
      const notificationToArchive = prev.find(n => n.id === id);
      if (notificationToArchive) {
        const archivedNotification = { ...notificationToArchive, archivedAt: new Date() };
        setArchivedNotifications(archived => {
          const updatedArchived = [...archived, archivedNotification];
          saveArchivedNotificationsToLocalStorage(updatedArchived);
          return updatedArchived;
        });
      }
      return prev.filter(n => n.id !== id);
    });

    // Update in Supabase
    const sb = getSupabase();
    if (sb) {
      try {
        const currentUser = await sb.auth.getUser();
        if (currentUser.data.user?.id) {
          await sb
            .from('notifications')
            .update({ 
              is_read: true,
              archived_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('employee_id', currentUser.data.user.id);
        }
      } catch (error) {
        // Error archiving notification - ignore
      }
    }
  }, [saveArchivedNotificationsToLocalStorage]);

  const updateSettings = useCallback((newSettings: Partial<NotificationSettings>) => {
    setSettings(prev => {
      const updatedSettings = { ...prev, ...newSettings };
      // Persist to localStorage
      try {
        localStorage.setItem('notification-settings', JSON.stringify(updatedSettings));
      } catch (error) {
        // Error saving notification settings - ignore
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
          order.status === 'COMPLETED' && 
          new Date(order.createdAt) <= threeDaysAgo) {
        reminders.push({
          id: `payment-${order.id}`,
          type: 'PAYMENT_REMINDER',
          title: 'Nhắc nhở thanh toán',
          message: `Đơn hàng ${order.code} đã hoàn thành nhưng chưa thanh toán (${Math.ceil((new Date().getTime() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24))} ngày)`,
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
              .select('id, type, related_id, archived_at, message')
              .eq('employee_id', userId);

            const existingKeys = new Set(
              existingNotifications?.map(n => `${n.type}-${n.related_id}`) || []
            );

            // Separate new notifications from updates
            const newNotifications = notificationsToSave.filter(n => 
              !existingKeys.has(`${n.type}-${n.related_id}`)
            );

            // Update existing notifications with new content (especially for expiry warnings)
            const updatePromises = notificationsToSave
              .filter(n => existingKeys.has(`${n.type}-${n.related_id}`))
              .map(async (notification) => {
                const existingNotification = existingNotifications?.find(
                  n => `${n.type}-${n.related_id}` === `${notification.type}-${notification.related_id}`
                );
                
                // Only update if message content has changed (for expiry warnings, this means days remaining changed)
                if (existingNotification && existingNotification.message !== notification.message) {
                  return sb
                    .from('notifications')
                    .update({ 
                      message: notification.message,
                      priority: notification.priority,
                      created_at: notification.created_at
                    })
                    .eq('id', existingNotification.id);
                }
                return Promise.resolve();
              });

            // Execute updates
            await Promise.all(updatePromises.filter(p => p !== undefined));

            // Insert new notifications
            if (newNotifications.length > 0) {
              await sb.from('notifications').insert(newNotifications);
            }
          }
        } catch (error) {
          // Error saving notifications to Supabase - ignore
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

        // Merge new notifications with existing ones, updating content for existing ones
        const finalMap = new Map<string, Notification>();

        // First, add all existing notifications
        prev.forEach(n => {
          const key = `${n.type}-${n.relatedId}`;
          finalMap.set(key, {
            ...n,
            isRead: readIds.has(n.id) || n.isRead
          });
        });

        // Then update/add new notifications (this will update content for existing ones)
        allNotifications.forEach(newNotification => {
          const key = `${newNotification.type}-${newNotification.relatedId}`;
          finalMap.set(key, {
            ...newNotification,
            isRead: readIds.has(newNotification.id) || newNotification.isRead
          });
        });
        
        const mergedNotifications = Array.from(finalMap.values());
        
        // Save to localStorage as backup
        saveNotificationsToLocalStorage(mergedNotifications);
        
        return mergedNotifications;
      });
    } catch (error) {
      // Error generating notifications - ignore
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
      
      // Load active notifications (not archived)
      const { data: activeNotificationsData, error: activeError } = await sb
        .from('notifications')
        .select('*')
        .eq('employee_id', userId)
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      // Load archived notifications
      const { data: archivedNotificationsData, error: archivedError } = await sb
        .from('notifications')
        .select('*')
        .eq('employee_id', userId)
        .not('archived_at', 'is', null)
        .order('created_at', { ascending: false });

      if (activeError || archivedError) {
        // Error loading notifications - ignore
        return;
      }

      // Clear localStorage backup if database is empty
      // This prevents old notifications from reappearing after DB clear
      if (activeNotificationsData && activeNotificationsData.length === 0) {
        localStorage.removeItem('notifications-backup');
        localStorage.removeItem('read-notifications');
        localStorage.removeItem('archived-notifications-backup');
      }

      if (activeNotificationsData) {
        const readIds = getReadNotificationIds();
        const loadedActiveNotifications: Notification[] = activeNotificationsData.map((n: any) => ({
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

        // Merge with existing notifications, updating content for existing ones
        setNotifications(prev => {
          // Create a map of existing notifications by their unique key
          const existingMap = new Map<string, Notification>();
          prev.forEach(n => {
            const key = `${n.type}-${n.relatedId}`;
            existingMap.set(key, n);
          });

          // Merge loaded notifications with existing ones
          const finalMap = new Map<string, Notification>();
          
          // First, add all existing notifications
          prev.forEach(n => {
            const key = `${n.type}-${n.relatedId}`;
            finalMap.set(key, n);
          });

          // Then update/add loaded notifications (this will update content for existing ones)
          loadedActiveNotifications.forEach(loadedNotification => {
            const key = `${loadedNotification.type}-${loadedNotification.relatedId}`;
            finalMap.set(key, loadedNotification);
          });

          return Array.from(finalMap.values());
        });
      }

      if (archivedNotificationsData) {
        const loadedArchivedNotifications: Notification[] = archivedNotificationsData.map((n: any) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          priority: n.priority,
          isRead: true, // Archived notifications are always read
          createdAt: new Date(n.created_at),
          relatedId: n.related_id,
          actionUrl: n.action_url,
          employeeId: n.employee_id,
          archivedAt: n.archived_at ? new Date(n.archived_at) : undefined
        }));

        setArchivedNotifications(loadedArchivedNotifications);
        saveArchivedNotificationsToLocalStorage(loadedArchivedNotifications);
      }
    } catch (error) {
      // Error loading notifications from Supabase - ignore
    }
  }, [getReadNotificationIds, saveArchivedNotificationsToLocalStorage]);

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
      
      // Then generate new notifications (this will merge with existing ones)
      await generateNotifications();
    };
    
    initializeNotifications();
    
    // Set up interval for generating new notifications every 5 minutes
    const interval = setInterval(generateNotifications, 5 * 60 * 1000);
    
    // Listen for realtime notification changes
    const handleNotificationRefresh = () => {
      loadNotificationsFromSupabase();
    };
    
    window.addEventListener('notifications:refresh', handleNotificationRefresh);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('notifications:refresh', handleNotificationRefresh);
    };
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
