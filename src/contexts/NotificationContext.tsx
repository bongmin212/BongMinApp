import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Notification, NotificationSettings, Order, InventoryItem, ProductPackage, Product } from '../types';
import { Database } from '../utils/database';

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  settings: NotificationSettings;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  updateSettings: (settings: Partial<NotificationSettings>) => void;
  refreshNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export const useNotifications = (): NotificationContextValue => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
};

const DEFAULT_SETTINGS: NotificationSettings = {
  expiryWarningDays: 7,
  lowStockThreshold: 5,
  enableNewOrderNotifications: true,
  enablePaymentReminders: true,
  enableExpiryWarnings: true,
  enableLowStockWarnings: true,
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, isRead: true } : n)
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => 
      prev.map(n => ({ ...n, isRead: true }))
    );
  }, []);

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

  const checkLowStock = useCallback((inventory: InventoryItem[], packages: ProductPackage[], products: Product[]): Notification[] => {
    if (!settings.enableLowStockWarnings) return [];

    const warnings: Notification[] = [];
    // key format: `product:PRODUCT_ID` when shared pool, otherwise `package:PACKAGE_ID`
    const stockCounts = new Map<string, number>();
    const productById = new Map(products.map(p => [p.id, p]));
    const packageById = new Map(packages.map(p => [p.id, p]));

    // Count available stock respecting shared inventory pools
    inventory.forEach(item => {
      if (item.status !== 'AVAILABLE') return;
      const product = productById.get(item.productId);
      const usesSharedPool = !!product?.sharedInventoryPool;
      const key = usesSharedPool ? `product:${item.productId}` : `package:${item.packageId}`;
      const prev = stockCounts.get(key) || 0;
      stockCounts.set(key, prev + 1);
    });

    // Check for low stock
    stockCounts.forEach((count, key) => {
      const [scope, id] = key.split(':');
      if (count > settings.lowStockThreshold) return;

      if (scope === 'product') {
        const prod = productById.get(id);
        const productLabel = prod?.name || id;
        warnings.push({
          id: `low-stock-product-${id}`,
          type: 'LOW_STOCK',
          title: 'Cảnh báo tồn kho thấp',
          message: `Sản phẩm ${productLabel} chỉ còn ${count} sản phẩm trong kho`,
          priority: count === 0 ? 'high' : 'medium',
          isRead: false,
          createdAt: new Date(),
          relatedId: id,
          actionUrl: '/warehouse'
        });
        return;
      }

      const pkg = packageById.get(id);
      const product = pkg ? productById.get(pkg.productId) : undefined;
      const label = pkg && product ? `${pkg.name} · ${product.name}` : (pkg?.name || id);
      warnings.push({
        id: `low-stock-package-${id}`,
        type: 'LOW_STOCK',
        title: 'Cảnh báo tồn kho thấp',
        message: `Gói ${label} chỉ còn ${count} sản phẩm trong kho`,
        priority: count === 0 ? 'high' : 'medium',
        isRead: false,
        createdAt: new Date(),
        relatedId: id,
        actionUrl: '/warehouse'
      });
    });

    return warnings;
  }, [settings]);

  const generateNotifications = useCallback(async () => {
    try {
      const [orders, packages, inventory, products] = await Promise.all([
        Database.getOrders(),
        Database.getPackages(),
        Database.getInventory(),
        Database.getProducts()
      ]);

      const allNotifications = [
        ...checkExpiryWarnings(orders, packages),
        ...checkNewOrders(orders),
        ...checkPaymentReminders(orders),
        ...checkLowStock(inventory, packages, products)
      ];

      // Remove duplicates and update existing notifications
      setNotifications(prev => {
        const existingIds = new Set(prev.map(n => n.id));
        const newNotifications = allNotifications.filter(n => !existingIds.has(n.id));
        return [...prev, ...newNotifications];
      });
    } catch (error) {
      console.error('Error generating notifications:', error);
    }
  }, [checkExpiryWarnings, checkNewOrders, checkPaymentReminders, checkLowStock]);

  const refreshNotifications = useCallback(() => {
    generateNotifications();
  }, [generateNotifications]);

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
    refreshNotifications
  }), [notifications, unreadCount, settings, markAsRead, markAllAsRead, removeNotification, updateSettings, refreshNotifications]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
