// Local storage database simulation
import { 
  Product, 
  ProductPackage, 
  Customer, 
  Order, 
  Employee, 
  ActivityLog,
  CustomerType,
  EmployeeRole,
  OrderStatus,
  InventoryItem,
  InventoryFormData,
  Expense,
  ExpenseFormData
} from '../types';
import { InventoryRenewal } from '../types';
import { Warranty, WarrantyFormData } from '../types';
import { mirrorDelete, mirrorInsert, mirrorUpdate, mirrorActivityLog } from './supabaseSync';

// In-memory backing store (clears on refresh; authoritative source is Supabase)
const MEM: Record<string, any[]> = {
  bongmin_products: [],
  bongmin_packages: [],
  bongmin_customers: [],
  bongmin_orders: [],
  bongmin_employees: [],
  bongmin_activity_logs: [],
  bongmin_inventory: [],
  bongmin_warranties: [],
  bongmin_expenses: [],
  bongmin_inventory_renewals: []
};

// Keep symbolic keys for existing call sites; backed by in-memory store
const STORAGE_KEYS = {
  PRODUCTS: 'bongmin_products',
  PACKAGES: 'bongmin_packages',
  CUSTOMERS: 'bongmin_customers',
  ORDERS: 'bongmin_orders',
  EMPLOYEES: 'bongmin_employees',
  ACTIVITY_LOGS: 'bongmin_activity_logs',
  INVENTORY: 'bongmin_inventory',
  WARRANTIES: 'bongmin_warranties',
  EXPENSES: 'bongmin_expenses',
  INVENTORY_RENEWALS: 'bongmin_inventory_renewals'
};

// Helper functions
const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

const getFromStorage = <T>(key: string, defaultValue: T[]): T[] => {
  const arr = MEM[key];
  return Array.isArray(arr) ? (arr as T[]) : defaultValue;
};

const saveToStorage = <T>(key: string, data: T[]): void => {
  MEM[key] = Array.isArray(data) ? [...data] : [];
};

// Database operations
export class Database {
  // Order code helpers
  static generateNextOrderCode(prefix: string = 'DH', padLength: number = 4): string {
    const orders = this.getOrders();
    if (orders.length === 0) {
      return `${prefix}${String(1).padStart(padLength, '0')}`;
    }
    
    const existingNumbers = new Set<number>();
    let detectedPad = padLength;
    
    orders.forEach(o => {
      const m = String(o.code || '').match(/^([A-Za-z]+)(\d+)$/);
      if (m && m[1].toUpperCase() === prefix.toUpperCase()) {
        const numStr = m[2];
        const num = parseInt(numStr, 10);
        if (!isNaN(num)) {
          existingNumbers.add(num);
          detectedPad = Math.max(detectedPad, numStr.length);
        }
      }
    });
    
    // Find the first available number starting from 1
    // This will reuse deleted codes immediately
    let nextNum = 1;
    while (existingNumbers.has(nextNum)) {
      nextNum++;
    }
    
    const width = Math.max(padLength, detectedPad);
    return `${prefix}${String(nextNum).padStart(width, '0')}`;
  }
  // Generic code helpers for other modules
  static generateNextCodeFromList(codes: string[], prefix: string, padLength: number = 3): string {
    const existingNumbers = new Set<number>();
    let detectedPad = padLength;
    
    codes.forEach(code => {
      const m = String(code || '').match(/^([A-Za-z]+)(\d+)$/);
      if (m && m[1].toUpperCase() === prefix.toUpperCase()) {
        const numStr = m[2];
        const num = parseInt(numStr, 10);
        if (!isNaN(num)) {
          existingNumbers.add(num);
          detectedPad = Math.max(detectedPad, numStr.length);
        }
      }
    });
    
    // Find the first available number starting from 1
    // This will reuse deleted codes immediately
    let nextNum = 1;
    while (existingNumbers.has(nextNum)) {
      nextNum++;
    }
    
    const width = Math.max(padLength, detectedPad);
    return `${prefix}${String(nextNum).padStart(width, '0')}`;
  }
  static generateNextCustomerCode(): string {
    const customers = this.getCustomers();
    if (customers.length === 0) {
      return 'KH001';
    }
    return this.generateNextCodeFromList(customers.map(c => c.code), 'KH', 3);
  }
  static generateNextProductCode(): string {
    const products = this.getProducts();
    if (products.length === 0) {
      return 'SP001';
    }
    return this.generateNextCodeFromList(products.map(p => p.code), 'SP', 3);
  }
  static generateNextPackageCode(): string {
    const packages = this.getPackages();
    if (packages.length === 0) {
      return 'PK001';
    }
    return this.generateNextCodeFromList(packages.map(p => p.code), 'PK', 3);
  }
  static generateNextInventoryCode(): string {
    const inventory = this.getInventory();
    if (inventory.length === 0) {
      return 'KHO001';
    }
    return this.generateNextCodeFromList(inventory.map(i => i.code), 'KHO', 3);
  }
  // Employees are managed by Supabase; no local code generation
  static async generateNextExpenseCode(): Promise<string> {
    const expenses = await this.getExpenses();
    if (expenses.length === 0) {
      return 'CP001';
    }
    return this.generateNextCodeFromList(expenses.map(e => e.code), 'CP', 3);
  }
  static generateNextWarrantyCode(): string {
    const warranties = this.getWarranties();
    if (warranties.length === 0) {
      return 'BH001';
    }
    return this.generateNextCodeFromList(warranties.map(w => w.code), 'BH', 3);
  }
  // Date helpers
  static addMonths(base: Date, months: number): Date {
    const d = new Date(base);
    const day = d.getDate();
    d.setMonth(d.getMonth() + months);
    if (d.getDate() < day) d.setDate(0);
    return d;
  }
  // Warranties
  static setWarranties(items: Warranty[]): void {
    saveToStorage(STORAGE_KEYS.WARRANTIES, items);
  }
  static getWarranties(): Warranty[] {
    return getFromStorage(STORAGE_KEYS.WARRANTIES, []).map((w: any) => ({
      ...w,
      createdAt: new Date(w.createdAt),
      updatedAt: new Date(w.updatedAt)
    }));
  }

