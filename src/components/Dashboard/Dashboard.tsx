import React, { useState, useEffect } from 'react';
import { Database } from '../../utils/database';
import { Product, ProductPackage, Customer, Order, InventoryItem, Expense } from '../../types';
import { IconBox, IconUsers, IconCart, IconChart, IconTrendingUp, IconTrendingDown, IconDollarSign, IconProfit } from '../Icons';

interface DashboardStats {
  totalProducts: number;
  totalPackages: number;
  totalCustomers: number;
  totalOrders: number;
  totalRevenue: number;
  monthlyRevenue: number;
  revenueGrowth: number;
  totalProfit: number;
  monthlyProfit: number;
  profitGrowth: number;
  totalExpenses: number;
  monthlyExpenses: number;
  netProfit: number; // Lãi thực tế sau khi trừ chi phí
  monthlyNetProfit: number;
  inventoryItems: number;
  availableInventory: number;
  reservedInventory: number;
  soldInventory: number;
  expiredInventory: number;
}

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    totalPackages: 0,
    totalCustomers: 0,
    totalOrders: 0,
    totalRevenue: 0,
    monthlyRevenue: 0,
    revenueGrowth: 0,
    totalProfit: 0,
    monthlyProfit: 0,
    profitGrowth: 0,
    totalExpenses: 0,
    monthlyExpenses: 0,
    netProfit: 0,
    monthlyNetProfit: 0,
    inventoryItems: 0,
    availableInventory: 0,
    reservedInventory: 0,
    soldInventory: 0,
    expiredInventory: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonthOffset, setSelectedMonthOffset] = useState<number>(0); // 0 = current, -1..-11 = previous months

  useEffect(() => {
    loadDashboardData();
  }, [selectedMonthOffset]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load all data including expenses
      const [products, packages, customers, orders, inventoryItems, expenses] = await Promise.all([
        Database.getProducts(),
        Database.getPackages(),
        Database.getCustomers(),
        Database.getOrders(),
        Database.getInventory(),
        Database.getExpenses()
      ]);

      // Calculate stats
      const totalRevenue = orders
        .filter(order => order.status === 'COMPLETED' && order.paymentStatus === 'PAID')
        .reduce((sum, order) => {
          const packageData = packages.find((p: ProductPackage) => p.id === order.packageId);
          if (packageData) {
            const price = order.useCustomPrice ? order.customPrice || 0 : 
              (order.customerId ? 
                (customers.find((c: Customer) => c.id === order.customerId)?.type === 'CTV' ? packageData.ctvPrice : packageData.retailPrice) : 
                packageData.retailPrice);
            return sum + price;
          }
          return sum;
        }, 0);

      const now = new Date();
      const base = new Date(now.getFullYear(), now.getMonth(), 1);
      const target = new Date(base);
      target.setMonth(target.getMonth() + selectedMonthOffset);
      const targetMonth = target.getMonth();
      const targetYear = target.getFullYear();
      const monthlyRevenue = orders
        .filter(order => {
          const orderDate = new Date(order.purchaseDate);
          return order.status === 'COMPLETED' && 
                 order.paymentStatus === 'PAID' &&
                 orderDate.getMonth() === targetMonth &&
                 orderDate.getFullYear() === targetYear;
        })
        .reduce((sum, order) => {
          const packageData = packages.find((p: ProductPackage) => p.id === order.packageId);
          if (packageData) {
            const price = order.useCustomPrice ? order.customPrice || 0 : 
              (order.customerId ? 
                (customers.find((c: Customer) => c.id === order.customerId)?.type === 'CTV' ? packageData.ctvPrice : packageData.retailPrice) : 
                packageData.retailPrice);
            return sum + price;
          }
          return sum;
        }, 0);

      const lastTarget = new Date(targetYear, targetMonth, 1);
      lastTarget.setMonth(lastTarget.getMonth() - 1);
      const lastMonth = lastTarget.getMonth();
      const lastMonthYear = lastTarget.getFullYear();
      const lastMonthRevenue = orders
        .filter(order => {
          const orderDate = new Date(order.purchaseDate);
          return order.status === 'COMPLETED' && 
                 order.paymentStatus === 'PAID' &&
                 orderDate.getMonth() === lastMonth &&
                 orderDate.getFullYear() === lastMonthYear;
        })
        .reduce((sum, order) => {
          const packageData = packages.find((p: ProductPackage) => p.id === order.packageId);
          if (packageData) {
            const price = order.useCustomPrice ? order.customPrice || 0 : 
              (order.customerId ? 
                (customers.find((c: Customer) => c.id === order.customerId)?.type === 'CTV' ? packageData.ctvPrice : packageData.retailPrice) : 
                packageData.retailPrice);
            return sum + price;
          }
          return sum;
        }, 0);

      const revenueGrowth = lastMonthRevenue > 0 ? 
        ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;

      // Calculate total profit
      const totalProfit = orders
        .filter(order => order.status === 'COMPLETED' && order.paymentStatus === 'PAID')
        .reduce((sum, order) => {
          const packageData = packages.find((p: ProductPackage) => p.id === order.packageId);
          if (packageData) {
            const price = order.useCustomPrice ? order.customPrice || 0 : 
              (order.customerId ? 
                (customers.find((c: Customer) => c.id === order.customerId)?.type === 'CTV' ? packageData.ctvPrice : packageData.retailPrice) : 
                packageData.retailPrice);
            return sum + (price - packageData.costPrice);
          }
          return sum;
        }, 0);

      // Calculate monthly profit
      const monthlyProfit = orders
        .filter(order => {
          const orderDate = new Date(order.purchaseDate);
          return order.status === 'COMPLETED' && 
                 order.paymentStatus === 'PAID' &&
                 orderDate.getMonth() === targetMonth &&
                 orderDate.getFullYear() === targetYear;
        })
        .reduce((sum, order) => {
          const packageData = packages.find((p: ProductPackage) => p.id === order.packageId);
          if (packageData) {
            const price = order.useCustomPrice ? order.customPrice || 0 : 
              (order.customerId ? 
                (customers.find((c: Customer) => c.id === order.customerId)?.type === 'CTV' ? packageData.ctvPrice : packageData.retailPrice) : 
                packageData.retailPrice);
            return sum + (price - packageData.costPrice);
          }
          return sum;
        }, 0);

      // Calculate last month profit
      const lastMonthProfit = orders
        .filter(order => {
          const orderDate = new Date(order.purchaseDate);
          return order.status === 'COMPLETED' && 
                 order.paymentStatus === 'PAID' &&
                 orderDate.getMonth() === lastMonth &&
                 orderDate.getFullYear() === lastMonthYear;
        })
        .reduce((sum, order) => {
          const packageData = packages.find((p: ProductPackage) => p.id === order.packageId);
          if (packageData) {
            const price = order.useCustomPrice ? order.customPrice || 0 : 
              (order.customerId ? 
                (customers.find((c: Customer) => c.id === order.customerId)?.type === 'CTV' ? packageData.ctvPrice : packageData.retailPrice) : 
                packageData.retailPrice);
            return sum + (price - packageData.costPrice);
          }
          return sum;
        }, 0);

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
      const importCostByMonth = (inventoryItems as InventoryItem[])
        .filter(i => new Date(i.purchaseDate).getMonth() === targetMonth && new Date(i.purchaseDate).getFullYear() === targetYear)
        .reduce((s, i) => s + (i.purchasePrice || 0), 0);
      const renewals = Database.getInventoryRenewals();
      const renewalCostByMonth = renewals
        .filter(r => r.createdAt.getMonth() === targetMonth && r.createdAt.getFullYear() === targetYear)
        .reduce((s, r) => s + (r.amount || 0), 0);
      const monthlyImportCost = importCostByMonth + renewalCostByMonth;

      // Calculate net profit (gross profit - expenses)
      const netProfit = totalProfit - totalExpenses;
      const monthlyNetProfit = monthlyProfit - (monthlyExpenses + monthlyImportCost);

      const availableInventory = inventoryItems.filter((item: InventoryItem) => item.status === 'AVAILABLE').length;
      const reservedInventory = inventoryItems.filter((item: InventoryItem) => item.status === 'RESERVED').length;
      const soldInventory = inventoryItems.filter((item: InventoryItem) => item.status === 'SOLD').length;
      const expiredInventory = inventoryItems.filter((item: InventoryItem) => item.status === 'EXPIRED').length;

      setStats({
        totalProducts: products.length,
        totalPackages: packages.length,
        totalCustomers: customers.length,
        totalOrders: orders.length,
        totalRevenue,
        monthlyRevenue,
        revenueGrowth,
        totalProfit,
        monthlyProfit,
        profitGrowth,
        totalExpenses,
        monthlyExpenses,
        netProfit,
        monthlyNetProfit,
        inventoryItems: inventoryItems.length,
        availableInventory,
        reservedInventory,
        soldInventory,
        expiredInventory,
      });

      // Get recent orders
      const sortedOrders = orders
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);
      setRecentOrders(sortedOrders);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
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
      <div className="dashboard">
        <div className="loading">Đang tải dữ liệu...</div>
      </div>
    );
  }

  const currentTitle = tabs.find(t => t.id === activeTab)?.label || 'Dashboard';

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">{currentTitle}</h2>
      </div>

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
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">
                  <IconBox />
                </div>
                <div className="stat-content">
                  <h3>{stats.totalProducts}</h3>
                  <p>Tổng sản phẩm</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <IconUsers />
                </div>
                <div className="stat-content">
                  <h3>{stats.totalCustomers}</h3>
                  <p>Tổng khách hàng</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <IconCart />
                </div>
                <div className="stat-content">
                  <h3>{stats.totalOrders}</h3>
                  <p>Tổng đơn hàng</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <IconDollarSign />
                </div>
                <div className="stat-content">
                  <h3>{formatCurrency(stats.totalRevenue)}</h3>
                  <p>Tổng doanh thu</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <IconProfit />
                </div>
                <div className="stat-content">
                  <h3>{formatCurrency(stats.totalProfit)}</h3>
                  <p>Tổng lãi</p>
                </div>
              </div>
            </div>

            <div className="recent-orders">
              <h2>Đơn hàng gần đây</h2>
              <div className="orders-list">
                {recentOrders.map(order => (
                  <div key={order.id} className="order-item">
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
                  </div>
                ))}
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
              <div className="sales-card">
                <h3>Doanh thu tháng này</h3>
                <div className="sales-amount">{formatCurrency(stats.monthlyRevenue)}</div>
                <div className={`sales-growth ${stats.revenueGrowth >= 0 ? 'positive' : 'negative'}`}>
                  {stats.revenueGrowth >= 0 ? <IconTrendingUp /> : <IconTrendingDown />}
                  {Math.abs(stats.revenueGrowth).toFixed(1)}%
                </div>
              </div>

              <div className="sales-card">
                <h3>Tổng doanh thu</h3>
                <div className="sales-amount">{formatCurrency(stats.totalRevenue)}</div>
                <div className="sales-subtitle">Tất cả thời gian</div>
              </div>

              <div className="sales-card">
                <h3>Lãi tháng này</h3>
                <div className="sales-amount">{formatCurrency(stats.monthlyProfit)}</div>
                <div className={`sales-growth ${stats.profitGrowth >= 0 ? 'positive' : 'negative'}`}>
                  {stats.profitGrowth >= 0 ? <IconTrendingUp /> : <IconTrendingDown />}
                  {Math.abs(stats.profitGrowth).toFixed(1)}%
                </div>
              </div>

              <div className="sales-card">
                <h3>Tổng lãi</h3>
                <div className="sales-amount">{formatCurrency(stats.totalProfit)}</div>
                <div className="sales-subtitle">Tất cả thời gian</div>
              </div>

              <div className="sales-card">
                <h3>Chi phí tháng này</h3>
                <div className="sales-amount">{formatCurrency(stats.monthlyExpenses)}</div>
                <div className="sales-subtitle">Chi phí ngoài lề</div>
              </div>

              <div className="sales-card">
                <h3>Chi phí nhập hàng</h3>
                <div className="sales-amount">{formatCurrency((() => {
                  // derive from net vs profit difference if needed; we already reduced net by import cost
                  // For display, recompute here for clarity
                  const now = new Date();
                  const base = new Date(now.getFullYear(), now.getMonth(), 1);
                  base.setMonth(base.getMonth() + selectedMonthOffset);
                  const targetMonth = base.getMonth();
                  const targetYear = base.getFullYear();
                  const inventoryItems = Database.getInventory();
                  const importCost = inventoryItems
                    .filter((i: any) => new Date(i.purchaseDate).getMonth() === targetMonth && new Date(i.purchaseDate).getFullYear() === targetYear)
                    .reduce((s: number, i: any) => s + (i.purchasePrice || 0), 0);
                  const renewals = Database.getInventoryRenewals();
                  const renewalCost = renewals
                    .filter((r: any) => r.createdAt.getMonth() === targetMonth && r.createdAt.getFullYear() === targetYear)
                    .reduce((s: number, r: any) => s + (r.amount || 0), 0);
                  return importCost + renewalCost;
                })())}</div>
                <div className="sales-subtitle">Giá mua + gia hạn kho</div>
              </div>

              <div className="sales-card">
                <h3>Lãi thực tế tháng này</h3>
                <div className="sales-amount">{formatCurrency(stats.monthlyNetProfit)}</div>
                <div className={`sales-growth ${stats.monthlyNetProfit >= 0 ? 'positive' : 'negative'}`}>
                  {stats.monthlyNetProfit >= 0 ? <IconTrendingUp /> : <IconTrendingDown />}
                  Lãi thực tế
                </div>
              </div>
            </div>

            <div className="orders-summary">
              <h3>Tổng quan đơn hàng</h3>
              <div className="orders-stats">
                <div className="order-stat">
                  <span className="stat-number">{stats.totalOrders}</span>
                  <span className="stat-label">Tổng đơn hàng</span>
                </div>
                <div className="order-stat">
                  <span className="stat-number">{stats.totalPackages}</span>
                  <span className="stat-label">Gói sản phẩm</span>
                </div>
              </div>
            </div>
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
                <div className="breakdown-item available">
                  <span className="breakdown-number">{stats.availableInventory}</span>
                  <span className="breakdown-label">Có sẵn</span>
                </div>
                <div className="breakdown-item reserved">
                  <span className="breakdown-number">{stats.reservedInventory}</span>
                  <span className="breakdown-label">Đã đặt</span>
                </div>
                <div className="breakdown-item sold">
                  <span className="breakdown-number">{stats.soldInventory}</span>
                  <span className="breakdown-label">Đã bán</span>
                </div>
                <div className="breakdown-item expired">
                  <span className="breakdown-number">{stats.expiredInventory}</span>
                  <span className="breakdown-label">Hết hạn</span>
                </div>
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
                <div className="breakdown-item ctv">
                  <span className="breakdown-number">
                    {stats.totalCustomers > 0 ? 
                      Math.round((stats.totalCustomers * 0.6)) : 0}
                  </span>
                  <span className="breakdown-label">Cộng tác viên</span>
                </div>
                <div className="breakdown-item retail">
                  <span className="breakdown-number">
                    {stats.totalCustomers > 0 ? 
                      Math.round((stats.totalCustomers * 0.4)) : 0}
                  </span>
                  <span className="breakdown-label">Khách lẻ</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
