import React, { useState, useEffect, useMemo } from 'react';
import { Order, Customer, ProductPackage, Product, OrderStatus, ORDER_STATUSES, PaymentStatus, PAYMENT_STATUSES, Warranty } from '../../types';
import { getSupabase } from '../../utils/supabaseClient';
import { Database } from '../../utils/database';
import OrderForm from './OrderForm';
// removed export button
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { exportToXlsx } from '../../utils/excel';

const OrderList: React.FC = () => {
  const { state } = useAuth();
  const { notify } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [warrantiesForOrder, setWarrantiesForOrder] = useState<Warranty[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<OrderStatus | ''>('');
  const [filterPayment, setFilterPayment] = useState<PaymentStatus | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expiryFilter, setExpiryFilter] = useState<'EXPIRING' | 'EXPIRED' | 'ACTIVE' | ''>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [refundState, setRefundState] = useState<null | {
    order: Order;
    errorDate: string;
    amount: number;
  }>(null);
  const [renewState, setRenewState] = useState<null | {
    order: Order;
    packageId: string;
    useCustomPrice: boolean;
    customPrice: number;
    note: string;
    paymentStatus: PaymentStatus;
  }>(null);

  useEffect(() => {
    loadData();
  }, []);

  // Initialize filters from URL (no localStorage)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q') || '';
      const status = (params.get('status') || '') as OrderStatus | '';
      const payment = (params.get('payment') || '') as PaymentStatus | '';
      const from = params.get('from') || '';
      const to = params.get('to') || '';
      const expiry = (params.get('expiry') || '') as 'EXPIRING' | 'EXPIRED' | 'ACTIVE' | '';
      const p = parseInt(params.get('page') || '1', 10);
      const l = parseInt((params.get('limit') || '10'), 10);
      setSearchTerm(q);
      setDebouncedSearchTerm(q);
      setFilterStatus(status);
      setFilterPayment(payment);
      setDateFrom(from);
      setDateTo(to);
      setExpiryFilter(expiry);
      setPage(!Number.isNaN(p) && p > 0 ? p : 1);
      if (!Number.isNaN(l) && l > 0) setLimit(l);
    } catch {}
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Reset page on filter/search changes (debounced)
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchTerm, filterStatus, filterPayment, dateFrom, dateTo, expiryFilter]);

  // No localStorage persistence

  // Sync URL with current filters
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (debouncedSearchTerm) params.set('q', debouncedSearchTerm); else params.delete('q');
      if (filterStatus) params.set('status', filterStatus as string); else params.delete('status');
      if (filterPayment) params.set('payment', filterPayment as string); else params.delete('payment');
      if (dateFrom) params.set('from', dateFrom); else params.delete('from');
      if (dateTo) params.set('to', dateTo); else params.delete('to');
      if (expiryFilter) params.set('expiry', expiryFilter); else params.delete('expiry');
      params.set('page', String(page));
      params.set('limit', String(limit));
      const s = params.toString();
      const url = `${window.location.pathname}${s ? `?${s}` : ''}`;
      window.history.replaceState(null, '', url);
    } catch {}
  }, [debouncedSearchTerm, filterStatus, filterPayment, dateFrom, dateTo, expiryFilter, page, limit]);

  const loadData = async () => {
    const sb = getSupabase();
    if (!sb) return;
    const [ordersRes, customersRes, packagesRes, productsRes] = await Promise.all([
      sb.from('orders').select('*'),
      sb.from('customers').select('*'),
      sb.from('packages').select('*'),
      sb.from('products').select('*')
    ]);
    const allOrders = (ordersRes.data || []).map((r: any) => ({
      ...r,
      purchaseDate: r.purchase_date ? new Date(r.purchase_date) : new Date(r.purchaseDate),
      expiryDate: r.expiry_date ? new Date(r.expiry_date) : new Date(r.expiryDate),
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
    })) as Order[];
    setOrders(allOrders);
    setCustomers((customersRes.data || []) as Customer[]);
    setPackages((packagesRes.data || []) as ProductPackage[]);
    setProducts((productsRes.data || []) as Product[]);
  };

  // Realtime subscribe
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const channel = sb
      .channel('realtime:orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadData();
      })
      .subscribe();
    return () => { try { channel.unsubscribe(); } catch {} };
  }, []);

  const handleCreate = () => {
    setEditingOrder(null);
    setShowForm(true);
  };

  const handleEdit = (order: Order) => {
    setEditingOrder(order);
    setShowForm(true);
  };

  const [confirmState, setConfirmState] = useState<null | { message: string; onConfirm: () => void }>(null);

  // Smart confirmation for returning slots to inventory for expired orders
  const [returnConfirmState, setReturnConfirmState] = useState<null | {
    order: Order;
    inventoryId: string;
    acknowledged: boolean;
    mode: 'RETURN_ONLY' | 'DELETE_AND_RETURN';
  }>(null);

  const handleDelete = (id: string) => {
    const order = orders.find(o => o.id === id);
    const invLinked: any = null; // inventory unlink handled server-side if needed
    const now = new Date();
    const isExpired = order ? new Date(order.expiryDate) < now : false;

    // If expired and has inventory link, require smart confirmation first
    if (order && invLinked && isExpired) {
      setReturnConfirmState({ order, inventoryId: invLinked.id, acknowledged: false, mode: 'DELETE_AND_RETURN' });
      return;
    }

    setConfirmState({
      message: 'Bạn có chắc chắn muốn xóa đơn hàng này?',
      onConfirm: () => {
        (async () => {
          const sb = getSupabase();
          if (!sb) return notify('Không thể xóa đơn hàng', 'error');
          const { error } = await sb.from('orders').delete().eq('id', id);
          if (!error) {
            try {
              const sb2 = getSupabase();
              if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Xóa đơn hàng', details: (() => { const o = orders.find(x => x.id === id); return `orderId=${id}; orderCode=${o?.code}`; })() });
            } catch {}
            loadData();
            notify('Xóa đơn hàng thành công', 'success');
          } else {
            notify('Không thể xóa đơn hàng', 'error');
          }
        })();
      }
    });
  };

  const handleReturnSlot = (id: string) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    // Try classic link first
    let invLinked = Database.getInventory().find((i: any) => i.linkedOrderId === id);
    // Optionally try by inventoryItemId if present on order
    if (!invLinked && (order as any).inventoryItemId) {
      const found = Database.getInventory().find((i: any) => i.id === (order as any).inventoryItemId);
      if (found && (found.linkedOrderId === id || (found.isAccountBased && (found.profiles || []).some(p => p.assignedOrderId === id)))) {
        invLinked = found;
      }
    }
    if (!invLinked) {
      notify('Đơn này không có slot liên kết để trả', 'warning');
      return;
    }
    const isExpired = new Date(order.expiryDate) < new Date();
    if (isExpired) {
      setReturnConfirmState({ order, inventoryId: invLinked.id, acknowledged: false, mode: 'RETURN_ONLY' });
      return;
    }
    // For non-expired orders, simple confirm
    setConfirmState({
      message: 'Trả slot về kho? (Đơn vẫn được giữ nguyên)',
      onConfirm: async () => {
        Database.releaseInventoryItem(invLinked!.id);
        // Preserve latest orderInfo after unlinking inventory
        Database.updateOrder(order.id, { orderInfo: String((order as any).orderInfo || '') } as any);
        try {
          const sb2 = getSupabase();
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Trả slot về kho', details: `orderId=${order.id}; orderCode=${order.code}; inventoryId=${invLinked!.id}; inventoryCode=${invLinked!.code}` });
        } catch {}
        loadData();
        notify('Đã trả slot về kho', 'success');
      }
    });
  };

  const handleToggleSelectAll = (checked: boolean, ids: string[]) => {
    setSelectedIds(checked ? ids : []);
  };

  const handleToggleSelect = (id: string, checked: boolean) => {
    setSelectedIds(prev => checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id));
  };

  const bulkDelete = () => {
    if (selectedIds.length === 0) return;
    setConfirmState({
      message: `Xóa ${selectedIds.length} đơn hàng đã chọn?`,
      onConfirm: async () => {
        const codes = selectedIds.map(id => orders.find(o => o.id === id)?.code).filter(Boolean) as string[];
        selectedIds.forEach(id => {
          const invLinked = Database.getInventory().find((i: any) => i.linkedOrderId === id);
          if (invLinked) Database.releaseInventoryItem(invLinked.id);
          Database.deleteOrder(id);
        });
        try {
          const sb2 = getSupabase();
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Xóa hàng loạt đơn hàng', details: `orderCodes=${codes.join(',')}` });
        } catch {}
        setSelectedIds([]);
        loadData();
        notify('Đã xóa đơn hàng đã chọn', 'success');
      }
    });
  };

  const bulkSetStatus = (status: OrderStatus) => {
    if (selectedIds.length === 0) return;
    (async () => {
      const sb = getSupabase();
      if (!sb) return notify('Không thể cập nhật trạng thái', 'error');
      const { error } = await sb.from('orders').update({ status }).in('id', selectedIds);
      if (error) return notify('Không thể cập nhật trạng thái', 'error');
      const codes = selectedIds.map(id => orders.find(o => o.id === id)?.code).filter(Boolean) as string[];
      try {
        const sb2 = getSupabase();
        if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Cập nhật trạng thái hàng loạt', details: `status=${status}; orderCodes=${codes.join(',')}` });
      } catch {}
      loadData();
      notify('Đã cập nhật trạng thái', 'success');
    })();
  };

  const bulkSetPayment = (paymentStatus: PaymentStatus) => {
    if (selectedIds.length === 0) return;
    (async () => {
      const sb = getSupabase();
      if (!sb) return notify('Không thể cập nhật thanh toán', 'error');
      const { error } = await sb.from('orders').update({ payment_status: paymentStatus }).in('id', selectedIds);
      if (error) return notify('Không thể cập nhật thanh toán', 'error');
      const codes = selectedIds.map(id => orders.find(o => o.id === id)?.code).filter(Boolean) as string[];
      try {
        const sb2 = getSupabase();
        if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Cập nhật thanh toán hàng loạt', details: `paymentStatus=${paymentStatus}; orderCodes=${codes.join(',')}` });
      } catch {}
      loadData();
      notify('Đã cập nhật thanh toán', 'success');
    })();
  };

  const handleFormSubmit = () => {
    setShowForm(false);
    setEditingOrder(null);
    loadData();
  };

  // Memoized lookup maps to avoid O(n) array scans for each row
  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach(c => map.set(c.id, c));
    return map;
  }, [customers]);

  const packageMap = useMemo(() => {
    const map = new Map<string, ProductPackage>();
    packages.forEach(p => map.set(p.id, p));
    return map;
  }, [packages]);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach(p => map.set(p.id, p));
    return map;
  }, [products]);

  // Lowercased name maps for cheaper substring search
  const customerNameLower = useMemo(() => {
    const m = new Map<string, string>();
    customers.forEach(c => m.set(c.id, (c.name || '').toLowerCase()));
    return m;
  }, [customers]);

  const productNameLower = useMemo(() => {
    const m = new Map<string, string>();
    products.forEach(p => m.set(p.id, (p.name || '').toLowerCase()));
    return m;
  }, [products]);

  const packageNameLower = useMemo(() => {
    const m = new Map<string, string>();
    packages.forEach(pk => m.set(pk.id, (pk.name || '').toLowerCase()));
    return m;
  }, [packages]);

  const getCustomerName = (customerId: string) => {
    const customer = customerMap.get(customerId);
    return customer ? customer.name : 'Không xác định';
  };

  const getPackageInfo = (packageId: string) => {
    const pkg = packageMap.get(packageId);
    if (!pkg) return null;
    const product = productMap.get(pkg.productId);
    return { package: pkg, product };
  };

  const getStatusLabel = (status: OrderStatus) => {
    return ORDER_STATUSES.find(s => s.value === status)?.label || status;
  };

  const getStatusClass = (status: OrderStatus) => {
    switch (status) {
      case 'PROCESSING':
        return 'status-processing';
      case 'COMPLETED':
        return 'status-completed';
      case 'CANCELLED':
        return 'status-cancelled';
      default:
        return '';
    }
  };

  const getPaymentLabel = (value: PaymentStatus) => {
    return PAYMENT_STATUSES.find(p => p.value === value)?.label || '';
  };

  const getStatusShortLabel = (status: OrderStatus) => {
    switch (status) {
      case 'PROCESSING':
        return 'Xử lý';
      case 'COMPLETED':
        return 'THÀNH';
      case 'CANCELLED':
        return 'Hủy';
      default:
        return getStatusLabel(status);
    }
  };

  const getPaymentShortLabel = (value: PaymentStatus) => {
    switch (value) {
      case 'PAID':
        return 'Đã TT';
      case 'UNPAID':
        return 'Chưa TT';
      case 'REFUNDED':
        return 'Hoàn';
      default:
        return getPaymentLabel(value);
    }
  };

  const getPaymentClass = (value: PaymentStatus) => {
    switch (value) {
      case 'PAID':
        return 'status-completed';
      case 'REFUNDED':
        return 'status-cancelled';
      case 'UNPAID':
      default:
        return 'status-processing';
    }
  };

  const buildFullOrderInfo = (order: Order): { lines: string[]; text: string } => {
    let baseLines = String((order as any).orderInfo || '')
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    const pkg = getPackageInfo(order.packageId)?.package;
    const custom = ((order as any).customFieldValues || {}) as Record<string, string>;
    if (pkg && Array.isArray(pkg.customFields) && pkg.customFields.length) {
      pkg.customFields.forEach(cf => {
        const val = custom[cf.id];
        if (val !== undefined && String(val).trim()) {
          baseLines.push(`${cf.title}: ${val}`);
        }
      });
    }
    // Filter out unwanted info lines (internal-only): any Slot: ...
    baseLines = baseLines.filter(line => {
      const normalized = line.toLowerCase();
      if (normalized.startsWith('slot:')) return false; // e.g., "Slot: Slot 1" or "Slot: 1/5"
      return true;
    });
    const text = baseLines.join('\n');
    return { lines: baseLines, text };
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('vi-VN');
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price);
  };

  const filteredOrders = useMemo(() => {
    const normalizedSearch = debouncedSearchTerm.trim().toLowerCase();
    const nowTs = Date.now();
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toTs = dateTo ? new Date(dateTo).getTime() : Number.POSITIVE_INFINITY;
    return orders.filter(order => {
      // Search
      const pkg = packageMap.get(order.packageId);
      const product = pkg ? productMap.get(pkg.productId) : undefined;
      const matchesSearch =
        (order.code || '').toLowerCase().includes(normalizedSearch) ||
        (customerNameLower.get(order.customerId) || '').includes(normalizedSearch) ||
        (product ? (productNameLower.get(product.id) || '') : '').includes(normalizedSearch) ||
        (pkg ? (packageNameLower.get(pkg.id) || '') : '').includes(normalizedSearch) ||
        ((order as any).orderInfo || '').toLowerCase().includes(normalizedSearch);

      if (!matchesSearch) return false;

      // Status & payment
      if (filterStatus && order.status !== filterStatus) return false;
      if (filterPayment && (order as any).paymentStatus !== filterPayment) return false;

      // Date range
      const purchaseTs = new Date(order.purchaseDate).getTime();
      if (purchaseTs < fromTs || purchaseTs > toTs) return false;

      // Expiry bucket
      const expiryTs = new Date(order.expiryDate).getTime();
      if (expiryFilter) {
        const daysToExpiry = Math.ceil((expiryTs - nowTs) / 86400000);
        const isExpired = expiryTs < nowTs;
        const isExpiring = daysToExpiry >= 0 && daysToExpiry <= 7;
        const isActive = expiryTs >= nowTs && daysToExpiry > 7;
        if (
          !(
            (expiryFilter === 'EXPIRED' && isExpired) ||
            (expiryFilter === 'EXPIRING' && isExpiring) ||
            (expiryFilter === 'ACTIVE' && isActive)
          )
        ) {
          return false;
        }
      }

      return true;
    });
  }, [orders, debouncedSearchTerm, filterStatus, filterPayment, dateFrom, dateTo, expiryFilter, packageMap, productMap, customerNameLower, productNameLower, packageNameLower]);

  const { total, totalPages, currentPage, start, paginatedOrders } = useMemo(() => {
    const totalLocal = filteredOrders.length;
    const totalPagesLocal = Math.max(1, Math.ceil(totalLocal / limit));
    const currentPageLocal = Math.min(page, totalPagesLocal);
    const startLocal = (currentPageLocal - 1) * limit;
    const paginatedLocal = filteredOrders.slice(startLocal, startLocal + limit);
    return {
      total: totalLocal,
      totalPages: totalPagesLocal,
      currentPage: currentPageLocal,
      start: startLocal,
      paginatedOrders: paginatedLocal
    };
  }, [filteredOrders, page, limit]);

  const exportOrdersXlsx = (items: Order[], filename: string) => {
    const rows = items.map((o, idx) => {
      const pkgInfo = getPackageInfo(o.packageId);
      return {
        code: o.code || `#${idx + 1}`,
        customer: getCustomerName(o.customerId),
        product: pkgInfo?.product?.name || '',
        package: pkgInfo?.package?.name || '',
        purchaseDate: new Date(o.purchaseDate).toLocaleDateString('vi-VN'),
        expiryDate: new Date(o.expiryDate).toLocaleDateString('vi-VN'),
        status: getStatusLabel(o.status),
        payment: getPaymentLabel((o as any).paymentStatus || 'UNPAID'),
        price: getOrderPrice(o)
      };
    });
    exportToXlsx(rows, [
      { header: 'Mã đơn', key: 'code', width: 14 },
      { header: 'Khách hàng', key: 'customer', width: 24 },
      { header: 'Sản phẩm', key: 'product', width: 24 },
      { header: 'Gói', key: 'package', width: 20 },
      { header: 'Ngày mua', key: 'purchaseDate', width: 14 },
      { header: 'Hết hạn', key: 'expiryDate', width: 14 },
      { header: 'Trạng thái', key: 'status', width: 14 },
      { header: 'Thanh toán', key: 'payment', width: 14 },
      { header: 'Giá', key: 'price', width: 12 },
    ], filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, 'Đơn hàng');
  };

  const getOrderPrice = (order: Order) => {
    const customer = customerMap.get(order.customerId);
    const packageInfo = getPackageInfo(order.packageId);
    if (!customer || !packageInfo) return 0;
    // Respect custom price if set
    if (order.useCustomPrice && typeof order.customPrice === 'number' && order.customPrice > 0) {
      return order.customPrice;
    }
    return customer.type === 'CTV'
      ? packageInfo.package.ctvPrice
      : packageInfo.package.retailPrice;
  };

  const getTotalRevenue = useMemo(() => {
    const paidCompleted = filteredOrders.filter(order => order.status === 'COMPLETED' && (order as any).paymentStatus === 'PAID');
    let sum = 0;
    for (let i = 0; i < paidCompleted.length; i++) {
      sum += getOrderPrice(paidCompleted[i]);
    }
    return () => sum;
  }, [filteredOrders, customerMap, packageMap, productMap]);

  const roundDownToThousand = (value: number) => {
    return Math.max(0, Math.floor(value / 1000) * 1000);
  };

  const computeRefundAmount = (order: Order, errorDateStr: string) => {
    const price = getOrderPrice(order);
    if (!price) return 0;
    const purchase = new Date(order.purchaseDate);
    const expiry = new Date(order.expiryDate);
    const errorDate = new Date(errorDateStr);
    if (isNaN(errorDate.getTime())) return 0;
    if (errorDate <= purchase) return roundDownToThousand(price);
    if (errorDate >= expiry) return 0;
    const totalDays = Math.max(1, Math.ceil((expiry.getTime() - purchase.getTime()) / (1000 * 60 * 60 * 24)));
    const remainingDays = Math.max(0, Math.ceil((expiry.getTime() - errorDate.getTime()) / (1000 * 60 * 60 * 24)));
    const prorate = remainingDays / totalDays;
    return roundDownToThousand(Math.round(price * prorate));
  };

  // Memoized row to minimize rerenders
  const OrderRow: React.FC<{ order: Order; index: number; selected: boolean }> = React.useMemo(() => {
    return React.memo(function Row({ order, index, selected }: { order: Order; index: number; selected: boolean }) {
      const packageInfo = getPackageInfo(order.packageId);
      const customer = customerMap.get(order.customerId);
      return (
        <tr>
          <td>
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => handleToggleSelect(order.id, e.target.checked)}
            />
          </td>
          <td>{order.code || `#${index + 1}`}</td>
          <td>{formatDate(order.purchaseDate)}</td>
          <td>
            <div>{getCustomerName(order.customerId)}</div>
            {customer && (
              <small className="text-muted">{customer.type === 'CTV' ? 'CTV' : 'Khách lẻ'}</small>
            )}
          </td>
          <td>{packageInfo?.product?.name || 'Không xác định'}</td>
          <td>{packageInfo?.package?.name || 'Không xác định'}</td>
          <td>{formatDate(order.expiryDate)}</td>
          <td>
            <span
              className={`status-badge ${getStatusClass(order.status)}`}
              style={{ padding: '2px 6px', fontSize: 12, lineHeight: 1 }}
              title={getStatusLabel(order.status)}
            >
              {getStatusShortLabel(order.status)}
            </span>
          </td>
          <td>
            <span
              className={`status-badge ${getPaymentClass((order as any).paymentStatus)}`}
              style={{ padding: '2px 6px', fontSize: 12, lineHeight: 1 }}
              title={getPaymentLabel((order as any).paymentStatus) || 'Chưa thanh toán'}
            >
              {getPaymentShortLabel((order as any).paymentStatus)}
            </span>
          </td>
          <td>{formatPrice(getOrderPrice(order))}</td>
          <td>
            <div className="d-flex gap-2">
              <button onClick={() => setViewingOrder(order)} className="btn btn-light">Xem</button>
              <button
                onClick={() => setRefundState({ order, errorDate: new Date().toISOString().split('T')[0], amount: computeRefundAmount(order, new Date().toISOString().split('T')[0]) })}
                className="btn btn-warning"
              >
                Tính tiền hoàn
              </button>
              <button onClick={() => handleEdit(order)} className="btn btn-secondary">Sửa</button>
              {new Date(order.expiryDate) < new Date() && (
                <button onClick={() => handleReturnSlot(order.id)} className="btn btn-danger" title="Trả slot về kho (không xóa đơn)">Trả slot về kho</button>
              )}
            </div>
          </td>
        </tr>
      );
    });
  }, [customerMap, packageMap, productMap]);

  return (
    <div className="card">
      <div className="card-header">
        <div className="d-flex justify-content-between align-items-center">
          <h2 className="card-title">Danh sách đơn hàng</h2>
          <div className="d-flex gap-2">
            <div className="text-right">
              <div>Tổng doanh thu: {formatPrice(getTotalRevenue())}</div>
              <small className="text-muted">({filteredOrders.filter(o => o.status === 'COMPLETED').length} đơn hoàn thành)</small>
            </div>
            <button className="btn btn-light" onClick={() => exportOrdersXlsx(paginatedOrders, 'orders_page.xlsx')}>Xuất Excel (trang hiện tại)</button>
            <button className="btn btn-light" onClick={() => exportOrdersXlsx(filteredOrders, 'orders_filtered.xlsx')}>Xuất Excel (kết quả đã lọc)</button>
            {selectedIds.length > 0 && (
            <div className="d-flex gap-2 align-items-center">
              {/* Bulk delete removed per request */}
              <div className="d-flex gap-1">
                  <button className="btn btn-secondary" onClick={() => bulkSetStatus('CANCELLED')}>Đã hủy</button>
                </div>
                <div className="d-flex gap-1">
                  <button className="btn btn-secondary" onClick={() => bulkSetPayment('PAID')}>Đã thanh toán</button>
                  <button className="btn btn-secondary" onClick={() => bulkSetPayment('REFUNDED')}>Đã hoàn tiền</button>
                </div>
              </div>
            )}
            <button
              onClick={handleCreate}
              className="btn btn-primary"
            >
              Tạo đơn hàng
            </button>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <div>
            <input
              type="text"
              className="form-control"
              placeholder="Tìm kiếm đơn hàng..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <select
              className="form-control"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as OrderStatus | '')}
            >
              <option value="">Tất cả trạng thái</option>
              {ORDER_STATUSES.map(status => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select
              className="form-control"
              value={expiryFilter}
              onChange={(e) => setExpiryFilter(e.target.value as 'EXPIRING' | 'EXPIRED' | 'ACTIVE' | '')}
            >
              <option value="">Tất cả hạn dùng</option>
              <option value="EXPIRING">Sắp hết hạn (&lt;= 7 ngày)</option>
              <option value="EXPIRED">Đã hết hạn</option>
              <option value="ACTIVE">Còn hạn (&gt; 7 ngày)</option>
            </select>
          </div>
          <div>
            <select
              className="form-control"
              value={filterPayment}
              onChange={(e) => setFilterPayment(e.target.value as PaymentStatus | '')}
            >
              <option value="">Tất cả thanh toán</option>
              {PAYMENT_STATUSES.map(p => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <input
              type="date"
              className="form-control"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="Từ ngày"
            />
          </div>
          <div>
            <input
              type="date"
              className="form-control"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="Đến ngày"
            />
          </div>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="text-center py-4">
          <p>Không có đơn hàng nào</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={paginatedOrders.length > 0 && paginatedOrders.every(o => selectedIds.includes(o.id))}
                    onChange={(e) => handleToggleSelectAll(e.target.checked, paginatedOrders.map(o => o.id))}
                  />
                </th>
                <th>Mã đơn hàng</th>
                <th>Ngày mua</th>
                <th>Khách hàng</th>
                <th>Sản phẩm</th>
                <th>Gói</th>
                <th>Ngày hết hạn</th>
                <th style={{ width: 90 }}>Trạng thái</th>
                <th style={{ width: 90 }}>Thanh toán</th>
                <th>Giá</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {paginatedOrders.map((order, index) => (
                <OrderRow key={order.id} order={order} index={index} selected={selectedIds.includes(order.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <OrderForm
          order={editingOrder}
          onClose={() => {
            setShowForm(false);
            setEditingOrder(null);
          }}
          onSuccess={handleFormSubmit}
        />
      )}

      {viewingOrder && (
        <div className="modal">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Chi tiết đơn hàng</h3>
              <button type="button" className="close" onClick={() => setViewingOrder(null)}>×</button>
            </div>
            <div className="mb-3">
              <div><strong>Mã đơn hàng:</strong> {viewingOrder.code}</div>
              <div><strong>Khách hàng:</strong> {getCustomerName(viewingOrder.customerId)}</div>
              <div><strong>Sản phẩm:</strong> {getPackageInfo(viewingOrder.packageId)?.product?.name || 'Không xác định'}</div>
              <div><strong>Gói:</strong> {getPackageInfo(viewingOrder.packageId)?.package?.name || 'Không xác định'}</div>
              <div><strong>Ngày mua:</strong> {formatDate(viewingOrder.purchaseDate)}</div>
              <div><strong>Ngày hết hạn:</strong> {formatDate(viewingOrder.expiryDate)}</div>
              <div><strong>Trạng thái:</strong> {getStatusLabel(viewingOrder.status)}</div>
              <div><strong>Thanh toán:</strong> {PAYMENT_STATUSES.find(p => p.value === (viewingOrder as any).paymentStatus)?.label || 'Chưa thanh toán'}</div>
                      {(() => {
                        const info = buildFullOrderInfo(viewingOrder);
                        if (!info.lines.length) return null;
                        return (
                          <div>
                            <strong>Thông tin đơn hàng:</strong>
                            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{info.text}</pre>
                          </div>
                        );
                      })()}
              <div>
                <strong>Kho hàng:</strong>{' '}
                {(() => {
                  const inv = (() => {
                    // First try to find by inventoryItemId if it exists
                    if (viewingOrder.inventoryItemId) {
                      const found = Database.getInventory().find(i => i.id === viewingOrder.inventoryItemId);
                      if (found) {
                        // Accept if classic link matches
                        if (found.linkedOrderId === viewingOrder.id) return found;
                        // For account-based items, accept if any profile is assigned to this order
                        if (found.isAccountBased && (found.profiles || []).some(p => p.assignedOrderId === viewingOrder.id)) {
                          return found;
                        }
                      }
                    }
                    // Fallback 1: find by linkedOrderId (classic single-item link)
                    const byLinked = Database.getInventory().find((i: any) => i.linkedOrderId === viewingOrder.id);
                    if (byLinked) return byLinked;
                    // Fallback 2: account-based items where a profile is assigned to this order
                    return Database.getInventory().find((i: any) => i.isAccountBased && (i.profiles || []).some((p: any) => p.assignedOrderId === viewingOrder.id));
                  })();
                  if (!inv) return 'Không liên kết';
                  const code = inv.code ?? '';
                  const pDate = new Date(inv.purchaseDate).toLocaleDateString('vi-VN');
                  const eDate = new Date(inv.expiryDate).toLocaleDateString('vi-VN');
                  const status = inv.status;
                  const statusLabel =
                    status === 'SOLD' ? 'Đã bán' :
                    status === 'AVAILABLE' ? 'Có sẵn' :
                    status === 'RESERVED' ? 'Đã giữ' :
                    status === 'EXPIRED' ? 'Hết hạn' : status;
                  const header = `${code || 'Không có'} | Nhập: ${pDate} | HSD: ${eDate} | ${statusLabel}`;
                  const extra: string[] = [];
                  if (inv.productInfo) extra.push(`| Thông tin sản phẩm: ${inv.productInfo}`);
                  if (inv.sourceNote) extra.push(`Nguồn: ${inv.sourceNote}`);
                  if (typeof inv.purchasePrice === 'number') extra.push(`| Giá nhập: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(inv.purchasePrice)}`);
                  return [header, ...extra].join(' \n ');
                })()}
              </div>
              {viewingOrder.notes && <div><strong>Ghi chú:</strong> {viewingOrder.notes}</div>}
              {(() => {
                // warranties are loaded via effectful call elsewhere; render state
                return (
                  <div style={{ marginTop: '12px' }}>
                    <strong>Lịch sử bảo hành:</strong>
                    {warrantiesForOrder.length === 0 ? (
                      <div>Chưa có</div>
                    ) : (
                      <ul style={{ paddingLeft: '18px', marginTop: '6px' }}>
                        {warrantiesForOrder.map((w: any) => (
                          <li key={w.id}>
                            {new Date(w.createdAt).toLocaleDateString('vi-VN')} - {w.reason} ({w.status === 'DONE' ? 'đã xong' : 'chưa xong'})
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })()}
              {(() => {
                const renewals = ((viewingOrder as any).renewals || []) as Array<{
                  id: string;
                  months: number;
                  packageId?: string;
                  price?: number;
                  useCustomPrice?: boolean;
                  previousExpiryDate: Date;
                  newExpiryDate: Date;
                  note?: string;
                  paymentStatus: PaymentStatus;
                  createdAt: Date;
                  createdBy: string;
                }>;
                return (
                  <div style={{ marginTop: '12px' }}>
                    <strong>Lịch sử gia hạn:</strong>
                    {renewals.length === 0 ? (
                      <div>Chưa có</div>
                    ) : (
                      <ul style={{ paddingLeft: '18px', marginTop: '6px' }}>
                        {renewals.map(r => (
                          <li key={r.id}>
                            {new Date(r.createdAt).toLocaleDateString('vi-VN')} · +{r.months} tháng · HSD: {new Date(r.previousExpiryDate).toLocaleDateString('vi-VN')} → {new Date(r.newExpiryDate).toLocaleDateString('vi-VN')} · Gói: {getPackageInfo(r.packageId || viewingOrder.packageId)?.package?.name || 'Không xác định'} · Giá: {typeof r.price === 'number' ? formatPrice(r.price) : '-'} · TT: {getPaymentLabel(r.paymentStatus)}{r.note ? ` · Ghi chú: ${r.note}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="d-flex justify-content-end gap-2">
              {new Date(viewingOrder.expiryDate) >= new Date() && (
                <button
                  className="btn btn-success"
                  onClick={() => {
                    setRenewState({
                      order: viewingOrder,
                      packageId: viewingOrder.packageId,
                      useCustomPrice: false,
                      customPrice: 0,
                      note: '',
                      paymentStatus: (viewingOrder as any).paymentStatus || 'UNPAID'
                    });
                  }}
                >
                  Gia hạn
                </button>
              )}
              <button
                className="btn btn-light"
                onClick={async () => {
                  const o = viewingOrder;
                  const customerName = getCustomerName(o.customerId);
                  const pkgInfo = getPackageInfo(o.packageId);
                  const productName = pkgInfo?.product?.name || 'Không xác định';
                  const packageName = pkgInfo?.package?.name || 'Không xác định';
                  const statusLabel = getStatusLabel(o.status);
                  const paymentLabel = getPaymentLabel((o as any).paymentStatus || 'UNPAID') || 'Chưa thanh toán';
                  const purchaseDate = new Date(o.purchaseDate).toLocaleDateString('vi-VN');
                  const expiryDate = new Date(o.expiryDate).toLocaleDateString('vi-VN');
                  const info = buildFullOrderInfo(o);
                  const out: string[] = [];
                  out.push(`Mã đơn hàng: ${o.code || '-'}`);
                  out.push(`Khách hàng: ${customerName}`);
                  out.push(`Sản phẩm: ${productName}`);
                  out.push(`Gói: ${packageName}`);
                  out.push(`Ngày mua: ${purchaseDate}`);
                  out.push(`Ngày hết hạn: ${expiryDate}`);
                  out.push(`Trạng thái: ${statusLabel}`);
                  out.push(`Thanh toán: ${paymentLabel}`);
                  out.push('Thông tin đơn hàng:');
                  if (info.lines.length) {
                    info.lines.forEach((line, idx) => {
                      out.push(line);
                      if (idx < info.lines.length - 1) out.push('');
                    });
                  }
                  const text = out.join('\n');
                  try {
                    await navigator.clipboard.writeText(text);
                    notify('Đã copy thông tin đơn hàng', 'success');
                  } catch (e) {
                    notify('Không thể copy vào clipboard', 'error');
                  }
                }}
              >
                Copy thông tin
              </button>
              <button className="btn btn-secondary" onClick={() => setViewingOrder(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {renewState && (
        <div className="modal">
          <div className="modal-content" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">Gia hạn đơn</h3>
              <button type="button" className="close" onClick={() => setRenewState(null)}>×</button>
            </div>
            <div className="mb-3">
              {(() => {
                const o = renewState.order;
                const currentExpiry = new Date(o.expiryDate);
                const base = currentExpiry > new Date() ? currentExpiry : new Date();
                const pkg = getPackageInfo(renewState.packageId)?.package;
                const months = Math.max(1, pkg?.warrantyPeriod || 1);
                const preview = new Date(base);
                preview.setMonth(preview.getMonth() + months);
                const customer = customers.find(c => c.id === o.customerId);
                const defaultPrice = customer?.type === 'CTV' ? (pkg?.ctvPrice || 0) : (pkg?.retailPrice || 0);
                const price = renewState.useCustomPrice ? (renewState.customPrice || 0) : defaultPrice;
                return (
                  <div className="p-2">
                    <div><strong>Mã đơn:</strong> {o.code}</div>
                    <div><strong>Hết hạn hiện tại:</strong> {currentExpiry.toLocaleDateString('vi-VN')}</div>
                    <div className="form-group">
                      <label className="form-label">Gói gia hạn</label>
                      <select
                        className="form-control"
                        value={renewState.packageId}
                        onChange={(e) => setRenewState(prev => prev ? { ...prev, packageId: e.target.value } : prev)}
                      >
                        {packages
                          .filter(p => p.productId === (getPackageInfo(o.packageId)?.product?.id || ''))
                          .map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <div className="d-flex align-items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          id="renewUseCustomPrice"
                          checked={renewState.useCustomPrice}
                          onChange={(e) => setRenewState(prev => prev ? { ...prev, useCustomPrice: e.target.checked } : prev)}
                        />
                        <label htmlFor="renewUseCustomPrice" className="mb-0">Giá tùy chỉnh</label>
                      </div>
                      {renewState.useCustomPrice ? (
                        <>
                          <input
                            type="number"
                            className="form-control"
                            value={renewState.customPrice || 0}
                            onChange={(e) => setRenewState(prev => prev ? { ...prev, customPrice: Math.max(0, parseFloat(e.target.value || '0')) } : prev)}
                            min="0"
                            step="1000"
                            placeholder="Nhập giá tùy chỉnh"
                          />
                          <div className="alert alert-success mt-2"><strong>Giá:</strong> {formatPrice(price)}</div>
                        </>
                      ) : (
                        <div className="alert alert-success"><strong>Giá:</strong> {formatPrice(price)}</div>
                      )}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Thanh toán</label>
                      <select
                        className="form-control"
                        value={renewState.paymentStatus}
                        onChange={(e) => setRenewState(prev => prev ? { ...prev, paymentStatus: e.target.value as PaymentStatus } : prev)}
                      >
                        {PAYMENT_STATUSES.map(p => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-2">
                      <label className="form-label">Ghi chú</label>
                      <textarea
                        className="form-control"
                        rows={2}
                        placeholder="Ghi chú gia hạn (không bắt buộc)"
                        value={renewState.note}
                        onChange={(e) => setRenewState(prev => prev ? { ...prev, note: e.target.value } : prev)}
                      />
                    </div>
                    <div className="alert alert-info mt-2">
                      <strong>Hết hạn mới (dự kiến):</strong> {preview.toLocaleDateString('vi-VN')}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="d-flex justify-content-end gap-2">
              <button className="btn btn-secondary" onClick={() => setRenewState(null)}>Đóng</button>
              <button
                className="btn btn-light"
                onClick={async () => {
                  if (!renewState) return;
                  const o = renewState.order;
                  const customer = customers.find(c => c.id === o.customerId);
                  const pkgInfo = getPackageInfo(renewState.packageId || o.packageId);
                  const product = pkgInfo?.product;
                  const currentPackage = pkgInfo?.package;
                  const customerIsCTV = (customer?.type || 'RETAIL') === 'CTV';

                  const formatWarranty = (months: number) => {
                    if (months === 24) return 'Vĩnh viễn';
                    return `${months} tháng`;
                  };

                  const lines: string[] = [];
                  const productName = product?.name || 'Sản phẩm';
                  const packageName = currentPackage?.name || 'Gói hiện tại';
                  lines.push('Hi bạn, hiện tại mình có đơn hàng sắp hết hạn, mình muốn gia hạn thêm không ạ?');
                  lines.push('');
                  // Detailed current order info
                  lines.push('Thông tin chi tiết đơn hàng hiện tại:');
                  lines.push(`- Mã đơn hàng: ${o.code || '-'}`);
                  lines.push(`- Khách hàng: ${getCustomerName(o.customerId)}`);
                  lines.push(`- Sản phẩm: ${productName}`);
                  lines.push(`- Gói: ${packageName}`);
                  lines.push(`- Ngày mua: ${new Date(o.purchaseDate).toLocaleDateString('vi-VN')}`);
                  lines.push(`- Ngày hết hạn: ${new Date(o.expiryDate).toLocaleDateString('vi-VN')}`);
                  lines.push(`- Trạng thái: ${getStatusLabel(o.status)}`);
                  lines.push(`- Thanh toán: ${getPaymentLabel((o as any).paymentStatus || 'UNPAID')}`);
                  lines.push(`- Giá hiện tại: ${formatPrice(getOrderPrice(o))}`);
                  // Append order info lines under a header
                  {
                    const info = buildFullOrderInfo(o);
                    lines.push('- Thông tin đơn hàng:');
                    if (info.lines.length) {
                      info.lines.forEach((line, idx) => {
                        lines.push(line);
                        if (idx < info.lines.length - 1) lines.push('');
                      });
                    }
                  }
                  lines.push('');
                  lines.push('Giá gia hạn:');
                  const sameProductPackages = packages.filter(p => p.productId === (product?.id || ''));
                  sameProductPackages.forEach(p => {
                    const price = customerIsCTV ? p.ctvPrice : p.retailPrice;
                    lines.push(`- ${p.name} (${formatWarranty(p.warrantyPeriod)}): ${formatPrice(price)}`);
                  });
                  lines.push('');
                  lines.push('💰Thông tin chuyển khoản:');
                  lines.push('Chủ tài khoản: Pham Hong Minh');
                  lines.push('');
                  lines.push('📌MOMO: 0982351811');
                  lines.push('');
                  lines.push('📌MB BANK: 0982351811');
                  lines.push('');
                  lines.push('QR: https://prnt.sc/Dc1F7cI6XOg6');

                  const text = lines.join('\n');
                  try {
                    await navigator.clipboard.writeText(text);
                    notify('Đã copy tin nhắn gia hạn', 'success');
                  } catch (e) {
                    notify('Không thể copy vào clipboard', 'error');
                  }
                }}
              >
                Copy tin nhắn gia hạn
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  const o = renewState.order;
                  const updated = Database.renewOrder(o.id, renewState.packageId, {
                    note: renewState.note,
                    paymentStatus: renewState.paymentStatus,
                    createdBy: state.user?.id || 'system',
                    useCustomPrice: renewState.useCustomPrice,
                    customPrice: renewState.customPrice
                  });
                  if (updated) {
                    try {
                      const sb2 = getSupabase();
                      if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Gia hạn đơn hàng', details: `orderId=${o.id}; orderCode=${o.code}; packageId=${renewState.packageId}; paymentStatus=${renewState.paymentStatus}; price=${renewState.useCustomPrice ? renewState.customPrice : 'DEFAULT'}` });
                    } catch {}
                    setRenewState(null);
                    setViewingOrder(updated);
                    loadData();
                    notify('Gia hạn đơn hàng thành công', 'success');
                  } else {
                    notify('Không thể gia hạn đơn hàng', 'error');
                  }
                }}
              >
                Xác nhận gia hạn
              </button>
            </div>
          </div>
        </div>
      )}

      {refundState && (
        <div className="modal">
          <div className="modal-content" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">Tính tiền hoàn</h3>
              <button type="button" className="close" onClick={() => setRefundState(null)}>×</button>
            </div>
            <div className="mb-3">
              {(() => {
                const o = refundState.order;
                const pkgInfo = getPackageInfo(o.packageId);
                const productName = pkgInfo?.product?.name || 'Không xác định';
                const packageName = pkgInfo?.package?.name || 'Không xác định';
                const customerName = getCustomerName(o.customerId);
                const price = getOrderPrice(o);
                const purchaseDate = new Date(o.purchaseDate).toLocaleDateString('vi-VN');
                const errorDate = new Date(refundState.errorDate).toLocaleDateString('vi-VN');
                const refundAmount = refundState.amount;
                return (
                  <div className="p-2">
                    <div><strong>Tên đơn:</strong> {o.code}</div>
                    <div><strong>Sản phẩm:</strong> {productName}</div>
                    <div><strong>Gói:</strong> {packageName}</div>
                    <div><strong>Giá mua:</strong> {formatPrice(price)}</div>
                    <div><strong>Người mua:</strong> {customerName}</div>
                    <div><strong>Ngày mua:</strong> {purchaseDate}</div>
                    <div><strong>Ngày lỗi:</strong> {errorDate}</div>
                    <div><strong>Số tiền hoàn:</strong> {formatPrice(refundAmount)}</div>
                    {(() => {
                      const info = buildFullOrderInfo(o);
                      if (!info.lines.length) return null;
                      return (
                        <div style={{ marginTop: '8px' }}>
                          <strong>Thông tin đơn hàng:</strong>
                          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{info.text}</pre>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
              <div className="row g-2 align-items-end">
                <div className="col-7">
                  <label className="form-label">Ngày phát sinh lỗi</label>
                  <input
                    type="date"
                    className="form-control"
                    value={refundState.errorDate}
                    onChange={(e) => {
                      const nextDate = e.target.value;
                      const amt = computeRefundAmount(refundState.order, nextDate);
                      setRefundState(prev => prev ? { ...prev, errorDate: nextDate, amount: amt } : prev);
                    }}
                  />
                  <small className="text-muted">Dùng để tính tiền hoàn theo thời hạn còn lại</small>
                </div>
                <div className="col-5">
                  <label className="form-label">Tiền hoàn (ước tính)</label>
                  <div className="alert alert-success mb-0">{formatPrice(refundState.amount)}</div>
                </div>
              </div>
            </div>
            <div className="d-flex justify-content-end gap-2">
              <button className="btn btn-secondary" onClick={() => setRefundState(null)}>Đóng</button>
              <button
                className="btn btn-light"
                onClick={async () => {
                  const o = refundState.order;
                  const customerName = getCustomerName(o.customerId);
                  const pkgInfo = getPackageInfo(o.packageId);
                  const productName = pkgInfo?.product?.name || 'Không xác định';
                  const packageName = pkgInfo?.package?.name || 'Không xác định';
                  const price = getOrderPrice(o);
                  const baseLines = [
                    `Tên đơn: ${o.code}`,
                    `Sản phẩm: ${productName}`,
                    `Gói: ${packageName}`,
                    `Giá mua: ${formatPrice(price)}`,
                    `Người mua: ${customerName}`,
                    `Ngày mua: ${new Date(o.purchaseDate).toLocaleDateString('vi-VN')}`,
                    `Ngày lỗi: ${new Date(refundState.errorDate).toLocaleDateString('vi-VN')}`,
                    `Số tiền hoàn: ${formatPrice(refundState.amount)}`
                  ];
                  const info = buildFullOrderInfo(o);
                  if (info.lines.length) {
                    baseLines.push('', 'Thông tin đơn hàng:');
                    // Insert a blank line between each info line for readability, like the view modal
                    info.lines.forEach((line, idx) => {
                      baseLines.push(line);
                      if (idx < info.lines.length - 1) baseLines.push('');
                    });
                  }
                  const text = baseLines.join('\n');
                  try {
                    await navigator.clipboard.writeText(text);
                    notify('Đã copy thông tin hoàn tiền', 'success');
                  } catch (e) {
                    notify('Không thể copy vào clipboard', 'error');
                  }
                }}
              >
                Copy thông tin
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  const o = refundState.order;
                  const updated = Database.updateOrder(o.id, { paymentStatus: 'REFUNDED', status: 'CANCELLED' });
                  try {
                    const sb2 = getSupabase();
                    if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Hoàn tiền đơn hàng', details: `orderId=${o.id}; orderCode=${o.code}; errorDate=${refundState.errorDate}; refundAmount=${refundState.amount}` });
                  } catch {}
                  setRefundState(null);
                  setViewingOrder(null);
                  loadData();
                  notify('Đã đánh dấu hoàn tiền cho đơn', 'success');
                }}
              >
                Xác nhận hoàn tiền
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmState && (
        <div className="modal" role="dialog" aria-modal>
          <div className="modal-content" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">Xác nhận</h3>
              <button className="close" onClick={() => setConfirmState(null)}>×</button>
            </div>
            <div className="mb-4" style={{ color: 'var(--text-primary)' }}>{confirmState.message}</div>
            <div className="d-flex justify-content-end gap-2">
              <button className="btn btn-secondary" onClick={() => setConfirmState(null)}>Hủy</button>
              <button className="btn btn-danger" onClick={() => { const fn = confirmState.onConfirm; setConfirmState(null); fn(); }}>Xác nhận</button>
            </div>
          </div>
        </div>
      )}

      {returnConfirmState && (
        <div className="modal" role="dialog" aria-modal>
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3 className="modal-title">{returnConfirmState.mode === 'RETURN_ONLY' ? 'Xác nhận trả slot về kho' : 'Xác nhận xử lý slot kho'}</h3>
              <button className="close" onClick={() => setReturnConfirmState(null)}>×</button>
            </div>
            <div className="mb-3">
              <div className="alert alert-warning">
                {returnConfirmState.mode === 'RETURN_ONLY'
                  ? 'Đơn này đã hết hạn. Trước khi trả slot về kho, vui lòng xác nhận rằng bạn đã xóa slot/tài khoản khỏi hệ thống đích.'
                  : 'Đơn này đã hết hạn. Trước khi xóa đơn và trả slot về kho, vui lòng xác nhận rằng bạn đã xóa slot/tài khoản khỏi hệ thống đích.'}
              </div>
              <div className="d-flex align-items-center gap-2">
                <input
                  id="ack-slot-removed"
                  type="checkbox"
                  checked={returnConfirmState.acknowledged}
                  onChange={(e) => setReturnConfirmState(prev => prev ? { ...prev, acknowledged: e.target.checked } : prev)}
                />
                <label htmlFor="ack-slot-removed" className="mb-0">Tôi xác nhận đã xóa slot/tài khoản khỏi dịch vụ</label>
              </div>
              <div className="mt-2">
                <small className="text-muted">Sau khi xác nhận, slot sẽ được trả về kho (`AVAILABLE`).</small>
              </div>
            </div>
            <div className="d-flex justify-content-end gap-2">
              <button className="btn btn-secondary" onClick={() => setReturnConfirmState(null)}>Hủy</button>
              <button
                className="btn btn-danger"
                disabled={!returnConfirmState.acknowledged}
                onClick={async () => {
                  if (!returnConfirmState) return;
                  const { order, inventoryId, mode } = returnConfirmState;
                  // Return slot first
                  Database.releaseInventoryItem(inventoryId);
                  // Preserve latest orderInfo after unlinking inventory
                  Database.updateOrder(order.id, { orderInfo: String((order as any).orderInfo || '') } as any);
                  try {
                    const sb2 = getSupabase();
                    if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: mode === 'RETURN_ONLY' ? 'Trả slot về kho' : 'Xác nhận xóa slot & trả về kho', details: `orderId=${order.id}; inventoryId=${inventoryId}` });
                  } catch {}
                  if (mode === 'RETURN_ONLY') {
                    setReturnConfirmState(null);
                    loadData();
                    notify('Đã trả slot về kho', 'success');
                    return;
                  }
                  // DELETE_AND_RETURN
                  const success = Database.deleteOrder(order.id);
                  if (success) {
                  try {
                    const sb2 = getSupabase();
                    if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Xóa đơn hàng', details: `orderId=${order.id}; orderCode=${order.code}` });
                  } catch {}
                    setReturnConfirmState(null);
                    loadData();
                    notify('Đã trả slot về kho và xóa đơn', 'success');
                  } else {
                    notify('Không thể xóa đơn hàng', 'error');
                  }
                }}
              >
                {returnConfirmState.mode === 'RETURN_ONLY' ? 'Xác nhận trả slot' : 'Xác nhận & xóa đơn'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderList;
