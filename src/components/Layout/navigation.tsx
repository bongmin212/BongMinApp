import React from 'react';
import {
  IconBox,
  IconCart,
  IconChart,
  IconClipboard,
  IconPackage,
  IconReceipt,
  IconShield,
  IconTrendingUp,
  IconUsers
} from '../Icons';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  managerOnly?: boolean;
}

const BASE_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <IconTrendingUp /> },
  { id: 'orders', label: 'Đơn hàng', icon: <IconCart /> },
  { id: 'customers', label: 'Khách hàng', icon: <IconUsers /> },
  { id: 'products', label: 'Sản phẩm', icon: <IconBox /> },
  { id: 'packages', label: 'Gói sản phẩm', icon: <IconPackage /> },
  { id: 'warehouse', label: 'Kho hàng', icon: <IconClipboard /> },
  { id: 'warranties', label: 'Bảo hành', icon: <IconShield /> },
  { id: 'expenses', label: 'Chi phí', icon: <IconReceipt /> },
  { id: 'activity-logs', label: 'Lịch sử hoạt động', icon: <IconChart />, managerOnly: true }
];

export const getNavItems = (canViewManagerItems: boolean): NavItem[] => {
  if (canViewManagerItems) return BASE_ITEMS;
  return BASE_ITEMS.filter(item => !item.managerOnly);
};