  static getWarrantiesByOrder(orderId: string): Warranty[] {
    return this.getWarranties().filter(w => w.orderId === orderId);
  }

  static saveWarranty(data: Omit<Warranty, 'id' | 'createdAt' | 'updatedAt'>): Warranty {
    const warranties = this.getWarranties();
    
    const autoCode = String(data.code || '').trim() || this.generateNextWarrantyCode();
    if (warranties.some(w => w.code === autoCode)) {
      throw new Error(`Mã bảo hành "${autoCode}" đã tồn tại`);
    }
    
    const newWarranty: Warranty = {
      ...data,
      code: autoCode,
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    warranties.push(newWarranty);
    saveToStorage(STORAGE_KEYS.WARRANTIES, warranties);
    // mirror
    mirrorInsert('warranties', {
      ...newWarranty,
      createdAt: newWarranty.createdAt.toISOString(),
      updatedAt: newWarranty.updatedAt.toISOString()
    });
    return newWarranty;
  }

  static updateWarranty(id: string, updates: Partial<Warranty>): Warranty | null {
    const warranties = this.getWarranties();
    const index = warranties.findIndex(w => w.id === id);
    if (index === -1) return null;
    
    // Check if code already exists (excluding current warranty)
    if (updates.code && warranties.some(w => w.code === updates.code && w.id !== id)) {
      throw new Error(`Mã bảo hành "${updates.code}" đã tồn tại`);
    }
    
    warranties[index] = { ...warranties[index], ...updates, updatedAt: new Date() };
    saveToStorage(STORAGE_KEYS.WARRANTIES, warranties);
    mirrorUpdate('warranties', id, warranties[index]);
    return warranties[index];
  }

  static deleteWarranty(id: string): boolean {
    const warranties = this.getWarranties();
    const filtered = warranties.filter(w => w.id !== id);
    if (filtered.length === warranties.length) return false;
    saveToStorage(STORAGE_KEYS.WARRANTIES, filtered);
    mirrorDelete('warranties', id);
    return true;
  }
  // Inventory
  static setInventory(items: InventoryItem[]): void {
    saveToStorage(STORAGE_KEYS.INVENTORY, items);
  }
  static getInventory(): InventoryItem[] {
    return getFromStorage(STORAGE_KEYS.INVENTORY, []).map((i: any) => ({
      ...i,
      purchaseDate: new Date(i.purchaseDate),
      expiryDate: new Date(i.expiryDate),
      createdAt: new Date(i.createdAt),
      updatedAt: new Date(i.updatedAt),
      notes: i.notes,
      profiles: Array.isArray(i.profiles)
        ? i.profiles.map((p: any) => ({
            ...p,
            // normalize label from "Profile X" to "Slot X" for legacy data
            label: typeof p.label === 'string' ? p.label.replace(/^Profile\s+/i, 'Slot ') : p.label,
            assignedAt: p.assignedAt ? new Date(p.assignedAt) : undefined,
            expiryAt: p.expiryAt ? new Date(p.expiryAt) : undefined
          }))
        : undefined
    }));
  }

  // Inventory renewals
  static getInventoryRenewals(): InventoryRenewal[] {
    return getFromStorage(STORAGE_KEYS.INVENTORY_RENEWALS, []).map((r: any) => ({
      ...r,
      previousExpiryDate: new Date(r.previousExpiryDate),
      newExpiryDate: new Date(r.newExpiryDate),
      createdAt: new Date(r.createdAt)
    }));
  }

  static addInventoryRenewal(entry: Omit<InventoryRenewal, 'id' | 'createdAt'> & { createdAt?: Date }): InventoryRenewal {
    const renewals = this.getInventoryRenewals();
    const id = generateId();
    const newEntry: InventoryRenewal = {
      id,
      ...entry,
      createdAt: entry.createdAt ? new Date(entry.createdAt) : new Date()
    } as InventoryRenewal;
    renewals.push(newEntry);
    saveToStorage(STORAGE_KEYS.INVENTORY_RENEWALS, renewals);
    return newEntry;
  }

  static getAvailableInventoryByPackage(packageId: string): InventoryItem[] {
    const pkg = this.getPackages().find(p => p.id === packageId);
    const products = this.getProducts();
    const product = pkg ? products.find(pr => pr.id === pkg.productId) : undefined;
    const sharedPoolProductId = product?.sharedInventoryPool ? product.id : undefined;

    return this.getInventory().filter(i => {
      // Enforce pool boundaries strictly
      if (sharedPoolProductId) {
        // Product-level pool: allow any inventory from same product ONLY
        if (i.productId !== sharedPoolProductId) return false;
      } else {
        // No pool: only inventory from the exact package
        if (i.packageId !== packageId) return false;
      }

      if (i.isAccountBased) {
        const total = i.totalSlots || 0;
        const assigned = (i.profiles || []).filter(p => p.isAssigned).length;
        return total > assigned; // at least one free slot
      }
      return i.status === 'AVAILABLE';
    });
  }

  static saveInventoryItem(data: InventoryFormData): InventoryItem {
    const items = this.getInventory();
    
    // Auto-assign code if missing/blank
    const autoCode = String(data.code || '').trim() || this.generateNextInventoryCode();
    if (items.some(i => i.code === autoCode)) {
      throw new Error(`Mã kho hàng "${autoCode}" đã tồn tại`);
    }
    
    // compute expiry from package warranty
    const pkg = this.getPackages().find(p => p.id === data.packageId);
    const purchaseDate = new Date(data.purchaseDate);
    const expiryDate = (() => {
      const date = new Date(purchaseDate);
      const months = pkg ? pkg.warrantyPeriod : 0;
      date.setMonth(date.getMonth() + months);
      return date;
    })();

    // Pull package-level account config
    const pkgConfig = this.getPackages().find(p => p.id === data.packageId);
    const isAccountBased = !!(data.isAccountBased || pkgConfig?.isAccountBased);
    // default slots rule: if account-based, default to 5 and enforce >=1
    const computedDefaultSlots = (() => {
      const val = data.totalSlots ?? pkgConfig?.defaultSlots ?? (isAccountBased ? 5 : undefined);
      if (!isAccountBased) return undefined;
      const n = Number(val || 5);
      return Math.max(1, n);
    })();
    const accountColumns = data.accountColumns || pkgConfig?.accountColumns;

    const newItem: InventoryItem = {
      id: generateId(),
      code: autoCode,
      productId: data.productId,
      packageId: data.packageId,
      purchaseDate,
      expiryDate,
      sourceNote: data.sourceNote,
      purchasePrice: data.purchasePrice,
      productInfo: data.productInfo,
      notes: data.notes,
      status: 'AVAILABLE',
      isAccountBased,
      accountColumns,
      accountData: data.accountData,
      totalSlots: computedDefaultSlots,
      profiles: (() => {
        if (!isAccountBased) return undefined;
        const total = Number(computedDefaultSlots || 0);
        if (!total || total <= 0) return undefined;
        return Array.from({ length: total }, (_, idx) => ({ id: `slot-${idx + 1}`, label: `Slot ${idx + 1}`, isAssigned: false }));
      })(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    items.push(newItem);
    saveToStorage(STORAGE_KEYS.INVENTORY, items);
    mirrorInsert('inventory', {
      ...newItem,
      purchaseDate: newItem.purchaseDate.toISOString(),
      expiryDate: newItem.expiryDate.toISOString(),
      createdAt: newItem.createdAt.toISOString(),
      updatedAt: newItem.updatedAt.toISOString()
    });
    return newItem;
  }

  static updateInventoryItem(id: string, updates: Partial<InventoryItem>): InventoryItem | null {
    const items = this.getInventory();
    const index = items.findIndex(i => i.id === id);
    if (index === -1) return null;
    
    // Check if code already exists (excluding current item)
    if (updates.code && items.some(i => i.code === updates.code && i.id !== id)) {
      throw new Error(`Mã kho hàng "${updates.code}" đã tồn tại`);
    }
    
    items[index] = { ...items[index], ...updates, updatedAt: new Date() };
    saveToStorage(STORAGE_KEYS.INVENTORY, items);
    mirrorUpdate('inventory', id, items[index]);
    return items[index];
  }

  static refreshOrdersForInventory(inventoryId: string): void {
    const inventory = this.getInventory().find(i => i.id === inventoryId);
    if (!inventory) return;
    const orders = this.getOrders();
    let changed = false;
    const nextOrders = orders.map(o => {
      let isLinked = false;
      if (o.inventoryItemId === inventoryId) {
        isLinked = true;
      } else if (inventory.isAccountBased && (inventory.profiles || []).some(p => p.assignedOrderId === o.id)) {
        isLinked = true;
      }
      if (!isLinked) return o;

      const nextInfo = (() => {
        if (inventory.isAccountBased) {
          const profile = (inventory.profiles || []).find(p => p.assignedOrderId === o.id);
          // Use the order's package columns to avoid mismatch when inventory package changes
          const inventoryForOrder = { ...inventory, packageId: o.packageId } as InventoryItem;
          return this.buildOrderInfoFromAccount(inventoryForOrder, profile?.id);
        }
        return inventory.productInfo || '';
      })();

      if (String((o as any).orderInfo || '') !== String(nextInfo || '')) {
        changed = true;
        return { ...o, orderInfo: nextInfo, updatedAt: new Date() } as any;
      }
      return o;
    });
    if (changed) saveToStorage(STORAGE_KEYS.ORDERS, nextOrders);
    if (changed) nextOrders.forEach(o => mirrorUpdate('orders', o.id, o));
  }

  // Account-based inventory helpers
  static computeSlotUsage(item: InventoryItem): { used: number; total: number } {
    const total = item.totalSlots || 0;
    const used = (item.profiles || []).filter(p => p.isAssigned).length;
    return { used, total };
  }

  static assignProfileToOrder(
    inventoryId: string,
    profileId: string,
    orderId: string,
    orderExpiry: Date
  ): InventoryItem | null {
    const items = this.getInventory();
    const index = items.findIndex(i => i.id === inventoryId);
    if (index === -1) return null;
    const item = items[index];
    if (!item.isAccountBased || !item.profiles) return null;
    const pIndex = item.profiles.findIndex(p => p.id === profileId);
    if (pIndex === -1) return null;
    if (item.profiles[pIndex].isAssigned && item.profiles[pIndex].assignedOrderId !== orderId) {
      // already assigned to another order
      return null;
    }
    const nextProfiles = [...item.profiles];
    nextProfiles[pIndex] = {
      ...nextProfiles[pIndex],
      isAssigned: true,
      assignedOrderId: orderId,
      assignedAt: new Date(),
      expiryAt: new Date(orderExpiry)
    };
    items[index] = { ...item, profiles: nextProfiles, updatedAt: new Date() } as InventoryItem;
    saveToStorage(STORAGE_KEYS.INVENTORY, items);
    return items[index];
  }

  static releaseProfile(inventoryId: string, profileId: string): InventoryItem | null {
    const items = this.getInventory();
    const index = items.findIndex(i => i.id === inventoryId);
    if (index === -1) return null;
    const item = items[index];
    if (!item.isAccountBased || !item.profiles) return null;
    const pIndex = item.profiles.findIndex(p => p.id === profileId);
    if (pIndex === -1) return null;
    const nextProfiles = [...item.profiles];
    nextProfiles[pIndex] = {
      ...nextProfiles[pIndex],
      isAssigned: false,
      assignedOrderId: undefined,
      assignedAt: undefined,
      expiryAt: undefined
    };
    items[index] = { ...item, profiles: nextProfiles, updatedAt: new Date() } as InventoryItem;
    saveToStorage(STORAGE_KEYS.INVENTORY, items);
    return items[index];
  }

  static sweepExpiredProfiles(): void {
    const items = this.getInventory();
    let changed = false;
    const now = new Date();
    const next = items.map(it => {
      if (!it.isAccountBased || !it.profiles || it.profiles.length === 0) return it;
      let localChanged = false;
      const profiles = it.profiles.map(p => {
        if (p.isAssigned && p.expiryAt && p.expiryAt < now) {
          localChanged = true;
          return {
            ...p,
            isAssigned: false,
            assignedOrderId: undefined,
            assignedAt: undefined,
            expiryAt: undefined
          };
        }
        return p;
      });
      if (localChanged) {
        changed = true;
        return { ...it, profiles, updatedAt: new Date() } as InventoryItem;
      }
      return it;
    });
    if (changed) saveToStorage(STORAGE_KEYS.INVENTORY, next);
  }

  static buildOrderInfoFromAccount(item: InventoryItem, chosenProfileId?: string): string {
    const lines: string[] = [];
    // Always prefer latest package-level column definitions to avoid stale titles/flags
    const pkg = this.getPackages().find(p => p.id === item.packageId);
    const columns = (pkg?.accountColumns && pkg.accountColumns.length)
      ? pkg.accountColumns
      : (item.accountColumns || []);
    const data = item.accountData || {};
    columns.forEach(col => {
      if (col.includeInOrderInfo) {
        const val = data[col.id] ?? '';
        if (String(val).trim()) {
          const valueStr = String(val);
          if (valueStr.includes('\n')) {
            lines.push(`${col.title}:`);
            // preserve user-entered newlines per line
            valueStr.split('\n').forEach((ln) => lines.push(ln));
          } else {
            lines.push(`${col.title}: ${valueStr}`);
          }
        }
      }
    });
    if (item.isAccountBased && chosenProfileId) {
      const profile = (item.profiles || []).find(p => p.id === chosenProfileId);
      if (profile) lines.push(`Slot: ${profile.label}`);
      const usage = this.computeSlotUsage(item);
      if (usage.total > 0) lines.push(`Slot: ${usage.used}/${usage.total}`);
    }
    return lines.join('\n');
  }

  static deleteInventoryItem(id: string): boolean {
    const items = this.getInventory();
    const filtered = items.filter(i => i.id !== id);
    if (filtered.length === items.length) return false;
    saveToStorage(STORAGE_KEYS.INVENTORY, filtered);
    return true;
  }

  static async renewInventoryItem(
    inventoryId: string,
    months: number,
    amount: number,
    opts?: { note?: string; createdBy?: string }
  ): Promise<InventoryItem | null> {
    const item = this.getInventory().find(i => i.id === inventoryId);
    if (!item) return null;
    const safeMonths = Math.max(1, Math.floor(months || 1));
    const prev = new Date(item.expiryDate);
    const next = this.addMonths(prev, safeMonths);
    const updated = this.updateInventoryItem(inventoryId, { expiryDate: next });
    if (updated) {
      this.addInventoryRenewal({
        inventoryId,
        months: safeMonths,
        amount: Math.max(0, Number(amount || 0)),
        previousExpiryDate: prev,
        newExpiryDate: next,
        note: opts?.note,
        createdBy: opts?.createdBy || 'system'
      });
    }
    return updated;
  }

  static reserveInventoryItem(id: string): InventoryItem | null {
    const item = this.updateInventoryItem(id, { status: 'RESERVED' });
    return item;
  }

  static releaseInventoryItem(id: string): InventoryItem | null {
    const item = this.updateInventoryItem(id, { status: 'AVAILABLE', linkedOrderId: undefined });
    
    // Also update the order to remove the inventory link
    if (item && item.linkedOrderId) {
      const orders = this.getOrders();
      const orderIndex = orders.findIndex(o => o.id === item.linkedOrderId);
      if (orderIndex !== -1) {
        orders[orderIndex] = {
          ...orders[orderIndex],
          inventoryItemId: undefined,
          updatedAt: new Date()
        };
        saveToStorage(STORAGE_KEYS.ORDERS, orders);
      }
    }
    
    return item;
  }

  static sellInventoryItem(id: string, orderId: string): InventoryItem | null {
    const item = this.updateInventoryItem(id, { status: 'SOLD', linkedOrderId: orderId });
    return item;
  }

  // Products
  static setProducts(items: Product[]): void {
    saveToStorage(STORAGE_KEYS.PRODUCTS, items);
  }
  static getProducts(): Product[] {
    return getFromStorage(STORAGE_KEYS.PRODUCTS, []);
  }

  static saveProduct(product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Product {
    const products = this.getProducts();
    
    const autoCode = String(product.code || '').trim() || this.generateNextProductCode();
    if (products.some(p => p.code === autoCode)) {
      throw new Error(`Mã sản phẩm "${autoCode}" đã tồn tại`);
    }
    
    const newProduct: Product = {
      ...product,
      code: autoCode,
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    products.push(newProduct);
    saveToStorage(STORAGE_KEYS.PRODUCTS, products);
    mirrorInsert('products', newProduct);
    return newProduct;
  }

  static updateProduct(id: string, updates: Partial<Product>): Product | null {
    const products = this.getProducts();
    const index = products.findIndex(p => p.id === id);
    if (index === -1) return null;
    
    // Check if code already exists (excluding current product)
    if (updates.code && products.some(p => p.code === updates.code && p.id !== id)) {
      throw new Error(`Mã sản phẩm "${updates.code}" đã tồn tại`);
    }
    
    products[index] = {
      ...products[index],
      ...updates,
      updatedAt: new Date()
    };
    saveToStorage(STORAGE_KEYS.PRODUCTS, products);
    mirrorUpdate('products', id, products[index]);
    return products[index];
  }

  static deleteProduct(id: string): boolean {
    const products = this.getProducts();
    const filtered = products.filter(p => p.id !== id);
    if (filtered.length === products.length) return false;
    
    saveToStorage(STORAGE_KEYS.PRODUCTS, filtered);
    mirrorDelete('products', id);
    return true;
  }

  // Packages
  static setPackages(items: ProductPackage[]): void {
    saveToStorage(STORAGE_KEYS.PACKAGES, items);
  }
  static getPackages(): ProductPackage[] {
    return getFromStorage(STORAGE_KEYS.PACKAGES, []);
  }

  static getPackagesByProduct(productId: string): ProductPackage[] {
    return this.getPackages().filter(p => p.productId === productId);
  }

  static savePackage(pkg: Omit<ProductPackage, 'id' | 'createdAt' | 'updatedAt'>): ProductPackage {
    const packages = this.getPackages();
    
    const autoCode = String(pkg.code || '').trim() || this.generateNextPackageCode();
    if (packages.some(p => p.code === autoCode)) {
      throw new Error(`Mã gói sản phẩm "${autoCode}" đã tồn tại`);
    }
    
    const newPackage: ProductPackage = {
      ...pkg,
      code: autoCode,
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    packages.push(newPackage);
    saveToStorage(STORAGE_KEYS.PACKAGES, packages);
    mirrorInsert('packages', newPackage);
    return newPackage;
  }

  static updatePackage(id: string, updates: Partial<ProductPackage>): ProductPackage | null {
    const packages = this.getPackages();
    const index = packages.findIndex(p => p.id === id);
    if (index === -1) return null;
    
    // Check if code already exists (excluding current package)
    if (updates.code && packages.some(p => p.code === updates.code && p.id !== id)) {
      throw new Error(`Mã gói sản phẩm "${updates.code}" đã tồn tại`);
    }
    
    const prev = packages[index];
    const next: ProductPackage = {
      ...prev,
      ...updates,
      // enforce defaultSlots >= 1 when isAccountBased
      defaultSlots: (updates as any)?.isAccountBased || prev.isAccountBased
        ? Math.max(1, Number((updates as any)?.defaultSlots ?? prev.defaultSlots ?? 5))
        : undefined,
      updatedAt: new Date()
    } as ProductPackage;
    packages[index] = next;
    saveToStorage(STORAGE_KEYS.PACKAGES, packages);
    mirrorUpdate('packages', id, next);
    // Propagate slot count to inventory items of this package (only account-based)
    try {
      const items = this.getInventory();
      let changed = false;
      const updatedItems = items.map(item => {
        if (item.packageId !== next.id) return item;
        const isAcc = !!(item.isAccountBased || next.isAccountBased);
        if (!isAcc) return item;
        const desiredTotal = Math.max(1, Number(next.defaultSlots ?? 5));
        if ((item.totalSlots || 0) === desiredTotal) return item;
        const usedProfiles = (item.profiles || []).filter(p => p.isAssigned);
        // Rebuild profiles preserving assigned ones up to desiredTotal
        const newProfiles = Array.from({ length: desiredTotal }, (_, idx) => {
          const keep = usedProfiles[idx];
          return keep ? { ...keep } : { id: `slot-${idx + 1}`, label: `Slot ${idx + 1}`, isAssigned: false };
        });
        changed = true;
        return { ...item, totalSlots: desiredTotal, profiles: newProfiles, updatedAt: new Date() } as InventoryItem;
      });
      if (changed) saveToStorage(STORAGE_KEYS.INVENTORY, updatedItems);
    } catch {
      // best-effort
    }
    return packages[index];
  }

  static deletePackage(id: string): boolean {
    const packages = this.getPackages();
    const filtered = packages.filter(p => p.id !== id);
    if (filtered.length === packages.length) return false;
    
    saveToStorage(STORAGE_KEYS.PACKAGES, filtered);
    mirrorDelete('packages', id);
    return true;
  }

  // Customers
  static setCustomers(items: Customer[]): void {
    saveToStorage(STORAGE_KEYS.CUSTOMERS, items);
  }
  static getCustomers(): Customer[] {
    return getFromStorage(STORAGE_KEYS.CUSTOMERS, []);
  }

  static saveCustomer(customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Customer {
    const customers = this.getCustomers();
    
    const autoCode = String(customer.code || '').trim() || this.generateNextCustomerCode();
    if (customers.some(c => c.code === autoCode)) {
      throw new Error(`Mã khách hàng "${autoCode}" đã tồn tại`);
    }
    
    const newCustomer: Customer = {
      ...customer,
      code: autoCode,
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    customers.push(newCustomer);
    saveToStorage(STORAGE_KEYS.CUSTOMERS, customers);
    mirrorInsert('customers', newCustomer);
    return newCustomer;
  }

  static updateCustomer(id: string, updates: Partial<Customer>): Customer | null {
    const customers = this.getCustomers();
    const index = customers.findIndex(c => c.id === id);
    if (index === -1) return null;
    
    // Check if code already exists (excluding current customer)
    if (updates.code && customers.some(c => c.code === updates.code && c.id !== id)) {
      throw new Error(`Mã khách hàng "${updates.code}" đã tồn tại`);
    }
    
    customers[index] = {
      ...customers[index],
      ...updates,
      updatedAt: new Date()
    };
    saveToStorage(STORAGE_KEYS.CUSTOMERS, customers);
    mirrorUpdate('customers', id, customers[index]);
    return customers[index];
  }

  static deleteCustomer(id: string): boolean {
    const customers = this.getCustomers();
    const filtered = customers.filter(c => c.id !== id);
    if (filtered.length === customers.length) return false;
    
    saveToStorage(STORAGE_KEYS.CUSTOMERS, filtered);
    mirrorDelete('customers', id);
    return true;
  }

  // Orders
  static setOrders(items: Order[]): void {
    saveToStorage(STORAGE_KEYS.ORDERS, items);
  }
  static getOrders(): Order[] {
    return getFromStorage(STORAGE_KEYS.ORDERS, []);
  }

  static getOrdersByCustomer(customerId: string): Order[] {
    return this.getOrders().filter(o => o.customerId === customerId);
  }

  static saveOrder(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Order {
    const orders = this.getOrders();
    
    // Auto-assign code if missing/blank
    const code = String(order.code || '').trim() || this.generateNextOrderCode('DH', 4);

    // Check if code already exists
    if (orders.some(o => o.code === code)) {
      throw new Error(`Mã đơn hàng "${code}" đã tồn tại`);
    }
    
    const newOrder: Order = {
      ...order,
      code,
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    orders.push(newOrder);
    saveToStorage(STORAGE_KEYS.ORDERS, orders);
    mirrorInsert('orders', newOrder);
    return newOrder;
  }

  static updateOrder(id: string, updates: Partial<Order>): Order | null {
    const orders = this.getOrders();
    const index = orders.findIndex(o => o.id === id);
    if (index === -1) return null;
    
    // Check if code already exists (excluding current order)
    if (updates.code && orders.some(o => o.code === updates.code && o.id !== id)) {
      throw new Error(`Mã đơn hàng "${updates.code}" đã tồn tại`);
    }
    
    orders[index] = {
      ...orders[index],
      ...updates,
      updatedAt: new Date()
    };
    saveToStorage(STORAGE_KEYS.ORDERS, orders);
    mirrorUpdate('orders', id, orders[index]);
    return orders[index];
  }

  static renewOrder(
    orderId: string,
    packageId: string,
    opts?: {
      note?: string;
      paymentStatus?: import('../types').PaymentStatus;
      createdBy?: string;
      useCustomPrice?: boolean;
      customPrice?: number;
    }
  ): Order | null {
    const orders = this.getOrders();
    const index = orders.findIndex(o => o.id === orderId);
    if (index === -1) return null;

    const current = orders[index];
    const pkg = this.getPackages().find(p => p.id === packageId);
    const now = new Date();
    const base = current.expiryDate > now ? new Date(current.expiryDate) : now;
    const safeMonths = Math.max(1, Math.floor(pkg?.warrantyPeriod || 1));
    const nextExpiry = this.addMonths(base, safeMonths);

    const customer = this.getCustomers().find(c => c.id === current.customerId);
    const defaultPrice = customer?.type === 'CTV' ? (pkg?.ctvPrice || 0) : (pkg?.retailPrice || 0);
    const useCustomPrice = !!opts?.useCustomPrice && (opts?.customPrice || 0) > 0;
    const finalPrice = useCustomPrice ? Math.max(0, Number(opts?.customPrice || 0)) : defaultPrice;

    const renewal = {
      id: (Date.now().toString(36) + Math.random().toString(36).substr(2)),
      months: safeMonths,
      packageId,
      price: finalPrice,
      useCustomPrice,
      previousExpiryDate: new Date(current.expiryDate),
      newExpiryDate: new Date(nextExpiry),
      note: opts?.note,
      paymentStatus: opts?.paymentStatus ?? current.paymentStatus,
      createdAt: new Date(),
      createdBy: opts?.createdBy || 'system'
    } as import('../types').OrderRenewal;

    const nextOrder: Order = {
      ...current,
      expiryDate: nextExpiry,
      paymentStatus: renewal.paymentStatus,
      packageId: packageId || current.packageId,
      renewals: [...(current as any).renewals || [], renewal],
      updatedAt: new Date()
    } as any;

    orders[index] = nextOrder;
    saveToStorage(STORAGE_KEYS.ORDERS, orders);
    mirrorUpdate('orders', nextOrder.id, nextOrder);

    // Sync account-based slot expiry if applicable
    try {
      if (nextOrder.inventoryItemId && (nextOrder as any).inventoryProfileId) {
        this.assignProfileToOrder(
          nextOrder.inventoryItemId,
          (nextOrder as any).inventoryProfileId as string,
          nextOrder.id,
          nextOrder.expiryDate
        );
      } else {
        const inv = this.getInventory().find(i => i.linkedOrderId === nextOrder.id);
        if (inv?.isAccountBased) {
          const profile = (inv.profiles || []).find(p => p.assignedOrderId === nextOrder.id);
          if (profile) this.assignProfileToOrder(inv.id, profile.id, nextOrder.id, nextOrder.expiryDate);
        }
      }
    } catch {
      // best-effort
    }

    return nextOrder;
  }

  static deleteOrder(id: string): boolean {
    const orders = this.getOrders();
    const target = orders.find(o => o.id === id);
    if (!target) return false;

    // Release any linked inventory or assigned profile slots
    try {
      // Explicit inventory link first
      if (target.inventoryItemId) {
        const inv = this.getInventory().find(i => i.id === target.inventoryItemId);
        if (inv?.isAccountBased) {
          const profileId = (target as any).inventoryProfileId as string | undefined;
          if (profileId) {
            this.releaseProfile(inv.id, profileId);
          }
          // Also defensively release any slots pointing to this order
          (inv.profiles || []).filter(p => p.assignedOrderId === id).forEach(p => {
            this.releaseProfile(inv.id, p.id);
          });
        } else {
          if (inv?.linkedOrderId === id) {
            this.releaseInventoryItem(inv.id);
          }
        }
      }

      // Catch classic link where order didn't store inventoryItemId
      const classic = this.getInventory().find(i => !i.isAccountBased && i.linkedOrderId === id);
      if (classic) {
        this.releaseInventoryItem(classic.id);
      }

      // Sweep all account-based inventories for profiles assigned to this order
      this.getInventory().forEach(it => {
        if (it.isAccountBased && (it.profiles || []).some(p => p.assignedOrderId === id)) {
          (it.profiles || []).filter(p => p.assignedOrderId === id).forEach(p => this.releaseProfile(it.id, p.id));
        }
      });
    } catch {
      // Best-effort release; continue with deletion
    }

    const filtered = orders.filter(o => o.id !== id);
    saveToStorage(STORAGE_KEYS.ORDERS, filtered);
    mirrorDelete('orders', id);
    return true;
  }

  // Employees
  static setEmployees(items: Employee[]): void {
    saveToStorage(STORAGE_KEYS.EMPLOYEES, items);
  }
  static getEmployees(): Employee[] {
    return getFromStorage(STORAGE_KEYS.EMPLOYEES, []);
  }
  // save/update/delete employee removed; managed via Supabase

  // Activity Logs
  static setActivityLogs(items: ActivityLog[]): void {
    saveToStorage(STORAGE_KEYS.ACTIVITY_LOGS, items);
  }
  static getActivityLogs(): ActivityLog[] {
    return getFromStorage(STORAGE_KEYS.ACTIVITY_LOGS, []);
  }

  static getActivityLogsByEmployee(employeeId: string): ActivityLog[] {
    return this.getActivityLogs().filter(log => log.employeeId === employeeId);
  }


  // Auth token helpers removed in Supabase-only mode

  // Migration functions
  static migrateCustomers(): void {
    const customers = this.getCustomers();
    let needsUpdate = false;
    
    const migratedCustomers = customers.map((customer, index) => {
      if (!customer.code) {
        needsUpdate = true;
        return {
          ...customer,
          code: `KH${String(index + 1).padStart(3, '0')}`
        };
      }
      return customer;
    });
    
    if (needsUpdate) {
      saveToStorage(STORAGE_KEYS.CUSTOMERS, migratedCustomers);
    }
  }

  static migrateOrders(): void {
    const orders = this.getOrders();
    let needsUpdate = false;
    
    const migratedOrders = orders.map((order, index) => {
      if (!order.code) {
        needsUpdate = true;
        return {
          ...order,
          code: `DH${String(index + 1).padStart(3, '0')}`
        };
      }
      return order;
    });
    
    if (needsUpdate) {
      saveToStorage(STORAGE_KEYS.ORDERS, migratedOrders);
    }
  }

  // Demo migrations removed in Supabase-only mode
  static migrateProducts(): void {
    const products = this.getProducts();
    let needsUpdate = false;
    
    const migratedProducts = products.map((product, index) => {
      if (!product.code) {
        needsUpdate = true;
        return {
          ...product,
          code: `SP${String(index + 1).padStart(3, '0')}`
        };
      }
      return product;
    });
    
    if (needsUpdate) {
      saveToStorage(STORAGE_KEYS.PRODUCTS, migratedProducts);
    }
  }

  static migratePackages(): void {
    const packages = this.getPackages();
    let needsUpdate = false;
    
    const migratedPackages = packages.map((pkg, index) => {
      const updates: any = {};
      
      if (!pkg.code) {
        updates.code = `PK${String(index + 1).padStart(3, '0')}`;
        needsUpdate = true;
      }
      
      if (pkg.costPrice === undefined) {
        updates.costPrice = 0; // Default cost price
        needsUpdate = true;
      }
      
      if (Object.keys(updates).length > 0) {
        return { ...pkg, ...updates };
      }
      return pkg;
    });
    
    if (needsUpdate) {
      saveToStorage(STORAGE_KEYS.PACKAGES, migratedPackages);
    }
  }

  static migrateInventory(): void {
    const inventory = this.getInventory();
    let needsUpdate = false;
    
    const migratedInventory = inventory.map((item, index) => {
      if (!item.code) {
        needsUpdate = true;
        return {
          ...item,
          code: `KHO${String(index + 1).padStart(3, '0')}`
        };
      }
      return item;
    });
    
    if (needsUpdate) {
      saveToStorage(STORAGE_KEYS.INVENTORY, migratedInventory);
    }
  }

  static migrateWarranties(): void {
    const warranties = this.getWarranties();
    let needsUpdate = false;
    
    const migratedWarranties = warranties.map((warranty, index) => {
      if (!warranty.code) {
        needsUpdate = true;
        return {
          ...warranty,
          code: `BH${String(index + 1).padStart(3, '0')}`
        };
      }
      return warranty;
    });
    
    if (needsUpdate) {
      saveToStorage(STORAGE_KEYS.WARRANTIES, migratedWarranties);
    }
  }

  // Employees managed via Supabase; no local migration

  // Initialize default data
  // initializeDefaultData removed for Supabase-only mode

  // Expense methods
  static async getExpenses(): Promise<Expense[]> {
    return getFromStorage('bongmin_expenses', []);
  }

  static async createExpense(expenseData: ExpenseFormData): Promise<Expense> {
    const expenses = await this.getExpenses();
    const autoCode = String(expenseData.code || '').trim() || await this.generateNextExpenseCode();
    if (expenses.some(e => e.code === autoCode)) {
      throw new Error(`Mã chi phí "${autoCode}" đã tồn tại`);
    }
    const newExpense: Expense = {
      id: generateId(),
      ...expenseData,
      code: autoCode,
      createdBy: 'system', // Default user ID
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    expenses.push(newExpense);
    saveToStorage('bongmin_expenses', expenses);
    
    return newExpense;
  }

  static async updateExpense(id: string, expenseData: Partial<ExpenseFormData>): Promise<Expense> {
    const expenses = await this.getExpenses();
    const index = expenses.findIndex(expense => expense.id === id);
    
    if (index === -1) throw new Error('Expense not found');
    // Prevent duplicate expense codes (excluding current expense)
    if (expenseData.code && expenses.some(e => e.code === expenseData.code && e.id !== id)) {
      throw new Error(`Mã chi phí "${expenseData.code}" đã tồn tại`);
    }
    
    expenses[index] = {
      ...expenses[index],
      ...expenseData,
      updatedAt: new Date(),
    };
    
    saveToStorage('bongmin_expenses', expenses);
    return expenses[index];
  }

  static async deleteExpense(id: string): Promise<void> {
    const expenses = await this.getExpenses();
    const filteredExpenses = expenses.filter(expense => expense.id !== id);
    saveToStorage('bongmin_expenses', filteredExpenses);
  }
}

