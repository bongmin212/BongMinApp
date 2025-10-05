// Database schema types
export interface Product {
  id: string;
  code: string; // Mã sản phẩm cố định
  name: string;
  description?: string;
  // If true, all packages under this product share the same inventory pool
  sharedInventoryPool?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductPackage {
  id: string;
  code: string; // Mã gói sản phẩm cố định
  productId: string;
  name: string;
  warrantyPeriod: number; // in months, 24 for "vĩnh viễn"
  costPrice: number; // Giá gốc (giá vốn)
  ctvPrice: number; // Giá cộng tác viên
  retailPrice: number; // Giá khách lẻ
  customFields?: PackageCustomField[]; // Trường tùy chỉnh yêu cầu khi tạo đơn
  // Account-based config (managed at package level)
  isAccountBased?: boolean;
  accountColumns?: InventoryAccountColumn[]; // definition + includeInOrderInfo flag
  defaultSlots?: number; // default profiles per inventory item
  createdAt: Date;
  updatedAt: Date;
}

export interface PackageCustomField {
  id: string;
  title: string; // Nhãn hiển thị, ví dụ: "Email Youtube muốn nâng cấp"
  placeholder?: string; // Gợi ý nội dung/placeholder cho ô nhập ở đơn hàng
}

export type CustomerType = 'CTV' | 'RETAIL'; // Cộng Tác Viên | Khách Lẻ
export type CustomerSource = 'FACEBOOK' | 'TELEGRAM' | 'PAGE' | 'WEB' | 'ZALO';

export interface Customer {
  id: string;
  code: string; // Mã khách hàng cố định
  name: string;
  type: CustomerType;
  phone?: string;
  email?: string;
  source?: CustomerSource;
  sourceDetail?: string; // Chi tiết nguồn khách
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type OrderStatus = 'PROCESSING' | 'COMPLETED' | 'CANCELLED';

export type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED';

export interface Order {
  id: string;
  code: string; // Mã đơn hàng cố định
  purchaseDate: Date;
  packageId: string;
  customerId: string;
  expiryDate: Date; // Tự động tính từ ngày mua + thời hạn gói
  status: OrderStatus;
  paymentStatus: PaymentStatus; // Trạng thái thanh toán
  orderInfo?: string; // Thông tin đơn hàng (serial/key/tài khoản...)
  notes?: string;
  createdBy: string; // ID nhân viên tạo đơn
  createdAt: Date;
  updatedAt: Date;
  inventoryItemId?: string; // Liên kết tới kho hàng nếu có
  inventoryProfileId?: string; // Nếu là tài khoản nhiều profile, id profile đã cấp
  useCustomPrice?: boolean; // Sử dụng giá tùy chỉnh
  customPrice?: number; // Giá tùy chỉnh
  customFieldValues?: Record<string, string>; // key = PackageCustomField.id -> value nhập khi tạo đơn
  // Gia hạn
  renewals?: OrderRenewal[]; // lịch sử gia hạn
  // UI/CRM flags
  renewalMessageSent?: boolean; // Đã gửi tin nhắn gia hạn cho đơn này
  renewalMessageSentBy?: string; // nhân viên đã gửi
  renewalMessageSentAt?: Date; // thời điểm đã gửi
}

export type EmployeeRole = 'MANAGER' | 'EMPLOYEE';

export interface Employee {
  id: string;
  code: string; // Mã nhân viên cố định
  username: string;
  passwordHash: string;
  role: EmployeeRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActivityLog {
  id: string;
  employeeId: string;
  action: string; // Mô tả hành động
  details?: string; // Chi tiết thêm
  timestamp: Date;
}

// Warehouse / Inventory
export type InventoryStatus = 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'EXPIRED';

export interface InventoryAccountColumn {
  id: string; // stable key
  title: string; // e.g., Email, Pass, Hướng dẫn
  includeInOrderInfo?: boolean; // tick to auto import into orderInfo
}

export interface InventoryProfileSlot {
  id: string; // profile id (e.g., slot-1)
  label: string; // e.g., Profile 1
  isAssigned: boolean;
  assignedOrderId?: string;
  assignedAt?: Date;
  expiryAt?: Date; // mirror the linked order expiry to auto-release
}

export interface InventoryItem {
  id: string;
  code: string; // Mã kho hàng cố định
  productId: string;
  packageId: string;
  purchaseDate: Date;
  expiryDate: Date;
  sourceNote?: string; // Nhập từ nguồn (tự do)
  purchasePrice?: number; // Giá mua
  productInfo?: string; // Thông tin sản phẩm nhập kho (serial/key/tài khoản...)
  notes?: string; // Ghi chú nội bộ cho sản phẩm trong kho
  status: InventoryStatus;
  linkedOrderId?: string; // Nếu đã bán, liên kết đơn hàng
  // Account-based inventory (optional)
  isAccountBased?: boolean; // true if this item represents a multi-profile account
  accountColumns?: InventoryAccountColumn[]; // dynamic columns for account
  accountData?: Record<string, string>; // key = column.id -> value
  totalSlots?: number; // total profiles, e.g., 5
  profiles?: InventoryProfileSlot[]; // current slot assignments
  createdAt: Date;
  updatedAt: Date;
}

// Renewal history
export interface OrderRenewal {
  id: string;
  months: number;
  packageId: string;
  price: number;
  useCustomPrice?: boolean;
  previousExpiryDate: Date;
  newExpiryDate: Date;
  note?: string;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  createdBy: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Form types
export interface ProductFormData {
  code: string; // Mã sản phẩm cố định
  name: string;
  description?: string;
  sharedInventoryPool?: boolean;
}

export interface PackageFormData {
  code: string; // Mã gói sản phẩm cố định
  productId: string;
  name: string;
  warrantyPeriod: number;
  costPrice: number;
  ctvPrice: number;
  retailPrice: number;
  customFields?: PackageCustomField[];
  isAccountBased?: boolean;
  accountColumns?: InventoryAccountColumn[];
  defaultSlots?: number;
}

export interface CustomerFormData {
  code: string; // Mã khách hàng cố định
  name: string;
  type: CustomerType;
  phone?: string;
  email?: string;
  source?: CustomerSource;
  sourceDetail?: string;
  notes?: string;
}

export interface OrderFormData {
  code: string; // Mã đơn hàng cố định
  purchaseDate: Date;
  packageId: string;
  customerId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  orderInfo?: string;
  notes?: string;
  useCustomPrice?: boolean; // Sử dụng giá tùy chỉnh
  customPrice?: number; // Giá tùy chỉnh
  customFieldValues?: Record<string, string>;
  inventoryProfileId?: string;
}

export interface InventoryFormData {
  code: string; // Mã kho hàng cố định
  productId: string;
  packageId: string;
  purchaseDate: Date;
  sourceNote?: string;
  purchasePrice?: number;
  productInfo?: string;
  notes?: string;
  // Account-based optional fields
  isAccountBased?: boolean;
  accountColumns?: InventoryAccountColumn[];
  accountData?: Record<string, string>;
  totalSlots?: number;
  profiles?: InventoryProfileSlot[];
}

export interface EmployeeFormData {
  code: string; // Mã nhân viên cố định
  username: string;
  password: string;
  role: EmployeeRole;
}

// Warranty types
export type WarrantyStatus = 'PENDING' | 'DONE';

export interface Warranty {
  id: string;
  code: string; // Mã bảo hành cố định
  createdAt: Date;
  orderId: string;
  reason: string;
  status: WarrantyStatus;
  updatedAt: Date;
  createdBy: string;
  replacementInventoryId?: string; // ID sản phẩm thay thế từ kho hàng
  newOrderInfo?: string; // Thông tin đơn hàng mới
}

export interface WarrantyFormData {
  code: string; // Mã bảo hành cố định
  orderId: string;
  reason: string;
  status: WarrantyStatus;
  replacementInventoryId?: string; // ID sản phẩm thay thế từ kho hàng
  newOrderInfo?: string; // Thông tin đơn hàng mới
}

// UI State types
export interface AuthState {
  isAuthenticated: boolean;
  user: Employee | null;
  token: string | null;
  loading: boolean;
}

export interface AppState {
  auth: AuthState;
  products: Product[];
  packages: ProductPackage[];
  customers: Customer[];
  orders: Order[];
  employees: Employee[];
  activityLogs: ActivityLog[];
  loading: boolean;
  error: string | null;
}

// Filter and search types
export interface ProductFilters {
  search?: string;
}

export interface CustomerFilters {
  search?: string;
  type?: CustomerType;
  source?: CustomerSource;
}

export interface OrderFilters {
  search?: string;
  status?: OrderStatus;
  dateFrom?: Date;
  dateTo?: Date;
  customerId?: string;
}

// Constants
export const CUSTOMER_TYPES: { value: CustomerType; label: string }[] = [
  { value: 'CTV', label: 'Cộng Tác Viên' },
  { value: 'RETAIL', label: 'Khách Lẻ' }
];

export const CUSTOMER_SOURCES: { value: CustomerSource; label: string }[] = [
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'TELEGRAM', label: 'Telegram' },
  { value: 'PAGE', label: 'Page' },
  { value: 'WEB', label: 'Web' },
  { value: 'ZALO', label: 'Zalo' }
];

export const ORDER_STATUSES: { value: OrderStatus; label: string }[] = [
  { value: 'PROCESSING', label: 'Đang xử lý' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
  { value: 'CANCELLED', label: 'Đã hủy' }
];

export const WARRANTY_STATUSES: { value: WarrantyStatus; label: string }[] = [
  { value: 'PENDING', label: 'Chưa xong' },
  { value: 'DONE', label: 'Đã xong' }
];

export const PAYMENT_STATUSES: { value: PaymentStatus; label: string }[] = [
  { value: 'UNPAID', label: 'Chưa thanh toán' },
  { value: 'PAID', label: 'Đã thanh toán' },
  { value: 'REFUNDED', label: 'Đã hoàn tiền' }
];

export const EMPLOYEE_ROLES: { value: EmployeeRole; label: string }[] = [
  { value: 'MANAGER', label: 'Quản lý' },
  { value: 'EMPLOYEE', label: 'Nhân viên' }
];

// Notification types
export type NotificationType = 'EXPIRY_WARNING' | 'NEW_ORDER' | 'PAYMENT_REMINDER' | 'LOW_STOCK';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  isRead: boolean;
  createdAt: Date;
  relatedId?: string; // ID of related order, product, etc.
  actionUrl?: string; // URL to navigate when clicked
}

export interface NotificationSettings {
  expiryWarningDays: number; // Days before expiry to warn
  lowStockThreshold: number; // Minimum stock level to trigger warning
  enableNewOrderNotifications: boolean;
  enablePaymentReminders: boolean;
  enableExpiryWarnings: boolean;
  enableLowStockWarnings: boolean;
}

// Expense types
export type ExpenseType = 'PURCHASE' | 'OPERATIONAL' | 'MARKETING' | 'OTHER';

export interface Expense {
  id: string;
  code: string; // Mã chi phí cố định
  type: ExpenseType;
  amount: number;
  description: string;
  date: Date;
  createdBy: string; // ID nhân viên tạo
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpenseFormData {
  code: string;
  type: ExpenseType;
  amount: number;
  description: string;
  date: Date;
}

export const EXPENSE_TYPES: { value: ExpenseType; label: string }[] = [
  { value: 'PURCHASE', label: 'Mua hàng' },
  { value: 'OPERATIONAL', label: 'Vận hành' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'OTHER', label: 'Khác' }
];

