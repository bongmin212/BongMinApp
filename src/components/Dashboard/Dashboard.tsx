import React, { useState, useEffect } from 'react';
import { Database } from '../../utils/database';
import { getSupabase } from '../../utils/supabaseClient';
import { Product, ProductPackage, Customer, Order, InventoryItem, Expense } from '../../types';
import { IconBox, IconUsers, IconCart, IconChart, IconTrendingUp, IconTrendingDown, IconDollarSign, IconProfit } from '../Icons';
import TrendsChart, { TrendsPoint } from './TrendsChart';
import TopPackagesTable, { PackageAggRow } from './TopPackagesTable';
import TopCustomersTable, { CustomerAggRow } from './TopCustomersTable';
import { formatCurrencyVND } from '../../utils/money';
import { addMonths, toMonthKey, rangeMonths } from '../../utils/date';

interface DashboardStats {
  totalProducts: number;
  totalPackages: number;
  totalCustomers: number;
  totalOrders: number;
  soldOrderCount: number;
  totalRevenue: number;
  monthlyRevenue: number;
  revenueGrowth: number;
  totalProfit: number;
  monthlyProfit: number;
  profitGrowth: number;
  totalExpenses: number;
  monthlyExpenses: number;
  totalRefunds: number;
  monthlyRefunds: number;
  netProfit: number; // Lãi thực tế sau khi trừ chi phí
  monthlyNetProfit: number;
  inventoryItems: number;
  availableInventory: number;
  needsUpdateInventory: number;
  soldInventory: number;
  expiredInventory: number;
  monthlyImportCost: number;
  totalImportCost: number;
  monthlyPaidImportCost: number; // Tổng chi phí nhập hàng đã thanh toán (tháng)
  totalPaidImportCost: number; // Tổng chi phí nhập hàng đã thanh toán (tất cả)
  unpaidCount: number;
  processingCount: number;
  cancelledCount: number;
  expectedRevenue: number;
  ctvCount: number;
  retailCount: number;
  expiringSoonCount: number;
  expiringOrders7Count: number;
}

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    totalPackages: 0,
    totalCustomers: 0,
    totalOrders: 0,
    soldOrderCount: 0,
    totalRevenue: 0,
    monthlyRevenue: 0,
    revenueGrowth: 0,
    totalProfit: 0,
    monthlyProfit: 0,
    profitGrowth: 0,
    totalExpenses: 0,
    monthlyExpenses: 0,
    totalRefunds: 0,
    monthlyRefunds: 0,
    netProfit: 0,
    monthlyNetProfit: 0,
    inventoryItems: 0,
    availableInventory: 0,
    needsUpdateInventory: 0,
    soldInventory: 0,
    expiredInventory: 0,
    monthlyImportCost: 0,
    totalImportCost: 0,
    monthlyPaidImportCost: 0,
    totalPaidImportCost: 0,
    unpaidCount: 0,
    processingCount: 0,
    cancelledCount: 0,
    expectedRevenue: 0,
    ctvCount: 0,
    retailCount: 0,
    expiringSoonCount: 0,
    expiringOrders7Count: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonthOffset, setSelectedMonthOffset] = useState<number>(0); // 0 = current, -1..-11 = previous months
  const [trends, setTrends] = useState<TrendsPoint[]>([]);
  const [topPackages, setTopPackages] = useState<PackageAggRow[]>([]);
  const [packagesById, setPackagesById] = useState<Record<string, ProductPackage>>({});
  const [topCustomers, setTopCustomers] = useState<CustomerAggRow[]>([]);
  const [customersById, setCustomersById] = useState<Record<string, Customer>>({});
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const onDateRangeChange = (f: string, t: string) => { setDateFrom(f); setDateTo(t); };
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, [selectedMonthOffset, dateFrom, dateTo]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load all data including expenses (prefer Supabase; fallback to local cache)
      const sb = getSupabase();
      let products: Product[] = [];
      let packages: ProductPackage[] = [];
      let customers: Customer[] = [];
      let orders: Order[] = [];
      let inventoryItems: InventoryItem[] = [];
      let expenses: Expense[] = [];
      let inventoryRenewals: any[] = [];

      if (sb) {
        const [pr, pk, cu, or, inv, ex, renewals] = await Promise.all([
          sb.from('products').select('*'),
          sb.from('packages').select('*'),
          sb.from('customers').select('*'),
          sb.from('orders').select('*'),
          sb.from('inventory').select('*'),
          sb.from('expenses').select('*'),
          sb.from('inventory_renewals').select('*')
        ]);
        products = (pr.data || []).map((r: any) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          description: r.description || '',
          sharedInventoryPool: !!r.shared_inventory_pool,
          createdAt: r.created_at ? new Date(r.created_at) : new Date(),
          updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
        }));
        packages = (pk.data || []).map((r: any) => ({
          id: r.id,
          code: r.code,
          productId: r.product_id,
          name: r.name,
          warrantyPeriod: r.warranty_period,
          costPrice: r.cost_price,
          ctvPrice: r.ctv_price,
          retailPrice: r.retail_price,
          customFields: r.custom_fields || [],
          isAccountBased: !!r.is_account_based,
          accountColumns: r.account_columns || [],
          defaultSlots: r.default_slots,
          createdAt: r.created_at ? new Date(r.created_at) : new Date(),
          updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
        }));
        customers = (cu.data || []).map((r: any) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          type: r.type,
          phone: r.phone,
          email: r.email,
          source: r.source,
          sourceDetail: r.source_detail,
          notes: r.notes,
          createdAt: r.created_at ? new Date(r.created_at) : new Date(),
          updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
        }));
        orders = (or.data || []).map((r: any) => ({
          id: r.id,
          code: r.code,
          customerId: r.customer_id,
          packageId: r.package_id,
          status: r.status,
          paymentStatus: r.payment_status,
          useCustomPrice: r.use_custom_price || false,
          useCustomExpiry: r.use_custom_expiry || false,
          customPrice: r.custom_price,
          purchaseDate: r.purchase_date ? new Date(r.purchase_date) : new Date(),
          expiryDate: r.expiry_date ? new Date(r.expiry_date) : new Date(),
          createdAt: r.created_at ? new Date(r.created_at) : new Date(),
          updatedAt: r.updated_at ? new Date(r.updated_at) : new Date(),
          notes: r.notes,
          inventoryItemId: r.inventory_item_id,
          inventoryProfileIds: r.inventory_profile_ids || undefined,
          cogs: r.cogs,
          salePrice: r.sale_price,
          refundAmount: r.refund_amount || 0,
          refundAt: r.refund_at ? new Date(r.refund_at) : undefined
        })) as any;
        inventoryItems = (inv.data || []).map((r: any) => ({
          id: r.id,
          code: r.code,
          productId: r.product_id,
          packageId: r.package_id,
          purchaseDate: r.purchase_date ? new Date(r.purchase_date) : new Date(),
          expiryDate: r.expiry_date ? new Date(r.expiry_date) : new Date(),
          sourceNote: r.source_note,
          purchasePrice: r.purchase_price,
          productInfo: r.product_info,
          notes: r.notes,
          status: r.status,
          paymentStatus: r.payment_status,
          isAccountBased: !!r.is_account_based,
          accountColumns: r.account_columns || [],
          accountData: r.account_data || {},
          totalSlots: r.total_slots || 0,
          profiles: Array.isArray(r.profiles) ? r.profiles : [],
          refundAmount: r.refund_amount || 0,
          refundAt: r.refund_at ? new Date(r.refund_at) : undefined,
          createdAt: r.created_at ? new Date(r.created_at) : new Date(),
          updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
        }));
        expenses = (ex.data || []).map((r: any) => ({
          id: r.id,
          code: r.code,
          type: r.type,
          amount: r.amount || 0,
          description: r.description || '',
          date: r.date ? new Date(r.date) : new Date(),
          createdBy: 'system',
          createdAt: r.created_at ? new Date(r.created_at) : new Date(),
          updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
        }));
        inventoryRenewals = (renewals.data || []).map((r: any) => ({
          id: r.id,
          inventoryId: r.inventory_id,
          months: r.months,
          amount: r.amount || 0,
          previousExpiryDate: r.previous_expiry_date ? new Date(r.previous_expiry_date) : new Date(),
          newExpiryDate: r.new_expiry_date ? new Date(r.new_expiry_date) : new Date(),
          note: r.note,
          createdBy: 'system',
          createdAt: r.created_at ? new Date(r.created_at) : new Date()
        }));
      } else {
        [products, packages, customers, orders, inventoryItems, expenses] = await Promise.all([
          Database.getProducts(),
          Database.getPackages(),
          Database.getCustomers(),
          Database.getOrders(),
          Database.getInventory(),
          Database.getExpenses()
        ]);
        // Fallback to local renewals
        inventoryRenewals = Database.getInventoryRenewals();
      }

      // Calculate stats - chỉ dùng sale_price từ order
      const getOrderSnapshotPrice = (order: Order): number => {
        // Exclude fully refunded orders from revenue
        if (order.paymentStatus === 'REFUNDED') return 0;

        // Chỉ dùng sale_price từ order, không dùng fallback
        const salePrice = (order as any).salePrice;
        if (typeof salePrice !== 'number' || isNaN(salePrice) || salePrice < 0) {
          return 0;
        }

        // Nếu có refundAmount, trừ khỏi salePrice để có doanh thu thực tế
        const refundAmount = (order as any).refundAmount || 0;
        const netRevenue = Math.max(0, salePrice - refundAmount);

        return netRevenue;
      };

      // Tính COGS đã điều chỉnh theo tỷ lệ refund
      const getAdjustedCOGS = (order: Order): number => {
        const cogs = ((order as any).cogs ?? order.cogs) || 0;
        if (cogs === 0) return 0;

        const salePrice = (order as any).salePrice;
        if (typeof salePrice !== 'number' || isNaN(salePrice) || salePrice <= 0) {
          return cogs;
        }

        const refundAmount = (order as any).refundAmount || 0;
        if (refundAmount <= 0) return cogs;

        // Điều chỉnh COGS theo tỷ lệ refund
        const refundRatio = refundAmount / salePrice;
        const adjustedCOGS = cogs * (1 - refundRatio);

        return Math.max(0, adjustedCOGS);
      };

      const isRevenueOrder = (order: Order): boolean => {
        if (order.paymentStatus !== 'PAID') return false;
        return order.status === 'COMPLETED' || order.status === 'EXPIRED';
      };

      const revenueOrders = orders.filter(isRevenueOrder);
      const soldOrderCount = orders.length;

      const totalRevenue = orders
        .filter(order => isRevenueOrder(order))
        .reduce((sum, order) => sum + getOrderSnapshotPrice(order), 0);

      const now = new Date();
      const base = new Date(now.getFullYear(), now.getMonth(), 1);
      const target = new Date(base);
      target.setMonth(target.getMonth() + selectedMonthOffset);
      const targetMonth = target.getMonth();
      const targetYear = target.getFullYear();
      const monthlyRevenue = orders
        .filter(order => {
          const orderDate = new Date(order.purchaseDate);
          return isRevenueOrder(order) &&
            orderDate.getMonth() === targetMonth &&
            orderDate.getFullYear() === targetYear;
        })
        .reduce((sum, order) => sum + getOrderSnapshotPrice(order), 0);

      const lastTarget = new Date(targetYear, targetMonth, 1);
      lastTarget.setMonth(lastTarget.getMonth() - 1);
      const lastMonth = lastTarget.getMonth();
      const lastMonthYear = lastTarget.getFullYear();
      const lastMonthRevenue = orders
        .filter(order => {
          const orderDate = new Date(order.purchaseDate);
          return isRevenueOrder(order) &&
            orderDate.getMonth() === lastMonth &&
            orderDate.getFullYear() === lastMonthYear;
        })
        .reduce((sum, order) => sum + getOrderSnapshotPrice(order), 0);

      const revenueGrowth = lastMonthRevenue > 0 ?
        ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;

      // Calculate total profit using order.cogs (COGS from inventory, adjusted for refunds)
      const totalProfit = orders
        .filter(order => isRevenueOrder(order))
        .reduce((sum, order) => sum + (getOrderSnapshotPrice(order) - getAdjustedCOGS(order)), 0);

      // Calculate monthly profit using order.cogs (adjusted for refunds)
      const monthlyProfit = orders
        .filter(order => {
          const orderDate = new Date(order.purchaseDate);
          return isRevenueOrder(order) &&
            orderDate.getMonth() === targetMonth &&
            orderDate.getFullYear() === targetYear;
        })
        .reduce((sum, order) => sum + (getOrderSnapshotPrice(order) - getAdjustedCOGS(order)), 0);

      // Calculate last month profit using order.cogs (adjusted for refunds)
      const lastMonthProfit = orders
        .filter(order => {
          const orderDate = new Date(order.purchaseDate);
          return isRevenueOrder(order) &&
            orderDate.getMonth() === lastMonth &&
            orderDate.getFullYear() === lastMonthYear;
        })
        .reduce((sum, order) => sum + (getOrderSnapshotPrice(order) - getAdjustedCOGS(order)), 0);

      const profitGrowth = lastMonthProfit > 0 ?
        ((monthlyProfit - lastMonthProfit) / lastMonthProfit) * 100 : 0;

      // Calculate total expenses
      const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);

      // Calculate monthly expenses
      const monthlyExpenses = expenses
        .filter(expense => {
          const expenseDate = new Date(expense.date);
          return expenseDate.getMonth() === targetMonth &&
            expenseDate.getFullYear() === targetYear;
        })
        .reduce((sum, expense) => sum + expense.amount, 0);

      // Import cost from inventory: sum of purchase prices by month + renewals in that month
      // Tránh trùng với COGS: chỉ tính chi phí nhập hàng cho items CHƯA BÁN trong tháng đó
      // (vì COGS đã trừ purchase_price của hàng đã bán rồi)

      // Đếm số slot đã bán trong tháng cho mỗi inventory item (từ orders)
      const soldSlotsInMonth: Record<string, number> = {};
      orders
        .filter(order => {
          const orderDate = new Date(order.purchaseDate);
          return isRevenueOrder(order) &&
            orderDate.getMonth() === targetMonth &&
            orderDate.getFullYear() === targetYear &&
            order.inventoryItemId;
        })
        .forEach(order => {
          if (order.inventoryItemId) {
            soldSlotsInMonth[order.inventoryItemId] = (soldSlotsInMonth[order.inventoryItemId] || 0) + 1;
          }
        });

      // Chi phí nhập hàng tháng này = purchase_price của items nhập trong tháng NHƯNG CHƯA BÁN trong tháng đó
      // Với multi-slot account: tính theo số slot chưa bán
      // Chỉ tính cho items đã thanh toán (PAID) - vì chỉ khi đã thanh toán mới là chi phí thực tế
      const importCostByMonth = (inventoryItems as InventoryItem[])
        .filter(i => {
          const purchaseDate = new Date(i.purchaseDate);
          const isInMonth = purchaseDate.getMonth() === targetMonth && purchaseDate.getFullYear() === targetYear;
          const isPaid = !i.paymentStatus || i.paymentStatus === 'PAID'; // Chỉ tính cho items đã thanh toán
          return isInMonth && isPaid;
        })
        .reduce((s, i) => {
          const soldSlots = soldSlotsInMonth[i.id] || 0;
          if (i.isAccountBased && i.totalSlots && i.totalSlots > 0) {
            // Multi-slot account: tính theo số slot chưa bán
            const remainingSlots = i.totalSlots - soldSlots;
            if (remainingSlots > 0) {
              const costPerSlot = (i.purchasePrice || 0) / i.totalSlots;
              return s + (costPerSlot * remainingSlots);
            }
          } else {
            // Single item: nếu chưa bán thì tính toàn bộ purchase_price
            if (soldSlots === 0) {
              return s + (i.purchasePrice || 0);
            }
          }
          return s;
        }, 0);

      const renewalCostByMonth = inventoryRenewals
        .filter(r => r.createdAt.getMonth() === targetMonth && r.createdAt.getFullYear() === targetYear)
        .reduce((s, r) => s + (r.amount || 0), 0);
      const monthlyImportCost = importCostByMonth + renewalCostByMonth;

      // Tổng chi phí nhập hàng đã thanh toán trong tháng (không phân biệt đã bán hay chưa)
      const monthlyPaidImportCost = (inventoryItems as InventoryItem[])
        .filter(i => {
          const purchaseDate = new Date(i.purchaseDate);
          const isInMonth = purchaseDate.getMonth() === targetMonth && purchaseDate.getFullYear() === targetYear;
          const isPaid = !i.paymentStatus || i.paymentStatus === 'PAID';
          return isInMonth && isPaid;
        })
        .reduce((s, i) => s + (i.purchasePrice || 0), 0)
        + renewalCostByMonth;

      // All-time import cost: tương tự, tính theo số slot chưa bán
      // Đếm số slot đã bán cho mỗi inventory item (từ orders)
      const allSoldSlots: Record<string, number> = {};
      orders
        .filter(order => isRevenueOrder(order) && order.inventoryItemId)
        .forEach(order => {
          if (order.inventoryItemId) {
            allSoldSlots[order.inventoryItemId] = (allSoldSlots[order.inventoryItemId] || 0) + 1;
          }
        });

      // Tổng chi phí nhập hàng = purchase_price của items CHƯA BÁN (tính theo slot) + renewals
      // Với multi-slot account: tính theo số slot chưa bán
      // Chỉ tính cho items đã thanh toán (PAID) - vì chỉ khi đã thanh toán mới là chi phí thực tế
      const totalImportCost = (inventoryItems as InventoryItem[])
        .filter(i => {
          const isPaid = !i.paymentStatus || i.paymentStatus === 'PAID'; // Chỉ tính cho items đã thanh toán
          return isPaid;
        })
        .reduce((s, i) => {
          const soldSlots = allSoldSlots[i.id] || 0;
          if (i.isAccountBased && i.totalSlots && i.totalSlots > 0) {
            // Multi-slot account: tính theo số slot chưa bán
            const remainingSlots = i.totalSlots - soldSlots;
            if (remainingSlots > 0) {
              const costPerSlot = (i.purchasePrice || 0) / i.totalSlots;
              return s + (costPerSlot * remainingSlots);
            }
          } else {
            // Single item: nếu chưa bán thì tính toàn bộ purchase_price
            if (soldSlots === 0) {
              return s + (i.purchasePrice || 0);
            }
          }
          return s;
        }, 0)
        + inventoryRenewals.reduce((s, r) => s + (r.amount || 0), 0);

      // Tổng chi phí nhập hàng đã thanh toán (tất cả thời gian, không phân biệt đã bán hay chưa)
      const totalPaidImportCost = (inventoryItems as InventoryItem[])
        .filter(i => {
          const isPaid = !i.paymentStatus || i.paymentStatus === 'PAID';
          return isPaid;
        })
        .reduce((s, i) => s + (i.purchasePrice || 0), 0)
        + inventoryRenewals.reduce((s, r) => s + (r.amount || 0), 0);

      // Calculate refunds - tính tất cả refundAmount từ orders VÀ inventory
      // 1. Tiền hoàn đơn hàng
      const orderRefundsTotal = orders.reduce((s, o: any) => s + (o.refundAmount || 0), 0);
      const orderRefundsMonthly = orders
        .filter((o: any) => {
          const refundAmount = o.refundAmount || 0;
          if (refundAmount <= 0) return false;
          const refundDate = o.refundAt ? new Date(o.refundAt) : new Date(o.purchaseDate);
          return refundDate.getMonth() === targetMonth && refundDate.getFullYear() === targetYear;
        })
        .reduce((s, o: any) => s + (o.refundAmount || 0), 0);

      // 2. Tiền hoàn kho hàng (chỉ tính items đã PAID và sau đó REFUNDED)
      const inventoryRefundsTotal = (inventoryItems as any[])
        .filter((i: any) => i.paymentStatus === 'REFUNDED' && (i.refundAmount || 0) > 0)
        .reduce((s, i: any) => s + (i.refundAmount || 0), 0);
      const inventoryRefundsMonthly = (inventoryItems as any[])
        .filter((i: any) => {
          const refundAmount = i.refundAmount || 0;
          if (refundAmount <= 0 || i.paymentStatus !== 'REFUNDED') return false;
          const refundDate = i.refundAt ? new Date(i.refundAt) : new Date(i.purchaseDate);
          return refundDate.getMonth() === targetMonth && refundDate.getFullYear() === targetYear;
        })
        .reduce((s, i: any) => s + (i.refundAmount || 0), 0);

      // 3. Tổng tiền hoàn = đơn hàng + kho hàng
      const totalRefunds = orderRefundsTotal + inventoryRefundsTotal;
      const monthlyRefunds = orderRefundsMonthly + inventoryRefundsMonthly;

      // Calculate net profit (gross profit - external expenses - import cost)
      // COGS = giá vốn của hàng đã bán (snapshot khi bán)
      // Import cost = chi phí nhập hàng mới (có thể chưa bán)
      // Refunds đã được trừ trong revenue rồi (qua getOrderSnapshotPrice), không cần trừ lại
      // Cần trừ cả hai vì chúng khác nhau
      const netProfit = totalProfit - totalExpenses - totalImportCost;
      const monthlyNetProfit = monthlyProfit - monthlyExpenses - monthlyImportCost;

      const availableInventory = inventoryItems.filter((item: InventoryItem) => item.status === 'AVAILABLE').length;
      const needsUpdateInventory = inventoryItems.filter((item: InventoryItem) => item.status === 'NEEDS_UPDATE').length;
      const soldInventory = inventoryItems.filter((item: InventoryItem) => item.status === 'SOLD').length;
      const expiredInventory = inventoryItems.filter(i => {
        const t = new Date(i.expiryDate).getTime();
        return t < Date.now() && i.status !== 'SOLD';
      }).length;
      const expiringSoon7Count = inventoryItems.filter(i => {
        const t = new Date(i.expiryDate).getTime();
        return t >= Date.now() && t <= Date.now() + 7 * 24 * 3600 * 1000 && i.status !== 'SOLD';
      }).length;

      // Backlog & customer split
      const unpaidOrders = orders.filter(o => o.status !== 'CANCELLED' && o.paymentStatus === 'UNPAID');
      const processingOrders = orders.filter(o => o.status === 'PROCESSING');
      const cancelledOrders = orders.filter(o => o.status === 'CANCELLED');
      const expectedRevenue = unpaidOrders.reduce((s, o) => s + getOrderSnapshotPrice(o), 0);
      const ctvCount = customers.filter(c => c.type === 'CTV').length;
      const retailCount = customers.filter(c => c.type !== 'CTV').length;

      // Orders expiring within 7 days (COMPLETED or ACTIVE states)
      const nowOrder = Date.now();
      const in7 = nowOrder + 7 * 24 * 3600 * 1000;
      const expiringOrders7Count = orders.filter(o => {
        const t = new Date(o.expiryDate).getTime();
        return t >= nowOrder && t <= in7 && o.status !== 'CANCELLED';
      }).length;


      // Trends 12 months
      const months = rangeMonths(addMonths(new Date(new Date().getFullYear(), new Date().getMonth(), 1), -11), new Date());
      const idx: Record<string, TrendsPoint> = {};
      const initial: TrendsPoint[] = months.map(m => ({ key: toMonthKey(m), revenue: 0, profit: 0, expenses: 0 }));
      initial.forEach(p => { idx[p.key] = p; });
      for (const o of revenueOrders) {
        const k = toMonthKey(new Date(o.purchaseDate.getFullYear(), o.purchaseDate.getMonth(), 1));
        const b = idx[k];
        if (b) {
          const p = getOrderSnapshotPrice(o);
          b.revenue += p;
          b.profit += (p - getAdjustedCOGS(o));
        }
      }
      for (const e of expenses) {
        const d = new Date(e.date);
        const k = toMonthKey(new Date(d.getFullYear(), d.getMonth(), 1));
        const b = idx[k];
        if (b) b.expenses += e.amount || 0;
      }

      // Top packages - đếm TẤT CẢ orders (không filter theo thời gian) cho số đơn và doanh thu
      // Filter orders hợp lệ (không CANCELLED)
      const validOrders = orders.filter(order => order.status !== 'CANCELLED');

      // Tạo map từ inventoryItemId -> productId để xử lý shared pool
      const inventoryItemById: Record<string, InventoryItem> = Object.fromEntries(
        inventoryItems.map(item => [item.id, item])
      );

      const pkgAggMap: Record<string, PackageAggRow> = {};
      const productById: Record<string, Product> = Object.fromEntries(products.map(p => [p.id, p]));
      const packagesById: Record<string, ProductPackage> = Object.fromEntries(packages.map(p => [p.id, p]));

      // Đếm TẤT CẢ orders (không filter theo thời gian) cho số đơn
      for (const o of validOrders) {
        let pid = o.packageId;
        let pkg: ProductPackage | undefined;
        let prodId: string | undefined;

        // Xử lý shared pool: nếu không có packageId, lấy từ inventoryItem
        if (!pid && o.inventoryItemId) {
          const invItem = inventoryItemById[o.inventoryItemId];
          if (invItem) {
            prodId = invItem.productId;
            // Với shared pool, tìm package đầu tiên của product đó
            if (prodId) {
              const productPkgs = packages.filter(p => p.productId === prodId);
              if (productPkgs.length > 0) {
                pkg = productPkgs[0]; // Lấy package đầu tiên để group
                pid = pkg.id;
              }
            }
          }
        } else if (pid) {
          pkg = packages.find(p => p.id === pid);
          prodId = pkg?.productId;
        }

        // Skip nếu vẫn không có packageId hoặc productId
        if (!pid && !prodId) continue;

        // Dùng packageId làm key, hoặc productId nếu không có packageId
        const key = pid || `product_${prodId}`;

        // Đếm tất cả orders (trừ CANCELLED), không phân biệt status
        if (!pkgAggMap[key]) {
          const prodName = prodId ? (productById[prodId]?.name || '') : '';
          const pkgName = pkg?.name || (prodId && productById[prodId]?.sharedInventoryPool ? 'Kho chung' : 'Gói');
          pkgAggMap[key] = {
            packageId: pid || key,
            name: pkgName,
            productName: prodName,
            revenue: 0,
            profit: 0,
            orders: 0
          };
        }
        pkgAggMap[key].orders += 1;
      }

      // Tính doanh thu và lãi từ TẤT CẢ orders (không filter theo thời gian)
      for (const o of validOrders) {
        let pid = o.packageId;
        let prodId: string | undefined;

        // Xử lý shared pool: nếu không có packageId, lấy từ inventoryItem
        if (!pid && o.inventoryItemId) {
          const invItem = inventoryItemById[o.inventoryItemId];
          if (invItem) {
            prodId = invItem.productId;
            if (prodId) {
              const productPkgs = packages.filter(p => p.productId === prodId);
              if (productPkgs.length > 0) {
                pid = productPkgs[0].id;
              }
            }
          }
        } else if (pid) {
          const pkg = packages.find(p => p.id === pid);
          prodId = pkg?.productId;
        }

        // Skip nếu vẫn không có packageId hoặc productId
        if (!pid && !prodId) continue;

        // Dùng packageId làm key, hoặc productId nếu không có packageId
        const key = pid || `product_${prodId}`;

        // Chỉ tính doanh thu và lãi từ orders đã thanh toán (getOrderSnapshotPrice đã xử lý refund)
        const isPaidRevenue = isRevenueOrder(o);
        if (isPaidRevenue && pkgAggMap[key]) {
          const price = getOrderSnapshotPrice(o);
          const profit = price - getAdjustedCOGS(o);
          pkgAggMap[key].revenue += price;
          pkgAggMap[key].profit += profit;
        }
      }
      const pkgAggRows = Object.values(pkgAggMap);

      // Top customers - đếm TẤT CẢ orders và tính doanh thu (không filter theo thời gian)
      const customerAggMap: Record<string, CustomerAggRow> = {};
      const customersById: Record<string, Customer> = Object.fromEntries(customers.map(c => [c.id, c]));

      // Đếm TẤT CẢ orders và tính doanh thu (không filter theo thời gian)
      for (const o of validOrders) {
        const cid = o.customerId;
        if (!cid) continue; // Skip orders without customerId

        // Đếm tất cả orders (trừ CANCELLED), không phân biệt status
        if (!customerAggMap[cid]) {
          const customer = customers.find(c => c.id === cid);
          customerAggMap[cid] = {
            customerId: cid,
            name: customer?.name || 'Khách hàng',
            code: customer?.code || '',
            type: customer?.type || 'RETAIL',
            revenue: 0,
            profit: 0,
            orders: 0
          };
        }
        customerAggMap[cid].orders += 1;

        // Tính doanh thu và lãi từ orders đã thanh toán (getOrderSnapshotPrice đã xử lý refund)
        const isPaidRevenue = isRevenueOrder(o);
        if (isPaidRevenue) {
          const price = getOrderSnapshotPrice(o);
          const profit = price - getAdjustedCOGS(o);
          customerAggMap[cid].revenue += price;
          customerAggMap[cid].profit += profit;
        }
      }
      const customerAggRows = Object.values(customerAggMap);

      setStats({
        totalProducts: products.length,
        totalPackages: packages.length,
        totalCustomers: customers.length,
        totalOrders: orders.length,
        soldOrderCount,
        totalRevenue,
        monthlyRevenue,
        revenueGrowth,
        totalProfit,
        monthlyProfit,
        profitGrowth,
        totalExpenses,
        monthlyExpenses,
        totalRefunds,
        monthlyRefunds,
        netProfit,
        monthlyNetProfit,
        inventoryItems: inventoryItems.length,
        availableInventory,
        needsUpdateInventory,
        soldInventory,
        expiredInventory,
        monthlyImportCost,
        totalImportCost,
        monthlyPaidImportCost,
        totalPaidImportCost,
        unpaidCount: unpaidOrders.length,
        processingCount: processingOrders.length,
        cancelledCount: cancelledOrders.length,
        expectedRevenue,
        ctvCount,
        retailCount,
        expiringSoonCount: expiringSoon7Count,
        expiringOrders7Count,
      });

      setTrends(initial);
      setTopPackages(pkgAggRows);
      setPackagesById(packagesById);
      setTopCustomers(customerAggRows);
      setCustomersById(customersById);

      // Get recent orders
      const sortedOrders = orders
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);
      setRecentOrders(sortedOrders);

    } catch (error) {
      setError('Không tải được dữ liệu dashboard. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  };

  const tabs = [
    { id: 'overview', label: 'Tổng quan', icon: <IconChart /> },
    { id: 'sales', label: 'Bán hàng', icon: <IconTrendingUp /> },
    { id: 'inventory', label: 'Kho hàng', icon: <IconBox /> },
    { id: 'customers', label: 'Khách hàng', icon: <IconUsers /> },
  ];

  if (loading) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Dashboard</h2>
        </div>
        <div className="card-body">
          <div className="stats-grid">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="stat-card">
                <div style={{ width: 36, height: 36, background: '#eee', borderRadius: 6 }} />
                <div className="stat-content">
                  <div style={{ width: 80, height: 20, background: '#eee', borderRadius: 4, marginBottom: 6 }} />
                  <div style={{ width: 120, height: 12, background: '#f0f0f0', borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header">
              <h3 className="card-title">Xu hướng 12 tháng</h3>
            </div>
            <div className="card-body">
              <div style={{ width: '100%', height: 320, background: '#f5f5f5', borderRadius: 8 }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentTitle = tabs.find(t => t.id === activeTab)?.label || 'Dashboard';

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">{currentTitle}</h2>
      </div>
      {error && (
        <div className="alert alert-danger" role="alert" style={{ margin: '12px 16px 0' }}>
          {error}
        </div>
      )}

      <div className="dashboard-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`dashboard-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="dashboard-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            <div className="sales-stats">
              <div className="sales-card">
                <h3>Tổng sản phẩm</h3>
                <div className="sales-amount">{stats.totalProducts}</div>
              </div>

              <div className="sales-card">
                <h3>Tổng khách hàng</h3>
                <div className="sales-amount">{stats.totalCustomers}</div>
                <div className="sales-subtitle">CTV {stats.ctvCount} / Lẻ {stats.retailCount}</div>
              </div>

              <div className="sales-card">
                <h3>Tổng đơn hàng</h3>
                <div className="sales-amount">{stats.totalOrders}</div>
              </div>

              <div className="sales-card">
                <h3>Tổng doanh thu</h3>
                <div className="sales-amount">{formatCurrency(stats.totalRevenue)}</div>
                <div className="sales-subtitle">({stats.soldOrderCount} đơn đã bán)</div>
              </div>

              <div className="sales-card">
                <h3>Tổng lãi thực tế</h3>
                <div className="sales-amount">{formatCurrency(stats.netProfit)}</div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header">
                <h3 className="card-title">Đơn hàng gần đây</h3>
              </div>
              <div className="card-body">
                <div className="orders-list">
                  {recentOrders.map(order => (
                    <button
                      key={order.id}
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'orders' }));
                        // Deep link exact order in OrderList via orderId param
                        window.dispatchEvent(new CustomEvent('app:search', { detail: { orderId: order.id } }));
                      }}
                      className="order-item"
                    >
                      <div className="order-info">
                        <span className="order-code">{order.code}</span>
                        <span className="order-date">{formatDate(order.createdAt)}</span>
                      </div>
                      <div className="order-status">
                        <span className={`status-badge ${order.status.toLowerCase()}`}>
                          {order.status === 'PROCESSING' ? 'Đang xử lý' :
                            order.status === 'COMPLETED' ? 'Hoàn thành' : 'Đã hủy'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sales' && (
          <div className="sales-tab">
            <div className="d-flex align-items-center gap-2" style={{ marginBottom: 12 }}>
              <label>Tháng:</label>
              <select
                className="form-control"
                style={{ maxWidth: 180 }}
                value={selectedMonthOffset}
                onChange={(e) => setSelectedMonthOffset(parseInt(e.target.value, 10))}
              >
                {Array.from({ length: 12 }, (_, idx) => 0 - idx).map(v => {
                  const now = new Date();
                  const base = new Date(now.getFullYear(), now.getMonth(), 1);
                  base.setMonth(base.getMonth() + v);
                  const label = `${String(base.getMonth() + 1).padStart(2, '0')}/${base.getFullYear()}`;
                  return <option key={v} value={v}>{v === 0 ? `Hiện tại (${label})` : label}</option>;
                })}
              </select>
            </div>
            <div className="sales-stats">
              <div style={{ gridColumn: '1 / -1', marginBottom: 8, fontWeight: 600 }}>Tháng này</div>
              <div className="sales-card">
                <h3>Doanh thu tháng này</h3>
                <div className="sales-amount">{formatCurrency(stats.monthlyRevenue)}</div>
                <div className={`sales-growth ${stats.revenueGrowth >= 0 ? 'positive' : 'negative'}`}>
                  {stats.revenueGrowth >= 0 ? <IconTrendingUp /> : <IconTrendingDown />}
                  {Math.abs(stats.revenueGrowth).toFixed(1)}%
                </div>
              </div>

              <div className="sales-card">
                <h3>Tiền hoàn tháng này</h3>
                <div className="sales-amount">{formatCurrency(stats.monthlyRefunds)}</div>
                <div className="sales-subtitle">Tính theo thời điểm hoàn</div>
              </div>

              <div className="sales-card">
                <h3>Chi phí tháng này</h3>
                <div className="sales-amount">{formatCurrency(stats.monthlyExpenses)}</div>
                <div className="sales-subtitle">Chi phí ngoài lề</div>
              </div>

              <div className="sales-card">
                <h3>Chi phí nhập hàng</h3>
                <div className="sales-amount">{formatCurrency(stats.monthlyPaidImportCost)}</div>
                <div className="sales-subtitle">Tổng chi phí nhập kho đã thanh toán</div>
              </div>

              <div className="sales-card">
                <h3>Lãi thực tế tháng này</h3>
                <div className="sales-amount">{formatCurrency(stats.monthlyNetProfit)}</div>
                <div className={`sales-growth ${stats.monthlyNetProfit >= 0 ? 'positive' : 'negative'}`}>
                  {stats.monthlyNetProfit >= 0 ? <IconTrendingUp /> : <IconTrendingDown />}
                  Lãi thực tế
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1', marginTop: 16, marginBottom: 8, fontWeight: 600 }}>Tất cả thời gian</div>
              <div className="sales-card">
                <h3>Tổng doanh thu</h3>
                <div className="sales-amount">{formatCurrency(stats.totalRevenue)}</div>
                <div className="sales-subtitle">Tất cả thời gian</div>
              </div>

              <div className="sales-card">
                <h3>Tổng tiền hoàn</h3>
                <div className="sales-amount">{formatCurrency(stats.totalRefunds)}</div>
                <div className="sales-subtitle">Tất cả thời gian</div>
              </div>

              <div className="sales-card">
                <h3>Tổng chi phí ngoài lề</h3>
                <div className="sales-amount">{formatCurrency(stats.totalExpenses)}</div>
                <div className="sales-subtitle">Tất cả thời gian</div>
              </div>

              <div className="sales-card">
                <h3>Tổng chi phí nhập hàng</h3>
                <div className="sales-amount">{formatCurrency(stats.totalPaidImportCost)}</div>
                <div className="sales-subtitle">Tổng chi phí nhập kho đã thanh toán</div>
              </div>

              <div className="sales-card">
                <h3>Tổng lãi thực tế</h3>
                <div className="sales-amount">{formatCurrency(stats.netProfit)}</div>
                <div className="sales-subtitle">Lãi gộp (doanh thu - COGS) - chi phí ngoài lề - chi phí nhập hàng</div>
              </div>
            </div>

            <div className="orders-summary">
              <h3>Backlog đơn hàng</h3>
              <div className="orders-stats">
                <button className="order-stat" onClick={() => {
                  window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'orders' }));
                  setTimeout(() => window.dispatchEvent(new CustomEvent('app:search', { detail: { payment: 'UNPAID', page: 1 } })), 100);
                }}>
                  <span className="stat-number">{stats.unpaidCount}</span><span className="stat-label">Chưa thanh toán</span>
                </button>
                <button className="order-stat" onClick={() => {
                  window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'orders' }));
                  setTimeout(() => window.dispatchEvent(new CustomEvent('app:search', { detail: { status: 'PROCESSING', page: 1 } })), 100);
                }}>
                  <span className="stat-number">{stats.processingCount}</span><span className="stat-label">Đang xử lý</span>
                </button>
                <button className="order-stat" onClick={() => {
                  window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'orders' }));
                  setTimeout(() => window.dispatchEvent(new CustomEvent('app:search', { detail: { status: 'CANCELLED', page: 1 } })), 100);
                }}>
                  <span className="stat-number">{stats.cancelledCount}</span><span className="stat-label">Đã hủy</span>
                </button>
                <button className="order-stat" onClick={() => {
                  window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'orders' }));
                  setTimeout(() => window.dispatchEvent(new CustomEvent('app:search', { detail: { payment: 'UNPAID', status: '', page: 1 } })), 100);
                }}>
                  <span className="stat-number">{formatCurrencyVND(stats.expectedRevenue)}</span><span className="stat-label">Doanh thu kỳ vọng</span>
                </button>
                <button className="order-stat" onClick={() => {
                  window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'orders' }));
                  setTimeout(() => window.dispatchEvent(new CustomEvent('app:search', { detail: { expiry: 'EXPIRING', page: 1 } })), 100);
                }}>
                  <span className="stat-number">{stats.expiringOrders7Count}</span><span className="stat-label">Sắp hết hạn (≤7 ngày)</span>
                </button>
              </div>
            </div>
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header">
                <h3 className="card-title">Xu hướng 12 tháng</h3>
              </div>
              <div className="card-body">
                <TrendsChart data={trends} />
              </div>
            </div>
            <TopPackagesTable rows={topPackages} packagesById={packagesById} />
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="inventory-tab">
            <div className="inventory-stats">
              <div className="inventory-card">
                <h3>Tổng kho hàng</h3>
                <div className="inventory-amount">{stats.inventoryItems}</div>
                <div className="inventory-subtitle">Sản phẩm trong kho</div>
              </div>

              <div className="inventory-breakdown">
                <button className="breakdown-item available" onClick={() => {
                  window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'warehouse' }));
                  setTimeout(() => window.dispatchEvent(new CustomEvent('app:search', { detail: { status: 'AVAILABLE', page: 1 } })), 100);
                }}>
                  <span className="breakdown-number">{stats.availableInventory}</span>
                  <span className="breakdown-label">Có sẵn</span>
                </button>
                <button className="breakdown-item" onClick={() => {
                  window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'warehouse' }));
                  setTimeout(() => window.dispatchEvent(new CustomEvent('app:search', { detail: { status: 'NEEDS_UPDATE', page: 1 } })), 100);
                }}>
                  <span className="breakdown-number">{stats.needsUpdateInventory}</span>
                  <span className="breakdown-label">Cần update</span>
                </button>
                <button className="breakdown-item sold" onClick={() => {
                  window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'warehouse' }));
                  setTimeout(() => window.dispatchEvent(new CustomEvent('app:search', { detail: { status: 'SOLD', page: 1 } })), 100);
                }}>
                  <span className="breakdown-number">{stats.soldInventory}</span>
                  <span className="breakdown-label">Đã bán</span>
                </button>
                <button className="breakdown-item expired" onClick={() => {
                  window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'warehouse' }));
                  setTimeout(() => window.dispatchEvent(new CustomEvent('app:search', { detail: { status: 'EXPIRED', page: 1 } })), 100);
                }}>
                  <span className="breakdown-number">{stats.expiredInventory}</span>
                  <span className="breakdown-label">Hết hạn</span>
                </button>
                <button className="breakdown-item" onClick={() => {
                  window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'warehouse' }));
                  setTimeout(() => window.dispatchEvent(new CustomEvent('app:search', { detail: { status: 'EXPIRING_SOON', page: 1 } })), 100);
                }}>
                  <span className="breakdown-number">{stats.expiringSoonCount}</span>
                  <span className="breakdown-label">Sắp hết hạn (7 ngày)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'customers' && (
          <div className="customers-tab">
            <div className="customers-stats">
              <div className="customer-card">
                <h3>Tổng khách hàng</h3>
                <div className="customer-amount">{stats.totalCustomers}</div>
                <div className="customer-subtitle">Đã đăng ký</div>
              </div>

              <div className="customer-breakdown">
                <button className="breakdown-item ctv" onClick={() => {
                  window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'customers' }));
                  setTimeout(() => window.dispatchEvent(new CustomEvent('app:search', { detail: { type: 'CTV', page: 1 } })), 100);
                }}>
                  <span className="breakdown-number">{stats.ctvCount}</span>
                  <span className="breakdown-label">Cộng tác viên</span>
                </button>
                <button className="breakdown-item retail" onClick={() => {
                  window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'customers' }));
                  setTimeout(() => window.dispatchEvent(new CustomEvent('app:search', { detail: { type: 'RETAIL', page: 1 } })), 100);
                }}>
                  <span className="breakdown-number">{stats.retailCount}</span>
                  <span className="breakdown-label">Khách lẻ</span>
                </button>
              </div>
            </div>
            <TopCustomersTable rows={topCustomers} customersById={customersById} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
