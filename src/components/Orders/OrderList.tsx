import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import DateRangeInput from '../Shared/DateRangeInput';
import { Order, Customer, ProductPackage, Product, OrderStatus, ORDER_STATUSES, PaymentStatus, PAYMENT_STATUSES, CUSTOMER_SOURCES } from '../../types';
import { getSupabase } from '../../utils/supabaseClient';
import { Database } from '../../utils/database';
import OrderForm from './OrderForm';
import OrderDetailsModal from './OrderDetailsModal';
// removed export button
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { exportToXlsx, generateExportFilename } from '../../utils/excel';
import useMediaQuery from '../../hooks/useMediaQuery';
import { filterVisibleAccountColumns } from '../../utils/accountColumns';

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
  const [inventory, setInventory] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<OrderStatus | ''>('');
  const [filterPayment, setFilterPayment] = useState<PaymentStatus | ''>('');
  const [filterProduct, setFilterProduct] = useState<string>('');
  const [filterPackage, setFilterPackage] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expiryFilter, setExpiryFilter] = useState<'EXPIRING' | 'EXPIRED' | 'ACTIVE' | ''>('');
  const [slotReturnedFilter, setSlotReturnedFilter] = useState<'NOT_RETURNED' | ''>('');
  const [onlyExpiringNotSent, setOnlyExpiringNotSent] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [refundState, setRefundState] = useState<null | {
    order: Order;
    errorDate: string;
    amount: number;
    useCustomAmount?: boolean;
    customAmount?: number;
  }>(null);
  const [renewState, setRenewState] = useState<null | {
    order: Order;
    packageId: string;
    useCustomPrice: boolean;
    customPrice: number;
    note: string;
    paymentStatus: PaymentStatus;
    markMessageSent: boolean;
    useCustomExpiry: boolean;
    customExpiryDate?: Date;
  }>(null);
  const [orderPaymentModal, setOrderPaymentModal] = useState<null | { selectedIds: string[] }>(null);
  const [selectedOrderPaymentStatus, setSelectedOrderPaymentStatus] = useState<PaymentStatus>('UNPAID');
  const [orderBulkPaymentTarget, setOrderBulkPaymentTarget] = useState<'INITIAL' | 'RENEWAL'>('INITIAL');
  const [selectedOrderRenewalIds, setSelectedOrderRenewalIds] = useState<string[]>([]);

  // Helper: update payment-related fields locally (orders + viewingOrder)
  const applyOrderPaymentPatch = useCallback((orderId: string, patch: any) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...patch } as any : o));
    setViewingOrder(prev => prev && prev.id === orderId ? { ...prev, ...patch } as any : prev);
  }, []);

  const renewalsByOrder = useMemo(() => {
    const map = new Map<string, any[]>();
    orders.forEach(order => {
      const renewals = Array.isArray((order as any).renewals) ? ((order as any).renewals || []) : [];
      map.set(order.id, renewals);
    });
    return map;
  }, [orders]);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const getMobileViewportHeight = () => {
    if (typeof window === 'undefined') return 480;
    return Math.max(320, window.innerHeight - 240);
  };
  const [mobileListHeight, setMobileListHeight] = useState<number>(() => getMobileViewportHeight());
  const MOBILE_CARD_HEIGHT = 360;

  // Mark renewal message sent (Supabase-backed)
  const markRenewalMessageSent = async (orderId: string) => {
    // Update component state
    const prevOrders = orders;
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, renewalMessageSent: true, renewalMessageSentAt: new Date(), renewalMessageSentBy: state.user?.id || 'system' } : o));

    const sb = getSupabase();
    if (!sb) {
      // No Supabase available: persist locally and treat as success
      const nowIso = new Date().toISOString();
      try {
        Database.updateOrder(orderId, { renewalMessageSent: true, renewalMessageSentAt: new Date(nowIso), renewalMessageSentBy: state.user?.id || 'system' } as any);
      } catch { }
      return notify('Đã đánh dấu gửi tin nhắn gia hạn', 'success');
    }
    const nowIso = new Date().toISOString();
    const { error } = await sb.from('orders').update({
      renewal_message_sent: true,
      renewal_message_sent_at: nowIso,
      renewal_message_sent_by: state.user?.id || null
    }).eq('id', orderId);
    if (error) {
      // If Supabase write fails, keep state and persist locally
      try {
        Database.updateOrder(orderId, { renewalMessageSent: true, renewalMessageSentAt: new Date(nowIso), renewalMessageSentBy: state.user?.id || 'system' } as any);
      } catch { }
      // Soft-notify success to avoid blocking workflow
      notify('Đã đánh dấu gửi tin nhắn gia hạn (offline)', 'success');
      return;
    }
    try {
      const sb2 = getSupabase();
      if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Đánh dấu đã gửi tin nhắn gia hạn', details: `orderId=${orderId}; orderCode=${orders.find(o => o.id === orderId)?.code || ''}` });
    } catch { }
    // Mirror into local DB for consistency and trigger any dependent recomputations
    Database.updateOrder(orderId, { renewalMessageSent: true, renewalMessageSentAt: new Date(nowIso), renewalMessageSentBy: state.user?.id || 'system' } as any);
    notify('Đã đánh dấu gửi tin nhắn gia hạn', 'success');
  };

  // Initialize filters from URL first (no localStorage)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q') || '';
      const status = (params.get('status') || '') as OrderStatus | '';
      const payment = (params.get('payment') || '') as PaymentStatus | '';
      const product = params.get('product') || '';
      const packageId = params.get('package') || '';
      const from = params.get('from') || '';
      const to = params.get('to') || '';
      const expiry = (params.get('expiry') || '') as 'EXPIRING' | 'EXPIRED' | 'ACTIVE' | '';
      const notSent = params.get('onlyExpiringNotSent') === '1';
      const p = parseInt(params.get('page') || '1', 10);
      const l = parseInt((params.get('limit') || '10'), 10);


      setSearchTerm(q);
      setDebouncedSearchTerm(q);
      setFilterStatus(status);
      setFilterPayment(payment);
      setFilterProduct(product);
      setFilterPackage(packageId);
      setDateFrom(from);
      setDateTo(to);
      setExpiryFilter(expiry);
      setOnlyExpiringNotSent(!!notSent);
      setPage(!Number.isNaN(p) && p > 0 ? p : 1);
      if (!Number.isNaN(l) && l > 0) setLimit(l);

      // Deep-link: open specific order by id
      const deepOrderId = params.get('orderId');
      if (deepOrderId) {
        // Delay opening until after data load
        setTimeout(() => {
          const found = Database.getOrders().find(o => o.id === deepOrderId);
          if (found) setViewingOrder(found);
        }, 300);
      }
    } catch (e) {
      // Error reading URL params - ignore
    }
  }, []);

  // Re-read URL parameters after a short delay (for lazy loading)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const params = new URLSearchParams(window.location.search);
        const status = (params.get('status') || '') as OrderStatus | '';
        const payment = (params.get('payment') || '') as PaymentStatus | '';
        const product = params.get('product') || '';
        const packageId = params.get('package') || '';
        const expiry = (params.get('expiry') || '') as 'EXPIRING' | 'EXPIRED' | 'ACTIVE' | '';
        const notSent = params.get('onlyExpiringNotSent') === '1';
        const p = parseInt(params.get('page') || '1', 10);

        // Only update if values are different to avoid infinite loops
        if (status !== filterStatus) setFilterStatus(status);
        if (payment !== filterPayment) setFilterPayment(payment);
        if (product !== filterProduct) setFilterProduct(product);
        if (packageId !== filterPackage) setFilterPackage(packageId);
        if (expiry !== expiryFilter) setExpiryFilter(expiry);
        if (notSent !== onlyExpiringNotSent) setOnlyExpiringNotSent(notSent);
        if (p !== page) setPage(p);
      } catch { }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    const handleResize = () => setMobileListHeight(getMobileViewportHeight());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobile]);

  // Listen for packages updates from PackageForm
  useEffect(() => {
    const handlePackagesUpdate = () => {
      loadData();
    };

    window.addEventListener('packagesUpdated', handlePackagesUpdate);
    return () => window.removeEventListener('packagesUpdated', handlePackagesUpdate);
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Reset page on filter/search changes (debounced)
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchTerm, filterStatus, filterPayment, filterProduct, filterPackage, dateFrom, dateTo, expiryFilter, slotReturnedFilter, onlyExpiringNotSent]);

  // No localStorage persistence

  // Sync URL with current filters
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (debouncedSearchTerm) params.set('q', debouncedSearchTerm); else params.delete('q');
      if (filterStatus) params.set('status', filterStatus as string); else params.delete('status');
      if (filterPayment) params.set('payment', filterPayment as string); else params.delete('payment');
      if (filterProduct) params.set('product', filterProduct); else params.delete('product');
      if (filterPackage) params.set('package', filterPackage); else params.delete('package');
      if (dateFrom) params.set('from', dateFrom); else params.delete('from');
      if (dateTo) params.set('to', dateTo); else params.delete('to');
      if (expiryFilter) params.set('expiry', expiryFilter); else params.delete('expiry');
      if (onlyExpiringNotSent) params.set('onlyExpiringNotSent', '1'); else params.delete('onlyExpiringNotSent');
      params.set('page', String(page));
      params.set('limit', String(limit));
      const s = params.toString();
      const url = `${window.location.pathname}${s ? `?${s}` : ''}`;
      window.history.replaceState(null, '', url);
    } catch { }
  }, [debouncedSearchTerm, filterStatus, filterPayment, filterProduct, filterPackage, dateFrom, dateTo, expiryFilter, slotReturnedFilter, page, limit, onlyExpiringNotSent]);

  const loadData = async () => {
    const sb = getSupabase();
    if (!sb) return;
    const [ordersRes, customersRes, packagesRes, productsRes, inventoryRes] = await Promise.all([
      sb.from('orders').select('*'),
      sb.from('customers').select('*'),
      sb.from('packages').select('*'),
      sb.from('products').select('*'),
      sb.from('inventory').select('*')
    ]);

    // Auto-update order status based on expiry_date
    try {
      const now = new Date();
      const raw = Array.isArray(ordersRes.data) ? ordersRes.data : [];

      const toExpireIds: string[] = [];
      const toUnexpireIds: string[] = [];

      for (const r of raw) {
        const expiry = r.expiry_date ? new Date(r.expiry_date) : null;
        const isExpiredNow = !!expiry && expiry < now;
        const isCompleted = r.status === 'COMPLETED';
        const isExpiredStatus = r.status === 'EXPIRED';
        const isCancelled = r.status === 'CANCELLED';
        const isRefunded = r.payment_status === 'REFUNDED';

        // Skip refunded orders - they should always be CANCELLED
        if (isRefunded) {
          // Ensure refunded orders have CANCELLED status
          if (!isCancelled) {
            await sb.from('orders').update({ status: 'CANCELLED' }).eq('id', r.id);
          }
          continue;
        }

        // Mark to EXPIRED when past due and COMPLETED (not CANCELLED)
        if (isExpiredNow && isCompleted && !isExpiredStatus && !isCancelled) {
          toExpireIds.push(r.id);
        }

        // Revert EXPIRED -> COMPLETED if renewed and not cancelled
        if (!isExpiredNow && isExpiredStatus && !isCancelled) {
          toUnexpireIds.push(r.id);
        }
      }

      if (toExpireIds.length > 0) {
        for (const orderId of toExpireIds) {
          const { error: expireError } = await sb.from('orders').update({ status: 'EXPIRED' }).eq('id', orderId);
          if (expireError) {
            console.error('Auto-expire error for order', orderId, ':', expireError);
          }
        }
      }
      if (toUnexpireIds.length > 0) {
        for (const orderId of toUnexpireIds) {
          const { error: unexpireError } = await sb.from('orders').update({ status: 'COMPLETED' }).eq('id', orderId);
          if (unexpireError) {
            console.error('Auto-unexpire error for order', orderId, ':', unexpireError);
          }
        }
      }
    } catch (e) {
      // Best-effort; ignore failures and continue rendering
    }
    let allOrders = (ordersRes.data || []).map((r: any) => {
      const rawRenewals = Array.isArray(r.renewals) ? r.renewals : [];
      const mappedRenewals = rawRenewals.map((x: any) => ({
        ...x,
        previousExpiryDate: x.previousExpiryDate ? new Date(x.previousExpiryDate) : (x.previous_expiry_date ? new Date(x.previous_expiry_date) : undefined),
        newExpiryDate: x.newExpiryDate ? new Date(x.newExpiryDate) : (x.new_expiry_date ? new Date(x.new_expiry_date) : undefined),
        createdAt: x.createdAt ? new Date(x.createdAt) : (x.created_at ? new Date(x.created_at) : undefined)
      }));
      // Ensure refunded orders have CANCELLED status
      const normalizedStatus = r.payment_status === 'REFUNDED' && r.status !== 'CANCELLED'
        ? 'CANCELLED'
        : r.status;

      return {
        id: r.id,
        code: r.code,
        customerId: r.customer_id,
        packageId: r.package_id,
        status: normalizedStatus,
        paymentStatus: r.payment_status,
        notes: r.notes,
        inventoryItemId: r.inventory_item_id,
        inventoryProfileIds: r.inventory_profile_ids || undefined,
        cogs: r.cogs,
        useCustomPrice: r.use_custom_price || false,
        customPrice: r.custom_price,
        salePrice: r.sale_price,
        customFieldValues: r.custom_field_values,
        purchaseDate: r.purchase_date ? new Date(r.purchase_date) : new Date(),
        expiryDate: r.expiry_date ? new Date(r.expiry_date) : new Date(),
        createdAt: r.created_at ? new Date(r.created_at) : new Date(),
        updatedAt: r.updated_at ? new Date(r.updated_at) : new Date(),
        renewalMessageSent: !!r.renewal_message_sent,
        renewalMessageSentAt: r.renewal_message_sent_at ? new Date(r.renewal_message_sent_at) : undefined,
        renewalMessageSentBy: r.renewal_message_sent_by || undefined,
        renewals: mappedRenewals,
        refundAmount: r.refund_amount || 0,
        refundAt: r.refund_at ? new Date(r.refund_at) : undefined,
        createdBy: r.created_by || 'system'
      };
    }) as Order[];
    // Renewals are now stored directly in Supabase, no need to merge from localStorage
    setOrders(allOrders);

    const allCustomers = (customersRes.data || []).map((r: any) => {
      return {
        ...r,
        sourceDetail: r.source_detail || '',
        createdAt: r.created_at ? new Date(r.created_at) : new Date(),
        updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
      };
    }) as Customer[];

    const allPackages = (packagesRes.data || []).map((r: any) => {
      return {
        ...r,
        productId: r.product_id || r.productId,
        warrantyPeriod: r.warranty_period || r.warrantyPeriod,
        costPrice: r.cost_price || r.costPrice,
        ctvPrice: r.ctv_price || r.ctvPrice,
        retailPrice: r.retail_price || r.retailPrice,
        customFields: r.custom_fields || r.customFields,
        isAccountBased: r.is_account_based || r.isAccountBased,
        accountColumns: r.account_columns || r.accountColumns,
        defaultSlots: r.default_slots || r.defaultSlots,
        createdAt: r.created_at ? new Date(r.created_at) : new Date(),
        updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
      };
    }) as ProductPackage[];

    const allProducts = (productsRes.data || []).map((r: any) => {
      return {
        ...r,
        sharedInventoryPool: r.shared_inventory_pool || r.sharedInventoryPool,
        createdAt: r.created_at ? new Date(r.created_at) : new Date(),
        updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
      };
    }) as Product[];

    setCustomers(allCustomers);
    setPackages(allPackages);
    setProducts(allProducts);

    // Process inventory data properly like in WarehouseList
    const processedInventory = (inventoryRes.data || []).map((r: any) => {
      const purchaseDate = r.purchase_date ? new Date(r.purchase_date) : new Date();
      let expiryDate = r.expiry_date ? new Date(r.expiry_date) : null;

      // If no expiry date, calculate based on product type
      if (!expiryDate) {
        const product = allProducts.find((p: any) => p.id === r.product_id);
        if (product?.sharedInventoryPool) {
          // Shared pool products: 1 month default
          expiryDate = new Date(purchaseDate);
          expiryDate.setMonth(expiryDate.getMonth() + 1);
        } else {
          // Regular products: use package warranty period
          const packageInfo = allPackages.find((p: any) => p.id === r.package_id);
          const warrantyPeriod = packageInfo?.warrantyPeriod || 1;
          expiryDate = new Date(purchaseDate);
          expiryDate.setMonth(expiryDate.getMonth() + warrantyPeriod);
        }
      }

      return {
        id: r.id,
        code: r.code,
        productId: r.product_id,
        packageId: r.package_id,
        purchaseDate,
        expiryDate,
        sourceNote: r.source_note || '',
        purchasePrice: r.purchase_price,
        productInfo: r.product_info || '',
        notes: r.notes || '',
        status: r.status,
        isAccountBased: !!r.is_account_based,
        accountColumns: r.account_columns || [],
        accountData: r.account_data || {},
        totalSlots: r.total_slots || 0,
        profiles: (() => {
          const profiles = Array.isArray(r.profiles) ? r.profiles : [];
          // Generate missing profiles for account-based inventory
          if (!!r.is_account_based && profiles.length === 0 && (r.total_slots || 0) > 0) {
            return Array.from({ length: r.total_slots || 0 }, (_, idx) => ({
              id: `slot-${idx + 1}`,
              label: `Slot ${idx + 1}`,
              isAssigned: false
            }));
          }
          return profiles;
        })(),
        linkedOrderId: r.linked_order_id || undefined,
        linked_order_id: r.linked_order_id, // Keep both for compatibility
        createdAt: r.created_at ? new Date(r.created_at) : new Date(),
        updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
      };
    });
    setInventory(processedInventory);
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
    return () => {
      try {
        channel.unsubscribe();
      } catch (error) {
        // Error unsubscribing from realtime channel - ignore
      }
    };
  }, []);

  // Listen for view order events from notifications
  useEffect(() => {
    const handleViewOrder = (e: any) => {
      const orderId = e.detail;
      const found = orders.find(o => o.id === orderId);
      if (found) {
        setViewingOrder(found);
      }
    };

    window.addEventListener('app:viewOrder', handleViewOrder as any);
    return () => {
      window.removeEventListener('app:viewOrder', handleViewOrder as any);
    };
  }, [orders]);

  const handleCreate = () => {
    setEditingOrder(null);
    setShowForm(false); // Force close first
    setTimeout(() => {
      setShowForm(true); // Then open with fresh state
    }, 50); // Small delay to ensure fresh state
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
    // Find linked inventory properly
    const invLinked = inventory.find((i: any) => i.linked_order_id === id);
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
          try {
            // Release any linked inventory or assigned account-based profiles in Supabase before deleting the order
            // 1) Classic link: inventory.linked_order_id === order.id
            const { data: classicLinked, error: classicError } = await sb
              .from('inventory')
              .select('id')
              .eq('linked_order_id', id);

            if (classicError) {
              notify('Lỗi khi giải phóng kho hàng liên kết', 'error');
              return;
            }

            const classicIds = (classicLinked || []).map((r: any) => r.id);
            if (classicIds.length) {
              const { error: updateError } = await sb
                .from('inventory')
                .update({ status: 'AVAILABLE', linked_order_id: null })
                .in('id', classicIds);

              if (updateError) {
                notify('Lỗi khi cập nhật trạng thái kho hàng', 'error');
                return;
              }
            }

            // 2) Account-based profiles: clear any profile assigned to this order
            const { data: accountItems, error: accountError } = await sb
              .from('inventory')
              .select('*')
              .eq('is_account_based', true);

            if (accountError) {
              notify('Lỗi khi giải phóng kho hàng dạng tài khoản', 'error');
              return;
            }

            const toUpdate = (accountItems || []).filter((it: any) => Array.isArray(it.profiles) && it.profiles.some((p: any) => p.assignedOrderId === id));
            for (const it of toUpdate) {
              const nextProfiles = (Array.isArray(it.profiles) ? it.profiles : []).map((p: any) => (
                p.assignedOrderId === id
                  ? { ...p, isAssigned: false, assignedOrderId: null, assignedAt: null, expiryAt: null }
                  : p
              ));

              // Check if there are any free slots remaining
              const hasFreeSlots = nextProfiles.some((p: any) =>
                !p.isAssigned && !(p as any).needsUpdate
              );

              const { error: profileError } = await sb.from('inventory').update({
                profiles: nextProfiles,
                status: hasFreeSlots ? 'AVAILABLE' : 'SOLD'
              }).eq('id', it.id);

              if (profileError) {
                notify('Lỗi khi cập nhật profile tài khoản', 'error');
                return;
              }
            }
          } catch (error) {
            notify('Lỗi không mong muốn khi giải phóng kho hàng', 'error');
            return;
          }
          const { error } = await sb.from('orders').delete().eq('id', id);
          if (!error) {
            // Update local storage immediately
            const currentOrders = Database.getOrders();
            Database.setOrders(currentOrders.filter(o => o.id !== id));

            // Force refresh form if it's open
            if (showForm && !editingOrder) {
              setShowForm(false);
              setTimeout(() => {
                setShowForm(true);
              }, 50); // Reduced delay for better UX
            }

            try {
              const sb2 = getSupabase();
              if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Xóa đơn hàng', details: (() => { const o = orders.find(x => x.id === id); return `orderId=${id}; orderCode=${o?.code}`; })() });
            } catch { }
            loadData();
            notify('Xóa đơn hàng thành công', 'success');
          } else {
            notify('Không thể xóa đơn hàng', 'error');
          }
        })();
      }
    });
  };

  // Helper function to check if slot is already returned to inventory
  const isSlotReturned = (order: any) => {
    // Find linked inventory using same logic as handleReturnSlot
    let invLinked: any = null;

    // Method 1: Try by inventoryItemId
    if (order.inventoryItemId) {
      const found = inventory.find((i: any) => i.id === order.inventoryItemId);
      if (found) {
        // Check if any profile is assigned to this order
        if (Array.isArray(found.profiles) && found.profiles.some((p: any) => p.assignedOrderId === order.id)) {
          invLinked = found;
        }
        // For classic inventory: check linked_order_id as fallback
        else if (!found.is_account_based && found.linked_order_id === order.id) {
          invLinked = found;
        }
      }
    }

    // Method 2: If still not found, search ALL inventory by profiles
    if (!invLinked) {
      invLinked = inventory.find((i: any) => Array.isArray(i.profiles) && i.profiles.length > 0 && i.profiles.some((p: any) => p.assignedOrderId === order.id));
    }

    // Method 3: Fallback to classic linked_order_id
    if (!invLinked) {
      invLinked = inventory.find((i: any) => i.linked_order_id === order.id);
    }

    // If no linked inventory found, consider slot as returned (no slot to return)
    if (!invLinked) return true;

    // Check if slot is still assigned to this order
    if (invLinked.is_account_based || (Array.isArray(invLinked.profiles) && invLinked.profiles.length > 0)) {
      // For account-based or slot-based inventory, check if any profile is still assigned
      return !invLinked.profiles.some((p: any) => p.assignedOrderId === order.id && p.isAssigned);
    } else {
      // For classic inventory, check linked_order_id
      return invLinked.linked_order_id !== order.id;
    }
  };

  const handleReturnSlot = (id: string) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;

    // Find linked inventory using same logic as OrderForm
    let invLinked: any = null;

    // Method 1: Try by inventoryItemId (same as OrderForm line 84-92)
    if ((order as any).inventoryItemId) {
      const found = inventory.find((i: any) => i.id === (order as any).inventoryItemId);
      if (found) {
        // Check if any profile is assigned to this order (works for both account-based and slot-based)
        if (Array.isArray(found.profiles) && found.profiles.some((p: any) => p.assignedOrderId === id)) {
          invLinked = found;
        }
        // For classic inventory: check linked_order_id as fallback
        else if (!found.is_account_based && found.linked_order_id === id) {
          invLinked = found;
        }
      }
    }

    // Method 2: If still not found, search ALL inventory by profiles (not just account-based)
    if (!invLinked) {
      invLinked = inventory.find((i: any) => Array.isArray(i.profiles) && i.profiles.length > 0 && i.profiles.some((p: any) => p.assignedOrderId === id));
    }

    // Method 3: Fallback to classic linked_order_id
    if (!invLinked) {
      invLinked = inventory.find((i: any) => i.linked_order_id === id);
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
        const sb = getSupabase();
        if (!sb) {
          notify('Không thể kết nối database', 'error');
          return;
        }

        try {
          // Release inventory using direct Supabase query with error handling (same as OrderForm)
          let inventoryUpdateSuccess = false;
          if (invLinked.is_account_based || (Array.isArray(invLinked.profiles) && invLinked.profiles.length > 0)) {
            // Release account-based slots or slot-based inventory
            const profiles = invLinked.profiles || [];
            const orderProfileIds = (order as any).inventory_profile_ids || [];

            // Release all profiles assigned to this order (by assignedOrderId or by profile ID in inventory_profile_ids)
            const updatedProfiles = profiles.map((profile: any) => {
              const isAssignedToOrder = profile.assignedOrderId === order.id;
              const isInOrderProfileIds = Array.isArray(orderProfileIds) && orderProfileIds.includes(profile.id);

              if (isAssignedToOrder || isInOrderProfileIds) {
                return {
                  ...profile,
                  isAssigned: false,
                  assignedOrderId: null,
                  assignedAt: null,
                  expiryAt: null
                };
              }
              return profile;
            });

            // Check if there are any free slots remaining
            const hasFreeSlots = updatedProfiles.some((p: any) =>
              !p.isAssigned && !(p as any).needsUpdate
            );

            const { error: updateError } = await sb.from('inventory').update({
              profiles: updatedProfiles,
              status: hasFreeSlots ? 'AVAILABLE' : 'SOLD',
              updated_at: new Date().toISOString()
            }).eq('id', invLinked.id);

            if (updateError) {
              notify('Lỗi khi giải phóng slot kho hàng', 'error');
              console.error('Inventory update error:', updateError);
              // Still try to clear order link even if inventory update fails
            } else {
              inventoryUpdateSuccess = true;
            }
          } else {
            // Release classic inventory
            const { error: updateError } = await sb.from('inventory').update({
              status: 'AVAILABLE',
              linked_order_id: null,
              updated_at: new Date().toISOString()
            }).eq('id', invLinked.id);

            if (updateError) {
              notify('Lỗi khi giải phóng kho hàng', 'error');
              console.error('Inventory update error:', updateError);
              // Still try to clear order link even if inventory update fails
            } else {
              inventoryUpdateSuccess = true;
            }
          }

          // Always clear order's inventory link, even if inventory update had errors
          const { error: orderUpdateError } = await sb.from('orders').update({
            inventory_item_id: null,
            inventory_profile_ids: null
          }).eq('id', order.id);

          if (orderUpdateError) {
            notify('Lỗi khi cập nhật đơn hàng', 'error');
            console.error('Order update error:', orderUpdateError);
            return;
          }

          if (!inventoryUpdateSuccess) {
            notify('Đã xóa liên kết đơn hàng nhưng có lỗi khi cập nhật kho hàng', 'warning');
          }

          // Log activity
          try {
            await sb.from('activity_logs').insert({
              employee_id: null,
              action: 'Trả slot về kho',
              details: `orderId=${order.id}; orderCode=${order.code}; inventoryId=${invLinked.id}; inventoryCode=${invLinked.code}`
            });
          } catch { }

          loadData();
          notify('Đã trả slot về kho', 'success');
        } catch (error) {
          notify('Lỗi khi trả slot về kho', 'error');
          console.error('Unexpected error:', error);
        }
      }
    });
  };

  // Find orders with stuck inventory links (has inventory_item_id or inventory_profile_ids but no actual assigned slots)
  const stuckInventoryLinks = useMemo(() => {
    return orders.filter(order => {
      const hasInventoryLink = (order as any).inventoryItemId || ((order as any).inventoryProfileIds && Array.isArray((order as any).inventoryProfileIds) && (order as any).inventoryProfileIds.length > 0);
      if (!hasInventoryLink) return false;

      // Try to find actual inventory link (same logic as OrderDetailsModal)
      let inv = null;

      // First try by inventoryItemId
      if ((order as any).inventoryItemId) {
        const found = inventory.find(i => i.id === (order as any).inventoryItemId);
        if (found) {
          if (found.is_account_based || found.isAccountBased) {
            const profiles = found.profiles || [];
            const hasAssignedSlot = profiles.some((p: any) =>
              p.isAssigned && p.assignedOrderId === order.id
            );
            if (hasAssignedSlot) inv = found;
            else {
              const orderProfileIds = (order as any).inventoryProfileIds;
              if (orderProfileIds && Array.isArray(orderProfileIds) && orderProfileIds.length > 0) {
                const hasValidProfile = orderProfileIds.some((profileId: string) => {
                  const profile = profiles.find((p: any) => p.id === profileId);
                  return profile && profile.isAssigned && profile.assignedOrderId === order.id;
                });
                if (hasValidProfile) inv = found;
              }
            }
          } else {
            if (found.linked_order_id === order.id || found.linkedOrderId === order.id) {
              inv = found;
            }
          }
        }
      }

      // Fallback: find by linkedOrderId
      if (!inv) {
        const byLinked = inventory.find(i => i.linked_order_id === order.id || i.linkedOrderId === order.id);
        if (byLinked) inv = byLinked;
      }

      // Fallback: account-based items with assigned profiles
      if (!inv) {
        const orderProfileIds = (order as any).inventoryProfileIds;
        if (orderProfileIds && Array.isArray(orderProfileIds) && orderProfileIds.length > 0) {
          const found = inventory.find(i => {
            if (!(i.is_account_based || i.isAccountBased)) return false;
            const profiles = i.profiles || [];
            return orderProfileIds.some((profileId: string) => {
              const profile = profiles.find((p: any) => p.id === profileId);
              return profile && profile.isAssigned && profile.assignedOrderId === order.id;
            });
          });
          if (found) inv = found;
        }
      }

      // Fallback: account-based items where profile is assigned
      if (!inv) {
        inv = inventory.find(i => i.is_account_based || i.isAccountBased
          ? (i.profiles || []).some((p: any) => p.assignedOrderId === order.id && p.isAssigned)
          : false);
      }

      // If has inventory link but no actual inventory found, it's stuck
      return !inv;
    });
  }, [orders, inventory]);

  const getLatestRenewalDate = useCallback((order: Order): Date | null => {
    const renewals = Array.isArray((order as any).renewals) ? (order as any).renewals : [];
    if (!renewals.length) return null;
    let latest: Date | null = null;
    renewals.forEach((renewal: any) => {
      const raw = renewal?.newExpiryDate || renewal?.new_expiry_date;
      if (!raw) return;
      const candidate = raw instanceof Date ? raw : new Date(raw);
      if (!candidate || isNaN(candidate.getTime())) return;
      if (!latest || candidate.getTime() > latest.getTime()) {
        latest = candidate;
      }
    });
    return latest;
  }, []);

  const expiryMismatchOrders = useMemo(() => {
    return orders.filter(order => {
      const latest = getLatestRenewalDate(order);
      if (!latest) return false;
      const currentExpiry = order.expiryDate instanceof Date ? order.expiryDate : (order.expiryDate ? new Date(order.expiryDate) : null);
      if (!currentExpiry || isNaN(currentExpiry.getTime())) return false;
      return latest.getTime() > currentExpiry.getTime();
    });
  }, [orders, getLatestRenewalDate]);

  const handleFixAllStuckInventoryLinks = async () => {
    const stuckOrders = stuckInventoryLinks;
    if (stuckOrders.length === 0) {
      notify('Không có đơn hàng nào cần fix', 'info');
      return;
    }

    setConfirmState({
      message: `Bạn có chắc chắn muốn fix ${stuckOrders.length} đơn hàng có liên kết kho hàng lỗi?`,
      onConfirm: async () => {
        const sb = getSupabase();
        if (!sb) {
          notify('Không thể kết nối database', 'error');
          return;
        }

        try {
          const orderIds = stuckOrders.map(o => o.id);
          const { error } = await sb.from('orders').update({
            inventory_item_id: null,
            inventory_profile_ids: null
          }).in('id', orderIds);

          if (error) {
            notify('Lỗi khi fix liên kết kho hàng', 'error');
            console.error('Error fixing stuck inventory links:', error);
            return;
          }

          // Log activity
          try {
            await sb.from('activity_logs').insert({
              employee_id: state.user?.id || null,
              action: 'Fix liên kết kho hàng lỗi (hàng loạt)',
              details: `orderIds=${orderIds.join(',')}; count=${orderIds.length}`
            });
          } catch { }

          loadData();
          notify(`Đã fix ${stuckOrders.length} đơn hàng có liên kết kho hàng lỗi`, 'success');
        } catch (error) {
          notify('Lỗi khi fix liên kết kho hàng', 'error');
          console.error('Unexpected error:', error);
        }
      }
    });
  };

  const handleFixOrderExpiryMismatches = () => {
    const mismatches = expiryMismatchOrders;
    if (mismatches.length === 0) {
      notify('Không có đơn nào cần fix hạn', 'info');
      return;
    }

    setConfirmState({
      message: `Cập nhật hạn sử dụng cho ${mismatches.length} đơn dựa trên lần gia hạn mới nhất?`,
      onConfirm: async () => {
        const sb = getSupabase();
        if (!sb) {
          notify('Không thể kết nối database', 'error');
          return;
        }

        let success = 0;
        let failed = 0;
        const detailEntries: string[] = [];

        for (const order of mismatches) {
          const latest = getLatestRenewalDate(order);
          if (!latest) continue;
          const latestIso = latest.toISOString();
          const { error } = await sb.from('orders').update({ expiry_date: latestIso }).eq('id', order.id);
          if (error) {
            failed++;
            continue;
          }
          success++;
          const oldExpiry = order.expiryDate instanceof Date ? order.expiryDate : (order.expiryDate ? new Date(order.expiryDate) : null);
          const oldStr = oldExpiry && !isNaN(oldExpiry.getTime()) ? oldExpiry.toISOString().split('T')[0] : '-';
          detailEntries.push(`${order.code || order.id}: ${oldStr} -> ${latestIso.split('T')[0]}`);
          try {
            Database.updateOrder(order.id, { expiryDate: new Date(latest) } as any);
          } catch { }
        }

        if (success > 0) {
          try {
            const sb2 = getSupabase();
            if (sb2) await sb2.from('activity_logs').insert({
              employee_id: state.user?.id || null,
              action: 'Fix hạn đơn',
              details: `count=${success}; entries=${detailEntries.join(', ')}`
            });
          } catch { }
          notify(
            failed > 0
              ? `Đã cập nhật hạn cho ${success} đơn, ${failed} lỗi`
              : `Đã cập nhật hạn cho ${success} đơn`,
            failed > 0 ? 'warning' : 'success'
          );
          loadData();
        } else {
          notify('Không thể cập nhật hạn đơn hàng', 'error');
        }
      }
    });
  };

  const handleToggleSelectAll = (checked: boolean, ids: string[]) => {
    if (checked) {
      setSelectedIds(prev => Array.from(new Set([...prev, ...ids])));
    } else {
      setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
    }
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
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Xóa hàng loạt đơn hàng', details: `orderCodes=${codes.join(',')}` });
        } catch { }
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

      // Validate that all selected IDs exist
      const validIds = selectedIds.filter(id => orders.some(o => o.id === id));
      if (validIds.length === 0) {
        notify('Không tìm thấy đơn hàng hợp lệ', 'error');
        return;
      }

      for (const orderId of validIds) {
        const { error: singleError } = await sb.from('orders').update({ status }).eq('id', orderId);
        if (singleError) {
          console.error('Single order update error for ID', orderId, ':', singleError);
          return notify(`Không thể cập nhật đơn hàng ${orderId}: ${singleError.message}`, 'error');
        }
      }

      const codes = validIds.map(id => orders.find(o => o.id === id)?.code).filter(Boolean) as string[];
      try {
        const sb2 = getSupabase();
        if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Cập nhật trạng thái hàng loạt', details: `status=${status}; orderCodes=${codes.join(',')}` });
      } catch { }
      setSelectedIds([]);
      loadData();
      notify('Đã cập nhật trạng thái', 'success');
    })();
  };

  const bulkSetPayment = (paymentStatus: PaymentStatus) => {
    if (selectedIds.length === 0) return;
    (async () => {
      const sb = getSupabase();
      if (!sb) return notify('Không thể cập nhật thanh toán', 'error');

      // Validate that all selected IDs exist
      const validIds = selectedIds.filter(id => orders.some(o => o.id === id));
      if (validIds.length === 0) {
        notify('Không tìm thấy đơn hàng hợp lệ', 'error');
        return;
      }

      const nowIso = new Date().toISOString();
      for (const orderId of validIds) {
        // When marking as REFUNDED, also record refund amount and timestamp, and cancel the order
        let payload: any = { payment_status: paymentStatus };
        if (paymentStatus === 'REFUNDED') {
          const orderObj = orders.find(o => o.id === orderId);
          const todayStr = nowIso.split('T')[0];
          const amount = orderObj ? computeRefundAmount(orderObj as any, todayStr) : 0;
          payload = {
            ...payload,
            status: 'CANCELLED',
            refund_amount: amount,
            refund_at: nowIso
          };
        }
        const { error: singleError } = await sb.from('orders').update(payload).eq('id', orderId);
        if (singleError) {
          console.error('Single order payment update error for ID', orderId, ':', singleError);
          return notify(`Không thể cập nhật thanh toán đơn hàng ${orderId}: ${singleError.message}`, 'error');
        }

        // Cập nhật ngay trong state & modal đang mở để không cần refresh
        applyOrderPaymentPatch(orderId, {
          paymentStatus: payload.payment_status as PaymentStatus,
          status: (payload as any).status ?? (orders.find(o => o.id === orderId)?.status as OrderStatus),
          refundAmount: (payload as any).refund_amount ?? (orders.find(o => o.id === orderId) as any)?.refundAmount,
          refundAt: (payload as any).refund_at ? new Date((payload as any).refund_at) : (orders.find(o => o.id === orderId) as any)?.refundAt
        });
      }

      const codes = validIds.map(id => orders.find(o => o.id === id)?.code).filter(Boolean) as string[];
      try {
        const sb2 = getSupabase();
        if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Cập nhật thanh toán hàng loạt', details: `paymentStatus=${paymentStatus}; orderCodes=${codes.join(',')}` });
      } catch { }
      setSelectedIds([]);
      await loadData();
      // Đảm bảo không bị loadData ghi đè trạng thái mới
      validIds.forEach(id => applyOrderPaymentPatch(id, {
        paymentStatus: paymentStatus,
        status: paymentStatus === 'REFUNDED' ? 'CANCELLED' as OrderStatus : orders.find(o => o.id === id)?.status
      }));
      notify('Đã cập nhật thanh toán', 'success');
    })();
  };

  const handleFormSubmit = async (createdOrder?: Order) => {
    setShowForm(false);
    setEditingOrder(null);
    // If a new order was created, open it in detail modal
    if (createdOrder) {
      // Add small delay to ensure Supabase has committed the transaction
      setTimeout(async () => {
        await loadData();
        // Use the created order directly - it already has all the data we need
        setViewingOrder(createdOrder);
      }, 500);
    } else {
      // For updates or other operations, just reload
      setTimeout(() => {
        loadData();
      }, 500);
    }
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

  // Lowercased name and code maps for cheaper substring search
  const customerNameLower = useMemo(() => {
    const m = new Map<string, string>();
    customers.forEach(c => m.set(c.id, (c.name || '').toLowerCase()));
    return m;
  }, [customers]);

  const customerCodeLower = useMemo(() => {
    const m = new Map<string, string>();
    customers.forEach(c => m.set(c.id, (c.code || '').toLowerCase()));
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

  const getOrderAccountColumns = useCallback((orderPackageId?: string, linkedInventory?: any) => {
    // Priority 1: Check order package accountColumns first (contains correct visibility settings)
    if (orderPackageId) {
      const orderPackage = packageMap.get(orderPackageId);
      const orderPkgCols = orderPackage?.accountColumns || (orderPackage as any)?.account_columns;
      if (orderPkgCols && Array.isArray(orderPkgCols) && orderPkgCols.length > 0) {
        return orderPkgCols;
      }
    }
    // Priority 2: Check package from inventory accountColumns (inventory's package)
    if (linkedInventory?.packageId) {
      const inventoryPackage = packageMap.get(linkedInventory.packageId);
      const invPkgCols = inventoryPackage?.accountColumns || (inventoryPackage as any)?.account_columns;
      if (invPkgCols && Array.isArray(invPkgCols) && invPkgCols.length > 0) {
        return invPkgCols;
      }
    }
    // Priority 3: Fallback to inventory accountColumns (both camelCase and snake_case)
    const invCols = linkedInventory?.accountColumns || linkedInventory?.account_columns;
    if (invCols && Array.isArray(invCols) && invCols.length > 0) {
      return invCols;
    }
    return [];
  }, [packageMap]);

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

  // Tính toán payment status hiển thị: nếu có ít nhất 1 renewal chưa thanh toán thì hiển thị "Chưa thanh toán"
  const getDisplayPaymentStatus = (order: Order): PaymentStatus => {
    // Nếu order đã hoàn tiền, giữ nguyên
    if (order.paymentStatus === 'REFUNDED') {
      return 'REFUNDED';
    }

    // Kiểm tra các lần gia hạn
    const renewals = Array.isArray((order as any).renewals) ? ((order as any).renewals || []) : [];
    if (renewals.length > 0) {
      // Nếu có ít nhất 1 renewal chưa thanh toán, hiển thị "Chưa thanh toán"
      const hasUnpaidRenewal = renewals.some((r: any) => {
        const renewalPaymentStatus = r.paymentStatus || 'UNPAID';
        return renewalPaymentStatus !== 'PAID' && renewalPaymentStatus !== 'REFUNDED';
      });
      if (hasUnpaidRenewal) {
        return 'UNPAID';
      }
    }

    // Trả về payment status của order chính
    return order.paymentStatus || 'UNPAID';
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

  const getPaymentShortLabel = (value: PaymentStatus | undefined | null) => {
    if (!value) return 'Chưa TT';
    switch (value) {
      case 'PAID':
        return 'Đã TT';
      case 'UNPAID':
        return 'Chưa TT';
      case 'REFUNDED':
        return 'Hoàn';
      default:
        return 'Chưa TT';
    }
  };

  const getPaymentClass = (value: PaymentStatus | undefined | null) => {
    if (!value) return 'status-processing';
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
    const baseLines: string[] = [];
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

  // Base filtered list (without product/package filters) - used to determine available filter options
  const baseFilteredOrders = useMemo(() => {
    const normalizedSearch = debouncedSearchTerm.trim().toLowerCase();
    const nowTs = Date.now();
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toTs = dateTo ? new Date(dateTo).getTime() : Number.POSITIVE_INFINITY;

    return orders.filter(order => {
      // Search
      const pkg = packageMap.get(order.packageId);
      const product = pkg ? productMap.get(pkg.productId) : undefined;

      // Find linked inventory for this order
      const linkedInventory = (() => {
        if (order.inventoryItemId) {
          const found = inventory.find((i: any) => i.id === order.inventoryItemId);
          if (found) return found;
        }
        const byLinked = inventory.find((i: any) => i.linked_order_id === order.id);
        if (byLinked) return byLinked;
        return inventory.find((i: any) => i.is_account_based && (i.profiles || []).some((p: any) => p.assignedOrderId === order.id));
      })();

      // Build inventory search text
      let inventorySearchText = '';
      if (linkedInventory) {
        inventorySearchText = [
          linkedInventory.code || '',
          linkedInventory.productInfo || '',
          linkedInventory.sourceNote || '',
          linkedInventory.notes || '',
          linkedInventory.supplierName || '',
          linkedInventory.supplierId || ''
        ].join(' ').toLowerCase();

        // Add account data if available
        if (linkedInventory.accountData) {
          Object.values(linkedInventory.accountData).forEach(value => {
            if (value && typeof value === 'string') {
              inventorySearchText += ' ' + value.toLowerCase();
            }
          });
        }
      }

      // Build custom field values search text
      let customFieldsSearchText = '';
      const custom = ((order as any).customFieldValues || {}) as Record<string, string>;
      if (pkg && Array.isArray(pkg.customFields) && pkg.customFields.length) {
        pkg.customFields.forEach(cf => {
          const val = custom[cf.id];
          if (val !== undefined && String(val).trim()) {
            customFieldsSearchText += ' ' + String(val).toLowerCase();
          }
        });
      }

      const matchesSearch =
        (order.code || '').toLowerCase().includes(normalizedSearch) ||
        (customerNameLower.get(order.customerId) || '').includes(normalizedSearch) ||
        (customerCodeLower.get(order.customerId) || '').includes(normalizedSearch) ||
        (product ? (productNameLower.get(product.id) || '') : '').includes(normalizedSearch) ||
        (pkg ? (packageNameLower.get(pkg.id) || '') : '').includes(normalizedSearch) ||
        (order.notes ? String(order.notes).toLowerCase().includes(normalizedSearch) : false) ||
        inventorySearchText.includes(normalizedSearch) ||
        customFieldsSearchText.includes(normalizedSearch);

      if (!matchesSearch) return false;

      // Status & payment
      if (filterStatus && order.status !== filterStatus) return false;
      if (filterPayment && getDisplayPaymentStatus(order) !== filterPayment) return false;

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

      // Only expiring and not yet sent renewal message
      if (onlyExpiringNotSent) {
        const daysToExpiry = Math.ceil((expiryTs - nowTs) / 86400000);
        const isExpiring = daysToExpiry >= 0 && daysToExpiry <= 7;
        if (!(isExpiring && !((order as any).renewalMessageSent))) return false;
      }

      // Slot returned filter
      if (slotReturnedFilter) {
        const isReturned = isSlotReturned(order);
        if (slotReturnedFilter === 'NOT_RETURNED' && isReturned) {
          return false;
        }
      }

      return true;
    });
  }, [orders, debouncedSearchTerm, filterStatus, filterPayment, dateFrom, dateTo, expiryFilter, slotReturnedFilter, onlyExpiringNotSent, packageMap, productMap, customerNameLower, customerCodeLower, productNameLower, packageNameLower, inventory]);

  // Extract available products and packages from base filtered list
  // Products: if package filter is set, only show products that have that package
  const availableProducts = useMemo(() => {
    const productSet = new Set<string>();
    baseFilteredOrders.forEach(order => {
      const pkg = packageMap.get(order.packageId);
      if (pkg) {
        // If package filter is set, only include products that have that package
        if (filterPackage) {
          if (pkg.id === filterPackage) {
            const product = productMap.get(pkg.productId);
            if (product) productSet.add(product.id);
          }
        } else {
          const product = productMap.get(pkg.productId);
          if (product) productSet.add(product.id);
        }
      }
    });
    return Array.from(productSet).map(id => productMap.get(id)).filter(Boolean) as Product[];
  }, [baseFilteredOrders, packageMap, productMap, filterPackage]);

  // Packages: if product filter is set, only show packages from that product
  const availablePackages = useMemo(() => {
    const packageSet = new Set<string>();
    baseFilteredOrders.forEach(order => {
      const pkg = packageMap.get(order.packageId);
      if (pkg) {
        // If product filter is set, only include packages from that product
        if (filterProduct) {
          const product = productMap.get(pkg.productId);
          if (product && product.id === filterProduct) {
            packageSet.add(pkg.id);
          }
        } else {
          packageSet.add(pkg.id);
        }
      }
    });
    return Array.from(packageSet).map(id => packageMap.get(id)).filter(Boolean) as ProductPackage[];
  }, [baseFilteredOrders, packageMap, productMap, filterProduct]);

  // Clear package filter if selected package is not in available packages
  useEffect(() => {
    if (filterPackage && !availablePackages.find(p => p.id === filterPackage)) {
      setFilterPackage('');
    }
  }, [filterPackage, availablePackages]);

  // Clear product filter if selected product is not in available products
  useEffect(() => {
    if (filterProduct && !availableProducts.find(p => p.id === filterProduct)) {
      setFilterProduct('');
    }
  }, [filterProduct, availableProducts]);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = debouncedSearchTerm.trim().toLowerCase();
    const nowTs = Date.now();
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toTs = dateTo ? new Date(dateTo).getTime() : Number.POSITIVE_INFINITY;


    const filtered = orders.filter(order => {
      // Search
      const pkg = packageMap.get(order.packageId);
      const product = pkg ? productMap.get(pkg.productId) : undefined;

      // Find linked inventory for this order
      const linkedInventory = (() => {
        if (order.inventoryItemId) {
          const found = inventory.find((i: any) => i.id === order.inventoryItemId);
          if (found) return found;
        }
        const byLinked = inventory.find((i: any) => i.linked_order_id === order.id);
        if (byLinked) return byLinked;
        return inventory.find((i: any) => i.is_account_based && (i.profiles || []).some((p: any) => p.assignedOrderId === order.id));
      })();

      // Build inventory search text
      let inventorySearchText = '';
      if (linkedInventory) {
        inventorySearchText = [
          linkedInventory.code || '',
          linkedInventory.productInfo || '',
          linkedInventory.sourceNote || '',
          linkedInventory.notes || '',
          linkedInventory.supplierName || '',
          linkedInventory.supplierId || ''
        ].join(' ').toLowerCase();

        // Add account data if available
        if (linkedInventory.accountData) {
          Object.values(linkedInventory.accountData).forEach(value => {
            if (value && typeof value === 'string') {
              inventorySearchText += ' ' + value.toLowerCase();
            }
          });
        }
      }

      // Build custom field values search text
      let customFieldsSearchText = '';
      const custom = ((order as any).customFieldValues || {}) as Record<string, string>;
      if (pkg && Array.isArray(pkg.customFields) && pkg.customFields.length) {
        pkg.customFields.forEach(cf => {
          const val = custom[cf.id];
          if (val !== undefined && String(val).trim()) {
            customFieldsSearchText += ' ' + String(val).toLowerCase();
          }
        });
      }

      const purchaseDateStrings: string[] = [];
      if (order.purchaseDate) {
        const purchaseDateObj = new Date(order.purchaseDate);
        if (!Number.isNaN(purchaseDateObj.getTime())) {
          purchaseDateStrings.push(purchaseDateObj.toLocaleDateString('vi-VN').toLowerCase());
          purchaseDateStrings.push(purchaseDateObj.toLocaleDateString('en-GB').toLowerCase());
          purchaseDateStrings.push(purchaseDateObj.toISOString().slice(0, 10).toLowerCase());
        }
      }

      const expiryDateStrings: string[] = [];
      if (order.expiryDate) {
        const expiryDateObj = new Date(order.expiryDate);
        if (!Number.isNaN(expiryDateObj.getTime())) {
          expiryDateStrings.push(expiryDateObj.toLocaleDateString('vi-VN').toLowerCase());
          expiryDateStrings.push(expiryDateObj.toLocaleDateString('en-GB').toLowerCase());
          expiryDateStrings.push(expiryDateObj.toISOString().slice(0, 10).toLowerCase());
        }
      }

      const matchesSearch =
        (order.code || '').toLowerCase().includes(normalizedSearch) ||
        (customerNameLower.get(order.customerId) || '').includes(normalizedSearch) ||
        (customerCodeLower.get(order.customerId) || '').includes(normalizedSearch) ||
        (product ? (productNameLower.get(product.id) || '') : '').includes(normalizedSearch) ||
        (pkg ? (packageNameLower.get(pkg.id) || '') : '').includes(normalizedSearch) ||
        (order.notes ? String(order.notes).toLowerCase().includes(normalizedSearch) : false) ||
        inventorySearchText.includes(normalizedSearch) ||
        customFieldsSearchText.includes(normalizedSearch) ||
        purchaseDateStrings.some(dateStr => dateStr.includes(normalizedSearch)) ||
        expiryDateStrings.some(dateStr => dateStr.includes(normalizedSearch));

      if (!matchesSearch) return false;

      // Status & payment
      if (filterStatus && order.status !== filterStatus) return false;
      if (filterPayment && getDisplayPaymentStatus(order) !== filterPayment) return false;

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

      // Only expiring and not yet sent renewal message
      if (onlyExpiringNotSent) {
        const daysToExpiry = Math.ceil((expiryTs - nowTs) / 86400000);
        const isExpiring = daysToExpiry >= 0 && daysToExpiry <= 7;
        if (!(isExpiring && !((order as any).renewalMessageSent))) return false;
      }

      // Slot returned filter
      if (slotReturnedFilter) {
        const isReturned = isSlotReturned(order);
        if (slotReturnedFilter === 'NOT_RETURNED' && isReturned) {
          return false;
        }
      }

      // Product filter
      if (filterProduct) {
        if (!product || product.id !== filterProduct) return false;
      }

      // Package filter
      if (filterPackage) {
        if (!pkg || pkg.id !== filterPackage) return false;
      }

      return true;
    });


    return filtered;
  }, [orders, debouncedSearchTerm, filterStatus, filterPayment, filterProduct, filterPackage, dateFrom, dateTo, expiryFilter, slotReturnedFilter, onlyExpiringNotSent, packageMap, productMap, customerNameLower, customerCodeLower, productNameLower, packageNameLower, inventory]);

  const { total, totalPages, currentPage, start, paginatedOrders } = useMemo(() => {
    const totalLocal = filteredOrders.length;
    const totalPagesLocal = Math.max(1, Math.ceil(totalLocal / limit));
    const currentPageLocal = Math.min(page, totalPagesLocal);
    const startLocal = (currentPageLocal - 1) * limit;
    const sortedLocal = filteredOrders
      .slice()
      .sort((a, b) => {
        const getCodeNumber = (code: string | undefined | null) => {
          if (!code) return Number.POSITIVE_INFINITY;
          const m = String(code).match(/\d+/);
          return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
        };
        const na = getCodeNumber(a.code as any);
        const nb = getCodeNumber(b.code as any);
        if (na !== nb) return na - nb;
        return (a.code || '').localeCompare(b.code || '');
      });
    const paginatedLocal = sortedLocal.slice(startLocal, startLocal + limit);
    return {
      total: totalLocal,
      totalPages: totalPagesLocal,
      currentPage: currentPageLocal,
      start: startLocal,
      paginatedOrders: paginatedLocal
    };
  }, [filteredOrders, page, limit]);

  // Linkify plain text into clickable anchors (http(s) & www.)
  const linkifyText = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    if (!text) return parts;
    const urlRegex = /((https?:\/\/|www\.)[^\s]+)$/gi;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = urlRegex.exec(text)) !== null) {
      const start = match.index;
      const end = urlRegex.lastIndex;
      if (start > lastIndex) parts.push(text.slice(lastIndex, start));
      const raw = match[0];
      const href = raw.startsWith('http') ? raw : `https://${raw}`;
      parts.push(
        <a key={`${start}-${end}`} href={href} target="_blank" rel="noreferrer">{raw}</a>
      );
      lastIndex = end;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts;
  };

  const renderCustomerFullInfo = (customer: Customer) => {
    const typeLabel = customer.type === 'CTV' ? 'CTV' : 'Khách lẻ';
    const phone = customer.phone || '';
    const email = customer.email || '';
    const source = customer.source ? (CUSTOMER_SOURCES.find(s => s.value === customer.source)?.label || String(customer.source)) : '';
    return (
      <div className="card mt-2">
        <div className="card-header"><strong>Khách hàng</strong></div>
        <div className="card-body">
          <div><strong>Mã KH:</strong> {customer.code || '-'}</div>
          <div><strong>Tên:</strong> {customer.name || '-'}</div>
          <div><strong>Loại:</strong> {typeLabel}</div>
          <div>
            <strong>SĐT:</strong> {phone || '-'}
            {phone && (
              <>
                {' '}· <a href={`tel:${phone}`}>Gọi</a>
                {' '}· <a href={`https://zalo.me/${encodeURIComponent(phone)}`} target="_blank" rel="noreferrer">Zalo</a>
              </>
            )}
          </div>
          <div>
            <strong>Email:</strong> {email || '-'}
            {email && (
              <>
                {' '}· <a href={`mailto:${email}`}>Email</a>
              </>
            )}
          </div>
          {customer.source && (
            <div><strong>Nguồn:</strong> {source}</div>
          )}
          {customer.sourceDetail && (
            <div><strong>Nguồn chi tiết:</strong> {linkifyText(customer.sourceDetail)}</div>
          )}
          {customer.notes && (
            <div><strong>Ghi chú:</strong> {linkifyText(customer.notes)}</div>
          )}
        </div>
      </div>
    );
  };

  const exportOrdersXlsx = (items: Order[], filename: string) => {
    const rows = items.map((o, idx) => {
      const pkgInfo = getPackageInfo(o.packageId);
      const customer = customerMap.get(o.customerId);
      const product = pkgInfo?.product;
      const packageInfo = pkgInfo?.package;

      // Get linked inventory information
      const linkedInventory = (() => {
        if (o.inventoryItemId) {
          const found = inventory.find((i: any) => i.id === o.inventoryItemId);
          if (found) return found;
        }
        const byLinked = inventory.find((i: any) => i.linked_order_id === o.id);
        if (byLinked) return byLinked;
        return inventory.find((i: any) => i.is_account_based && (i.profiles || []).some((p: any) => p.assignedOrderId === o.id));
      })();

      // Build custom field values
      const customFieldValues = (o as any).customFieldValues || {};
      const customFieldsText = packageInfo?.customFields?.map(cf => {
        const value = customFieldValues[cf.id];
        return value ? `${cf.title}: ${value}` : null;
      }).filter(Boolean).join('; ') || '';

      // Build inventory account data
      let inventoryAccountData = '';
      if (linkedInventory && linkedInventory.is_account_based && linkedInventory.accountData) {
        const accountColumns = getOrderAccountColumns(o.packageId, linkedInventory);
        const columns = Array.isArray(accountColumns) ? accountColumns : [];
        inventoryAccountData = columns.map((col: any) => {
          const value = (linkedInventory.accountData || {})[col.id] || '';
          return value ? `${col.title}: ${value}` : null;
        }).filter(Boolean).join('; ');
      }

      // Build renewal history
      const renewalHistory = (o.renewals || []).map(r => {
        const renewalDate = new Date(r.createdAt).toLocaleDateString('vi-VN');
        const price = r.useCustomPrice ? (r as any).customPrice : r.price;
        return `${renewalDate}: ${formatPrice(price)} (${r.months} tháng)`;
      }).join('; ');

      return {
        // Basic order info
        code: o.code || `#${idx + 1}`,
        customerName: customer?.name || 'Không xác định',
        customerCode: customer?.code || '',
        customerType: customer?.type === 'CTV' ? 'CTV' : 'Khách lẻ',
        customerPhone: customer?.phone || '',
        customerEmail: customer?.email || '',
        customerSource: customer?.source ? (CUSTOMER_SOURCES.find(s => s.value === customer.source)?.label || customer.source) : '',
        customerSourceDetail: customer?.sourceDetail || '',
        customerNotes: customer?.notes || '',

        // Product info
        productName: product?.name || '',
        productCode: product?.code || '',
        productDescription: product?.description || '',
        packageName: packageInfo?.name || '',
        packageCode: packageInfo?.code || '',
        warrantyPeriod: packageInfo?.warrantyPeriod ? `${packageInfo.warrantyPeriod} tháng` : '',

        // Order details
        purchaseDate: new Date(o.purchaseDate).toLocaleDateString('vi-VN'),
        expiryDate: new Date(o.expiryDate).toLocaleDateString('vi-VN'),
        status: getStatusLabel(o.status),
        paymentStatus: getPaymentLabel(getDisplayPaymentStatus(o)),

        // Pricing
        costPrice: packageInfo?.costPrice || 0,
        ctvPrice: packageInfo?.ctvPrice || 0,
        retailPrice: packageInfo?.retailPrice || 0,
        orderPrice: getOrderPrice(o),
        useCustomPrice: o.useCustomPrice ? 'Có' : 'Không',
        customPrice: o.customPrice || '',
        cogs: o.cogs || '',
        salePrice: o.salePrice || '',

        notes: o.notes || '',
        customFields: customFieldsText,

        // Inventory info
        inventoryCode: linkedInventory?.code || '',
        inventoryProductInfo: linkedInventory?.productInfo || '',
        inventorySourceNote: linkedInventory?.sourceNote || '',
        inventorySupplierName: linkedInventory?.supplierName || '',
        inventorySupplierId: linkedInventory?.supplierId || '',
        inventoryPurchasePrice: linkedInventory?.purchasePrice || '',
        inventoryAccountData: inventoryAccountData,
        inventoryTotalSlots: linkedInventory?.totalSlots || '',
        inventoryAssignedSlots: linkedInventory?.profiles?.filter((p: any) => p.isAssigned).length || '',

        // Renewal info
        renewalMessageSent: o.renewalMessageSent ? 'Đã gửi' : 'Chưa gửi',
        renewalMessageSentBy: o.renewalMessageSentBy || '',
        renewalMessageSentAt: o.renewalMessageSentAt ? new Date(o.renewalMessageSentAt).toLocaleDateString('vi-VN') : '',
        renewalHistory: renewalHistory,

        // System info
        createdBy: o.createdBy || '',
        createdAt: new Date(o.createdAt).toLocaleDateString('vi-VN'),
        updatedAt: new Date(o.updatedAt).toLocaleDateString('vi-VN'),
      };
    });

    exportToXlsx(rows, [
      // Basic order info
      { header: 'Mã đơn', key: 'code', width: 14 },
      { header: 'Ngày mua', key: 'purchaseDate', width: 14 },
      { header: 'Ngày hết hạn', key: 'expiryDate', width: 14 },
      { header: 'Trạng thái', key: 'status', width: 14 },
      { header: 'Thanh toán', key: 'paymentStatus', width: 14 },

      // Customer info
      { header: 'Tên khách hàng', key: 'customerName', width: 24 },
      { header: 'Mã khách hàng', key: 'customerCode', width: 16 },
      { header: 'Loại khách', key: 'customerType', width: 12 },
      { header: 'SĐT khách', key: 'customerPhone', width: 16 },
      { header: 'Email khách', key: 'customerEmail', width: 20 },
      { header: 'Nguồn khách', key: 'customerSource', width: 16 },
      { header: 'Chi tiết nguồn', key: 'customerSourceDetail', width: 20 },
      { header: 'Ghi chú khách', key: 'customerNotes', width: 20 },

      // Product info
      { header: 'Tên sản phẩm', key: 'productName', width: 24 },
      { header: 'Mã sản phẩm', key: 'productCode', width: 16 },
      { header: 'Mô tả sản phẩm', key: 'productDescription', width: 24 },
      { header: 'Tên gói', key: 'packageName', width: 20 },
      { header: 'Mã gói', key: 'packageCode', width: 16 },
      { header: 'Thời hạn bảo hành', key: 'warrantyPeriod', width: 16 },

      // Pricing
      { header: 'Giá vốn', key: 'costPrice', width: 12 },
      { header: 'Giá CTV', key: 'ctvPrice', width: 12 },
      { header: 'Giá lẻ', key: 'retailPrice', width: 12 },
      { header: 'Giá đơn hàng', key: 'orderPrice', width: 12 },
      { header: 'Dùng giá tùy chỉnh', key: 'useCustomPrice', width: 16 },
      { header: 'Giá tùy chỉnh', key: 'customPrice', width: 12 },
      { header: 'Giá vốn snapshot', key: 'cogs', width: 12 },
      { header: 'Giá bán snapshot', key: 'salePrice', width: 12 },

      // Order details
      { header: 'Ghi chú', key: 'notes', width: 20 },
      { header: 'Trường tùy chỉnh', key: 'customFields', width: 30 },

      // Inventory info
      { header: 'Mã kho hàng', key: 'inventoryCode', width: 16 },
      { header: 'Thông tin sản phẩm kho', key: 'inventoryProductInfo', width: 30 },
      { header: 'Ghi chú nguồn kho', key: 'inventorySourceNote', width: 20 },
      { header: 'Nhà cung cấp', key: 'inventorySupplierName', width: 20 },
      { header: 'Mã nhà cung cấp', key: 'inventorySupplierId', width: 16 },
      { header: 'Giá mua kho', key: 'inventoryPurchasePrice', width: 12 },
      { header: 'Dữ liệu tài khoản', key: 'inventoryAccountData', width: 30 },
      { header: 'Tổng slot', key: 'inventoryTotalSlots', width: 10 },
      { header: 'Slot đã gán', key: 'inventoryAssignedSlots', width: 12 },

      // Renewal info
      { header: 'Đã gửi tin nhắn gia hạn', key: 'renewalMessageSent', width: 20 },
      { header: 'Người gửi tin nhắn', key: 'renewalMessageSentBy', width: 16 },
      { header: 'Ngày gửi tin nhắn', key: 'renewalMessageSentAt', width: 16 },
      { header: 'Lịch sử gia hạn', key: 'renewalHistory', width: 30 },

      // System info
      { header: 'Người tạo', key: 'createdBy', width: 16 },
      { header: 'Ngày tạo', key: 'createdAt', width: 14 },
      { header: 'Ngày cập nhật', key: 'updatedAt', width: 14 },
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
    // Use sale_price snapshot if available (this is the standard price)
    if (typeof order.salePrice === 'number' && order.salePrice > 0) {
      return order.salePrice;
    }
    // Fallback to package price based on customer type
    return customer.type === 'CTV'
      ? packageInfo.package.ctvPrice
      : packageInfo.package.retailPrice;
  };

  const getOrderSnapshotRevenue = useCallback((order: Order): number => {
    if (order.paymentStatus === 'REFUNDED') return 0;
    const salePrice = (order as any).salePrice;
    if (typeof salePrice !== 'number' || isNaN(salePrice) || salePrice < 0) return 0;
    const refundAmount = (order as any).refundAmount || 0;
    const netRevenue = Math.max(0, salePrice - refundAmount);
    return netRevenue;
  }, []);

  const { totalRevenue } = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < filteredOrders.length; i++) {
      const order = filteredOrders[i];
      const statusEligible = order.status === 'COMPLETED' || order.status === 'EXPIRED';
      if (!statusEligible) continue;

      const paid = order.paymentStatus === 'PAID';
      if (!paid) continue;

      const revenue = getOrderSnapshotRevenue(order);
      if (revenue <= 0) continue;

      sum += revenue;
    }
    return { totalRevenue: sum };
  }, [filteredOrders, getOrderSnapshotRevenue]);
  const totalOrderCount = filteredOrders.length;

  const getSelectedTotal = useMemo(() => {
    // Sum selected orders: paid completed/expired use snapshot revenue, unpaid uses current price
    let sum = 0;
    for (let i = 0; i < selectedIds.length; i++) {
      const order = filteredOrders.find(o => o.id === selectedIds[i]);
      if (!order) continue;

      if (order.paymentStatus === 'REFUNDED') {
        continue; // Skip refunded orders
      } else if ((order.status === 'COMPLETED' || order.status === 'EXPIRED') && order.paymentStatus === 'PAID') {
        // For paid completed orders, use snapshot revenue
        sum += getOrderSnapshotRevenue(order);
      } else {
        // For unpaid orders (any status), use current price
        sum += getOrderPrice(order);
      }
    }
    return sum;
  }, [selectedIds, filteredOrders, getOrderSnapshotRevenue, customerMap, packageMap, productMap]);

  const roundDownToThousand = (value: number) => {
    return Math.max(0, Math.floor(value / 1000) * 1000);
  };

  // Determine the applicable billing cycle for a given error date
  const getApplicableCycle = (order: Order, errorDateStr: string) => {
    const purchase = new Date(order.purchaseDate);
    const expiry = new Date(order.expiryDate);

    let cycleStart = new Date(purchase);
    let cycleEnd = new Date(expiry);
    let cyclePrice = getOrderPrice(order) || 0;
    let isFromRenewal = false;

    const renewals = ((order as any).renewals || []).slice().sort((a: any, b: any) => +new Date(a.newExpiryDate) - +new Date(b.newExpiryDate));
    const lastRenewal = renewals.length > 0 ? renewals[renewals.length - 1] : null;

    if (lastRenewal) {
      cycleStart = new Date(lastRenewal.previousExpiryDate);
      cycleEnd = new Date(lastRenewal.newExpiryDate);
      if (typeof lastRenewal.price === 'number' && lastRenewal.price > 0) cyclePrice = lastRenewal.price;
      isFromRenewal = true;
    } else {
      const pkgInfo = getPackageInfo(order.packageId);
      const warrantyMonths = Math.max(1, Math.floor(pkgInfo?.package?.warrantyPeriod || 1));
      const inferredStart = new Date(expiry);
      inferredStart.setMonth(inferredStart.getMonth() - warrantyMonths);
      cycleStart = inferredStart;
      cycleEnd = expiry;
      isFromRenewal = inferredStart > purchase;
    }

    return { cycleStart, cycleEnd, cyclePrice, isFromRenewal };
  };

  const computeRefundAmount = (order: Order, errorDateStr: string) => {
    const errorDate = new Date(errorDateStr);
    if (isNaN(errorDate.getTime())) return 0;

    const { cycleStart, cycleEnd, cyclePrice } = getApplicableCycle(order, errorDateStr);

    if (!cyclePrice) return 0;
    if (errorDate <= cycleStart) return roundDownToThousand(cyclePrice);
    if (errorDate >= cycleEnd) return 0;

    const totalDays = Math.max(1, Math.ceil((cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)));
    const remainingDays = Math.max(0, Math.ceil((cycleEnd.getTime() - errorDate.getTime()) / (1000 * 60 * 60 * 24)));
    const prorate = remainingDays / totalDays;
    return roundDownToThousand(Math.round(cyclePrice * prorate));
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
          <td>
            <div>{order.code || `#${index + 1}`}</div>
            {order.renewalMessageSent && (
              <small className="badge bg-info" style={{ display: 'inline-block', marginTop: 4 }}>Đã gửi gia hạn</small>
            )}
          </td>
          <td>{formatDate(order.purchaseDate)}</td>
          <td>
            <div>{getCustomerName(order.customerId)}</div>
            {customer && (
              <small className="text-muted">{customer.type === 'CTV' ? 'CTV' : 'Khách lẻ'}</small>
            )}
          </td>
          <td>{packageInfo?.product?.name || 'Không xác định'}</td>
          <td>{packageInfo?.package?.name || 'Không xác định'}</td>
          <td>
            <div>{formatDate(order.expiryDate)}</div>
            {(() => {
              const daysLeft = Math.ceil((new Date(order.expiryDate).getTime() - Date.now()) / 86400000);
              if (daysLeft >= 0 && daysLeft <= 7) return <small className="text-warning">Sắp hết hạn</small>;
              return null;
            })()}
          </td>
          <td>
            <span
              className={`status-badge ${getStatusClass(order.status)}`}
              style={{ padding: '2px 6px', fontSize: 12, lineHeight: 1 }}
              title={getStatusLabel(order.status)}
            >
              {getStatusLabel(order.status)}
            </span>
          </td>
          <td>
            <span
              className={`status-badge ${getPaymentClass(getDisplayPaymentStatus(order))}`}
              style={{ padding: '2px 6px', fontSize: 12, lineHeight: 1 }}
              title={getPaymentLabel(getDisplayPaymentStatus(order)) || 'Chưa thanh toán'}
            >
              {getPaymentLabel(getDisplayPaymentStatus(order))}
            </span>
          </td>
          <td>{formatPrice(getOrderPrice(order))}</td>
          <td>
            <div className="d-flex gap-2">
              <button onClick={() => setViewingOrder(order)} className="btn btn-light">Xem</button>
              {order.paymentStatus === 'REFUNDED' ? (
                <div className="text-success" style={{ padding: '6px 12px', fontWeight: 'bold' }}>
                  Đã hoàn: {formatPrice((order as any).refundAmount || 0)}
                </div>
              ) : (
                <button
                  onClick={() => setRefundState({ order, errorDate: new Date().toISOString().split('T')[0], amount: computeRefundAmount(order, new Date().toISOString().split('T')[0]) })}
                  className="btn btn-warning"
                >
                  Tính tiền hoàn
                </button>
              )}
              <button onClick={() => handleEdit(order)} className="btn btn-secondary">Sửa</button>
              {new Date(order.expiryDate) < new Date() && !isSlotReturned(order) && (
                <button onClick={() => handleReturnSlot(order.id)} className="btn btn-danger" title="Trả slot về kho (không xóa đơn)">Trả slot về kho</button>
              )}
            </div>
          </td>
        </tr>
      );
    });
  }, [customerMap, packageMap, productMap]);

  const OrderMobileCard: React.FC<{ order: Order }> = React.useMemo(() => {
    return React.memo(function Card({ order }: { order: Order }) {
      return (
        <div className="order-card">
          <div className="order-card-header">
            <div className="d-flex align-items-center gap-2">
              <div className="order-card-title">{order.code}</div>
            </div>
            <div className="order-card-subtitle">{formatDate(order.purchaseDate)}</div>
          </div>

          <div className="order-card-row">
            <div className="order-card-label">Khách</div>
            <div className="order-card-value">{getCustomerName(order.customerId)}</div>
          </div>
          <div className="order-card-row">
            <div className="order-card-label">Sản phẩm</div>
            <div className="order-card-value">{getPackageInfo(order.packageId)?.product?.name || '-'}</div>
          </div>
          <div className="order-card-row">
            <div className="order-card-label">Gói</div>
            <div className="order-card-value">{getPackageInfo(order.packageId)?.package.name || '-'}</div>
          </div>
          <div className="order-card-row">
            <div className="order-card-label">Hết hạn</div>
            <div className="order-card-value">{formatDate(order.expiryDate)}</div>
          </div>
          <div className="order-card-row">
            <div className="order-card-label">Trạng thái</div>
            <div className="order-card-value">
              <span className={`status-badge ${getStatusClass(order.status)}`}>{getStatusLabel(order.status)}</span>
            </div>
          </div>
          <div className="order-card-row">
            <div className="order-card-label">Thanh toán</div>
            <div className="order-card-value">
              <span className={`status-badge ${getPaymentClass(getDisplayPaymentStatus(order))}`}>{getPaymentLabel(getDisplayPaymentStatus(order))}</span>
            </div>
          </div>
          <div className="order-card-row">
            <div className="order-card-label">Giá</div>
            <div className="order-card-value">{formatPrice(getOrderPrice(order))}</div>
          </div>

          <div className="order-card-actions">
            <button onClick={() => setViewingOrder(order)} className="btn btn-light">Xem</button>
            {order.paymentStatus === 'REFUNDED' ? (
              <div className="text-success" style={{ padding: '6px 12px', fontWeight: 'bold' }}>
                Đã hoàn: {formatPrice((order as any).refundAmount || 0)}
              </div>
            ) : (
              <button
                onClick={() => setRefundState({ order, errorDate: new Date().toISOString().split('T')[0], amount: computeRefundAmount(order, new Date().toISOString().split('T')[0]) })}
                className="btn btn-warning"
              >
                Tính tiền hoàn
              </button>
            )}
            <button onClick={() => handleEdit(order)} className="btn btn-secondary">Sửa</button>
            {new Date(order.expiryDate) < new Date() && !isSlotReturned(order) && (
              <button onClick={() => handleReturnSlot(order.id)} className="btn btn-danger" title="Trả slot về kho (không xóa đơn)">Trả slot</button>
            )}
          </div>
        </div>
      );
    });
  }, [customerMap, packageMap, productMap]);

  const renderMobileItem = React.useCallback(({ index, style }: ListChildComponentProps) => {
    const order = filteredOrders[index];
    if (!order) return null;
    return (
      <div style={{ ...style, padding: '0 4px 12px' }}>
        <OrderMobileCard order={order} />
      </div>
    );
  }, [filteredOrders, OrderMobileCard]);

  const resetFilters = () => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setFilterStatus('');
    setFilterPayment('');
    setFilterProduct('');
    setFilterPackage('');
    setDateFrom('');
    setDateTo('');
    setExpiryFilter('');
    setSlotReturnedFilter('');
    setOnlyExpiringNotSent(false);
    setPage(1);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="d-flex justify-content-between align-items-center">
          <h2 className="card-title">Danh sách đơn hàng</h2>
          <div className="d-flex gap-2">
            {(() => {
              const stuckCount = stuckInventoryLinks.length;
              if (stuckCount > 0) {
                return (
                  <button
                    className="btn btn-warning"
                    onClick={handleFixAllStuckInventoryLinks}
                    title={`Fix ${stuckCount} đơn hàng có liên kết kho hàng lỗi`}
                  >
                    Fix liên kết kho lỗi ({stuckCount})
                  </button>
                );
              }
              return null;
            })()}
            {expiryMismatchOrders.length > 0 && (
              <button
                className="btn btn-warning"
                onClick={handleFixOrderExpiryMismatches}
                title="Khôi phục hạn đơn dựa trên lịch sử gia hạn mới nhất"
              >
                🔧 Fix hạn đơn ({expiryMismatchOrders.length})
              </button>
            )}
            <div className="text-right">
              <div>Tổng doanh thu: {formatPrice(totalRevenue)}</div>
              <small className="text-muted">({totalOrderCount} đơn đã bán)</small>
            </div>
            {!isMobile && (
              <>
                <button className="btn btn-light" onClick={() => {
                  const filename = generateExportFilename('DonHang', {
                    debouncedSearchTerm,
                    filterStatus,
                    filterPayment,
                    dateFrom,
                    dateTo,
                    expiryFilter,
                    onlyExpiringNotSent
                  }, 'KetQuaLoc');
                  exportOrdersXlsx(filteredOrders, filename);
                }}>Xuất Excel (kết quả đã lọc)</button>
              </>
            )}
            {selectedIds.length > 0 && !isMobile && (
              <div className="d-flex gap-2 align-items-center">
                <span className="badge bg-primary">Đã chọn: {selectedIds.length}</span>
                <span className="badge bg-info">Tổng tiền: {formatPrice(getSelectedTotal)}</span>
                <button
                  className="btn btn-info"
                  onClick={() => {
                    const selectedExistingIds = selectedIds.filter(id => orders.some(o => o.id === id));
                    if (selectedExistingIds.length === 0) return;
                    setSelectedOrderPaymentStatus('UNPAID');
                    setOrderBulkPaymentTarget('INITIAL');
                    setSelectedOrderRenewalIds([]);
                    setOrderPaymentModal({ selectedIds: selectedExistingIds });
                  }}
                >
                  Cập nhật thanh toán
                </button>
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
              value={filterProduct}
              onChange={(e) => {
                const newProductId = e.target.value;
                setFilterProduct(newProductId);
                // Clear package filter only if current package doesn't belong to the new product
                if (newProductId && filterPackage) {
                  const currentPackage = packageMap.get(filterPackage);
                  if (currentPackage) {
                    const currentProduct = productMap.get(currentPackage.productId);
                    if (!currentProduct || currentProduct.id !== newProductId) {
                      setFilterPackage('');
                    }
                  }
                }
              }}
            >
              <option value="">Tất cả sản phẩm</option>
              {availableProducts.map(product => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select
              className="form-control"
              value={filterPackage}
              onChange={(e) => {
                const newPackageId = e.target.value;
                setFilterPackage(newPackageId);
                // Clear product filter only if current product doesn't have the new package
                if (newPackageId && filterProduct) {
                  const newPackage = packageMap.get(newPackageId);
                  if (newPackage) {
                    const newPackageProduct = productMap.get(newPackage.productId);
                    if (!newPackageProduct || newPackageProduct.id !== filterProduct) {
                      setFilterProduct('');
                    }
                  }
                }
              }}
            >
              <option value="">Tất cả gói</option>
              {availablePackages.map(pkg => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name}
                </option>
              ))}
            </select>
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
          <div style={{ gridColumn: 'span 2' }}>
            <DateRangeInput
              label="Khoảng ngày mua"
              from={dateFrom}
              to={dateTo}
              onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
            />
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
              value={onlyExpiringNotSent ? 'NOT_SENT' : ''}
              onChange={(e) => setOnlyExpiringNotSent(e.target.value === 'NOT_SENT')}
            >
              <option value="">Tất cả gửi gia hạn</option>
              <option value="NOT_SENT">Chưa gửi gia hạn</option>
            </select>
          </div>
          <div>
            <select
              className="form-control"
              value={slotReturnedFilter}
              onChange={(e) => setSlotReturnedFilter(e.target.value as 'NOT_RETURNED' | '')}
            >
              <option value="">Tất cả slot</option>
              <option value="NOT_RETURNED">Chưa trả slot về kho</option>
            </select>
          </div>
          <div>
            <button className="btn btn-light w-100" onClick={resetFilters}>Reset bộ lọc</button>
          </div>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="text-center py-4">
          <p>Không có đơn hàng nào</p>
        </div>
      ) : isMobile ? (
        <div className="orders-mobile">
          <FixedSizeList
            className="orders-mobile-list"
            height={mobileListHeight}
            itemCount={filteredOrders.length}
            itemSize={MOBILE_CARD_HEIGHT}
            width="100%"
          >
            {renderMobileItem}
          </FixedSizeList>
        </div>
      ) : (
        <div className="table-responsive orders-table">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36, minWidth: 36, maxWidth: 36 }}>
                  <input
                    type="checkbox"
                    checked={paginatedOrders.length > 0 && paginatedOrders.every(o => selectedIds.includes(o.id))}
                    onChange={(e) => handleToggleSelectAll(e.target.checked, paginatedOrders.map(o => o.id))}
                  />
                </th>
                <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Mã đơn hàng</th>
                <th style={{ width: '80px', minWidth: '80px', maxWidth: '100px' }}>Ngày mua</th>
                <th style={{ width: '120px', minWidth: '120px', maxWidth: '150px' }}>Khách hàng</th>
                <th style={{ width: '120px', minWidth: '120px', maxWidth: '150px' }}>Sản phẩm</th>
                <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Gói</th>
                <th style={{ width: '80px', minWidth: '80px', maxWidth: '100px' }}>Ngày hết hạn</th>
                <th style={{ width: '90px', minWidth: '90px', maxWidth: '110px' }}>Trạng thái</th>
                <th style={{ width: '90px', minWidth: '90px', maxWidth: '110px' }}>Thanh toán</th>
                <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Giá</th>
                <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Thao tác</th>
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

      {!isMobile && (
        <div className="d-flex justify-content-between align-items-center mt-3">
          <div>
            <select
              className="form-control"
              style={{ width: 100 }}
              value={limit}
              onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
          <div className="d-flex align-items-center gap-2">
            <button className="btn btn-light" disabled={currentPage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>«</button>
            <span>Trang {currentPage} / {totalPages}</span>
            <button className="btn btn-light" disabled={currentPage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>»</button>
          </div>
          <div>
            <span className="text-muted">Tổng: {total}</span>
          </div>
        </div>
      )}

      {showForm && (
        <OrderForm
          key={editingOrder?.id || 'new'}
          order={editingOrder}
          onClose={() => {
            setShowForm(false);
            setEditingOrder(null);
          }}
          onSuccess={handleFormSubmit}
        />
      )}

      {viewingOrder && (
        <OrderDetailsModal
          order={viewingOrder}
          onClose={() => setViewingOrder(null)}
          inventory={inventory}
          products={products}
          packages={packages}
          getCustomerName={getCustomerName}
          getCustomerCode={(id: string) => customers.find(c => c.id === id)?.code || ''}
          getPackageInfo={getPackageInfo}
          getStatusLabel={getStatusLabel}
          getPaymentLabel={getPaymentLabel}
          formatDate={formatDate}
          formatPrice={formatPrice}
          getOrderPrice={getOrderPrice}
          onOpenRenew={() => {
            setRenewState({
              order: viewingOrder,
              packageId: viewingOrder.packageId,
              useCustomPrice: false,
              customPrice: 0,
              note: '',
              // Mặc định lần gia hạn luôn là chưa thanh toán
              paymentStatus: 'UNPAID',
              markMessageSent: !!(viewingOrder as any).renewalMessageSent,
              useCustomExpiry: false,
              customExpiryDate: undefined
            });
          }}
          onCopyInfo={async () => {
            const o = viewingOrder;
            const customerName = getCustomerName(o.customerId);
            const pkgInfo = getPackageInfo(o.packageId);
            const productName = pkgInfo?.product?.name || 'Không xác định';
            const packageName = pkgInfo?.package?.name || 'Không xác định';
            const statusLabel = getStatusLabel(o.status);
            // Trạng thái thanh toán hiển thị: ưu tiên lần gia hạn mới nhất / các renewal
            const paymentLabel = getPaymentLabel(getDisplayPaymentStatus(o)) || 'Chưa thanh toán';
            const purchaseDate = new Date(o.purchaseDate).toLocaleDateString('vi-VN');
            // Hạn dùng hiển thị: lấy hạn mới nhất từ renewals (nếu có), ngược lại dùng expiryDate của order
            const rawRenewals = Array.isArray((o as any).renewals) ? ((o as any).renewals || []) : [];
            const latestRenewal = rawRenewals.length > 0
              ? rawRenewals.slice().sort(
                (a: any, b: any) =>
                  +new Date(b.createdAt || b.newExpiryDate || b.new_expiry_date) -
                  +new Date(a.createdAt || a.newExpiryDate || a.new_expiry_date)
              )[0]
              : null;
            const finalExpiryDate = latestRenewal && (latestRenewal.newExpiryDate || latestRenewal.new_expiry_date)
              ? new Date(latestRenewal.newExpiryDate || latestRenewal.new_expiry_date)
              : new Date(o.expiryDate);
            const expiryDate = finalExpiryDate.toLocaleDateString('vi-VN');
            // Giá hiển thị:
            // - Nếu có gia hạn, ưu tiên giá của lần gia hạn mới nhất.
            // - Với dữ liệu cũ bị swap (chỉ có 1 lần gia hạn), nếu price của renewal khác với giá đơn hàng hiện tại
            //   thì coi giá đơn hàng hiện tại là giá của lần gia hạn (ví dụ DH0238: renewal.price=310k, orderPrice=160k).
            const hasRenewals = rawRenewals.length > 0;
            const currentOrderPrice = getOrderPrice(o);
            let price: number;
            if (latestRenewal && typeof latestRenewal.price === 'number') {
              price = latestRenewal.price;
              if (hasRenewals && rawRenewals.length === 1 &&
                typeof currentOrderPrice === 'number' && currentOrderPrice > 0 &&
                price !== currentOrderPrice) {
                price = currentOrderPrice;
              }
            } else {
              price = currentOrderPrice;
            }
            const out: string[] = [];
            out.push(`${o.code || '-'} | ${customerName}`);
            out.push('');
            out.push(`${productName} | ${packageName}`);
            out.push('');
            out.push(`📅 ${purchaseDate} → ${expiryDate}`);
            out.push('');
            out.push(`💰 ${formatPrice(price)} | ${paymentLabel} | ${statusLabel}`);
            const inv = (() => {
              if (o.inventoryItemId) {
                const found = inventory.find((i: any) => i.id === o.inventoryItemId);
                if (found) return found;
              }
              const byLinked = inventory.find((i: any) => i.linked_order_id === o.id);
              if (byLinked) return byLinked;
              return inventory.find((i: any) => i.is_account_based && (i.profiles || []).some((p: any) => p.assignedOrderId === o.id));
            })();
            if (inv) {
              const accountColumns = getOrderAccountColumns(o.packageId, inv);
              const displayColumns = filterVisibleAccountColumns(accountColumns);
              if (displayColumns.length > 0) {
                out.push('');
                displayColumns.forEach((col: any) => {
                  const value = (inv.accountData || inv.account_data || {})[col.id] || '';
                  if (String(value).trim()) {
                    out.push(`${col.title}: ${value}`);
                  }
                });
              }
            }
            const customFieldValues = (o as any).customFieldValues || {};
            if (pkgInfo?.package?.customFields && Object.keys(customFieldValues).length > 0) {
              out.push('');
              pkgInfo.package.customFields.forEach((cf: any) => {
                const value = customFieldValues[cf.id];
                if (value && String(value).trim()) {
                  out.push(`${cf.title}: ${String(value).trim()}`);
                }
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
          onOrderUpdated={async () => {
            await loadData();
          }}
        />
      )}

      {orderPaymentModal && (() => {
        const selectedItems = orders.filter(o => orderPaymentModal.selectedIds.includes(o.id));
        const renewalOptions = selectedItems.flatMap(order => {
          const renewals = (renewalsByOrder.get(order.id) || []).slice().sort(
            (a: any, b: any) => +new Date(b.createdAt || b.newExpiryDate || b.new_expiry_date) - +new Date(a.createdAt || a.newExpiryDate || a.new_expiry_date)
          );
          return renewals.map((renewal: any, idx: number) => ({
            id: renewal.id || `${order.id}-${idx}`,
            orderId: order.id,
            code: order.code || order.id.slice(-6),
            months: renewal.months,
            createdAt: renewal.createdAt,
            previousExpiryDate: renewal.previousExpiryDate || renewal.previous_expiry_date,
            newExpiryDate: renewal.newExpiryDate || renewal.new_expiry_date,
            paymentStatus: renewal.paymentStatus || 'UNPAID',
            indexLabel: `Gia hạn #${renewals.length - idx}`
          }));
        });
        const renewalDisabled = renewalOptions.length === 0;
        const handleToggleRenewal = (id: string, checked: boolean) => {
          setSelectedOrderRenewalIds(prev => {
            if (checked) {
              if (prev.includes(id)) return prev;
              return [...prev, id];
            }
            return prev.filter(rid => rid !== id);
          });
        };
        const canConfirm =
          orderBulkPaymentTarget === 'INITIAL' ||
          (orderBulkPaymentTarget === 'RENEWAL' && selectedOrderRenewalIds.length > 0);

        return (
          <div className="modal" role="dialog" aria-modal>
            <div className="modal-content" style={{ maxWidth: 520 }}>
              <div className="modal-header">
                <h3 className="modal-title">Cập nhật trạng thái thanh toán đơn</h3>
                <button className="close" onClick={() => setOrderPaymentModal(null)}>×</button>
              </div>
              <div className="mb-3">
                <div className="mb-3">
                  <strong>Đã chọn {selectedItems.length} đơn hàng:</strong>
                  <ul style={{ paddingLeft: '18px', marginTop: '6px' }}>
                    {selectedItems.map(order => (
                      <li key={order.id}>{order.code || order.id.slice(-6)}</li>
                    ))}
                  </ul>
                </div>
                <div className="form-group">
                  <label className="form-label">Trạng thái thanh toán mới</label>
                  <select
                    className="form-control"
                    value={selectedOrderPaymentStatus}
                    onChange={e => setSelectedOrderPaymentStatus(e.target.value as PaymentStatus)}
                  >
                    <option value="UNPAID">{getPaymentLabel('UNPAID')}</option>
                    <option value="PAID">{getPaymentLabel('PAID')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Áp dụng cho</label>
                  <div className="d-flex flex-column gap-2">
                    <label className="d-flex align-items-center gap-2">
                      <input
                        type="radio"
                        name="orderBulkPaymentTarget"
                        value="INITIAL"
                        checked={orderBulkPaymentTarget === 'INITIAL'}
                        onChange={() => {
                          setOrderBulkPaymentTarget('INITIAL');
                          setSelectedOrderRenewalIds([]);
                        }}
                      />
                      <span>Lần mua ban đầu</span>
                    </label>
                    <label className="d-flex align-items-center gap-2">
                      <input
                        type="radio"
                        name="orderBulkPaymentTarget"
                        value="RENEWAL"
                        disabled={renewalDisabled}
                        checked={orderBulkPaymentTarget === 'RENEWAL'}
                        onChange={() => {
                          setOrderBulkPaymentTarget('RENEWAL');
                          setSelectedOrderRenewalIds(renewalOptions.map(option => option.id));
                        }}
                      />
                      <span>Các lần gia hạn{renewalDisabled ? ' (Không có dữ liệu)' : ''}</span>
                    </label>
                  </div>
                </div>
                {orderBulkPaymentTarget === 'RENEWAL' && !renewalDisabled && (
                  <div className="form-group">
                    <label className="form-label">Chọn lần gia hạn</label>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <div className="text-muted small">
                        Đã chọn {selectedOrderRenewalIds.length}/{renewalOptions.length}
                      </div>
                      <div className="d-flex gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-light"
                          onClick={() =>
                            setSelectedOrderRenewalIds(renewalOptions.map(option => option.id))
                          }
                        >
                          Chọn tất
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-light"
                          onClick={() => setSelectedOrderRenewalIds([])}
                        >
                          Bỏ chọn
                        </button>
                      </div>
                    </div>
                    <div
                      style={{
                        maxHeight: 220,
                        overflowY: 'auto',
                        border: '1px solid var(--border-color)',
                        borderRadius: 4,
                        padding: '8px'
                      }}
                    >
                      {renewalOptions.map(option => (
                        <label
                          key={option.id}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            marginBottom: 8
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedOrderRenewalIds.includes(option.id)}
                            onChange={e => handleToggleRenewal(option.id, e.target.checked)}
                          />
                          <div>
                            <div>
                              <strong>{option.code}</strong> · {option.indexLabel}
                            </div>
                            <div className="text-muted small">
                              {option.createdAt
                                ? formatDate(option.createdAt)
                                : ''}
                              {typeof option.months === 'number' &&
                                !Number.isNaN(option.months) &&
                                ` · +${option.months} tháng`}
                            </div>
                            {(option.previousExpiryDate || option.newExpiryDate) && (
                              <div className="text-muted small">
                                {option.previousExpiryDate
                                  ? formatDate(
                                    option.previousExpiryDate instanceof Date
                                      ? option.previousExpiryDate
                                      : new Date(option.previousExpiryDate)
                                  )
                                  : ''}
                                {' → '}
                                {option.newExpiryDate
                                  ? formatDate(
                                    option.newExpiryDate instanceof Date
                                      ? option.newExpiryDate
                                      : new Date(option.newExpiryDate)
                                  )
                                  : ''}
                              </div>
                            )}
                            <div className="text-muted small">
                              Hiện tại:{' '}
                              {getPaymentLabel(
                                (option.paymentStatus as PaymentStatus) || 'UNPAID'
                              ) || 'Chưa thanh toán'}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="d-flex justify-content-end gap-2">
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setOrderPaymentModal(null);
                    setSelectedOrderRenewalIds([]);
                    setOrderBulkPaymentTarget('INITIAL');
                  }}
                >
                  Hủy
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!canConfirm}
                  onClick={async () => {
                    const sb = getSupabase();
                    if (!sb) {
                      notify('Không thể cập nhật trạng thái thanh toán', 'error');
                      return;
                    }

                    if (orderBulkPaymentTarget === 'INITIAL') {
                      const validIds = orderPaymentModal.selectedIds.filter(id =>
                        orders.some(o => o.id === id)
                      );
                      if (validIds.length === 0) {
                        notify('Không tìm thấy đơn hàng hợp lệ', 'error');
                        return;
                      }

                      const { error } = await sb
                        .from('orders')
                        .update({ payment_status: selectedOrderPaymentStatus })
                        .in('id', validIds);

                      if (error) {
                        notify('Không thể cập nhật trạng thái thanh toán', 'error');
                        return;
                      }

                      try {
                        const sb2 = getSupabase();
                        if (sb2) {
                          const codes = validIds
                            .map(id => orders.find(o => o.id === id)?.code)
                            .filter(Boolean)
                            .join(',');
                          await sb2.from('activity_logs').insert({
                            employee_id: state.user?.id || null,
                            action: 'Cập nhật thanh toán đơn hàng loạt (mua ban đầu)',
                            details: `count=${validIds.length}; status=${selectedOrderPaymentStatus}; codes=${codes}`
                          });
                        }
                      } catch { }

                      setSelectedIds([]);
                      setOrderPaymentModal(null);
                      setSelectedOrderRenewalIds([]);
                      setOrderBulkPaymentTarget('INITIAL');
                      // Cập nhật state để hiển thị ngay (bảng + modal xem đơn)
                      validIds.forEach(id => applyOrderPaymentPatch(id, { paymentStatus: selectedOrderPaymentStatus }));
                      await loadData();
                      // Đảm bảo loadData không ghi đè trạng thái mới
                      validIds.forEach(id => applyOrderPaymentPatch(id, { paymentStatus: selectedOrderPaymentStatus }));
                      notify(
                        `Đã cập nhật trạng thái thanh toán cho ${validIds.length} đơn hàng`,
                        'success'
                      );
                      return;
                    }

                    if (selectedOrderRenewalIds.length === 0) {
                      notify('Vui lòng chọn ít nhất 1 lần gia hạn', 'warning');
                      return;
                    }

                    const renewalIdSet = new Set(selectedOrderRenewalIds);
                    const ordersToUpdate = selectedItems
                      .map(order => {
                        const renewals = (renewalsByOrder.get(order.id) || []).slice();
                        let changed = false;
                        const nextRenewals = renewals.map((r: any) => {
                          const rid = r.id || '';
                          if (renewalIdSet.has(rid)) {
                            changed = true;
                            return {
                              ...r,
                              paymentStatus: selectedOrderPaymentStatus
                            };
                          }
                          return r;
                        });
                        if (!changed) return null;
                        return { order, renewals: nextRenewals };
                      })
                      .filter(Boolean) as { order: Order; renewals: any[] }[];

                    if (ordersToUpdate.length === 0) {
                      notify('Không tìm thấy lần gia hạn hợp lệ để cập nhật', 'warning');
                      return;
                    }

                    try {
                      for (const item of ordersToUpdate) {
                        const serializedRenewals = item.renewals.map((r: any) => ({
                          id: r.id,
                          months: r.months,
                          packageId: r.packageId,
                          previousPackageId: r.previousPackageId,
                          price: r.price,
                          useCustomPrice: r.useCustomPrice,
                          previousExpiryDate: r.previousExpiryDate,
                          newExpiryDate: r.newExpiryDate,
                          note: r.note,
                          paymentStatus: r.paymentStatus,
                          createdAt: r.createdAt,
                          createdBy: r.createdBy
                        }));

                        const { error } = await sb
                          .from('orders')
                          .update({ renewals: serializedRenewals })
                          .eq('id', item.order.id);

                        if (error) {
                          notify(
                            `Không thể cập nhật thanh toán gia hạn cho đơn ${item.order.code ||
                            item.order.id}`,
                            'error'
                          );
                          return;
                        }
                      }

                      try {
                        const sb2 = getSupabase();
                        if (sb2) {
                          await sb2.from('activity_logs').insert({
                            employee_id: state.user?.id || null,
                            action: 'Cập nhật thanh toán gia hạn đơn hàng loạt',
                            details: `renewalCount=${selectedOrderRenewalIds.length}; status=${selectedOrderPaymentStatus}`
                          });
                        }
                      } catch { }

                      setOrderPaymentModal(null);
                      setSelectedOrderRenewalIds([]);
                      setOrderBulkPaymentTarget('INITIAL');
                      // Cập nhật state renewals & modal đang xem để không cần refresh
                      setOrders(prev => prev.map(o => {
                        const target = ordersToUpdate.find(x => x.order.id === o.id);
                        if (!target) return o;
                        return { ...o, renewals: target.renewals } as any;
                      }));
                      setViewingOrder(prev => {
                        if (!prev) return prev;
                        const target = ordersToUpdate.find(x => x.order.id === prev.id);
                        if (!target) return prev;
                        return { ...prev, renewals: target.renewals } as any;
                      });
                      await loadData();
                      // Đảm bảo loadData không ghi đè trạng thái mới
                      setOrders(prev => prev.map(o => {
                        const target = ordersToUpdate.find(x => x.order.id === o.id);
                        if (!target) return o;
                        return { ...o, renewals: target.renewals } as any;
                      }));
                      setViewingOrder(prev => {
                        if (!prev) return prev;
                        const target = ordersToUpdate.find(x => x.order.id === prev.id);
                        if (!target) return prev;
                        return { ...prev, renewals: target.renewals } as any;
                      });
                      notify(
                        `Đã cập nhật trạng thái thanh toán cho ${selectedOrderRenewalIds.length} lần gia hạn`,
                        'success'
                      );
                    } catch {
                      notify('Không thể cập nhật thanh toán gia hạn', 'error');
                    }
                  }}
                >
                  Xác nhận
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
                const base = currentExpiry;
                const pkg = getPackageInfo(renewState.packageId)?.package;
                const months = Math.max(1, pkg?.warrantyPeriod || 1);
                const preview = (() => {
                  if (renewState.useCustomExpiry && renewState.customExpiryDate) {
                    return new Date(renewState.customExpiryDate);
                  }
                  const d = new Date(base);
                  d.setMonth(d.getMonth() + months);
                  return d;
                })();
                const customer = customers.find(c => c.id === o.customerId);
                const defaultPrice = customer?.type === 'CTV' ? (pkg?.ctvPrice || 0) : (pkg?.retailPrice || 0);
                const price = renewState.useCustomPrice ? (renewState.customPrice || 0) : defaultPrice;
                return (
                  <div className="p-2">
                    <div><strong>Mã đơn:</strong> {o.code}</div>
                    {(() => {
                      const c = customers.find(cu => cu.id === o.customerId);
                      if (!c) return null;
                      return renderCustomerFullInfo(c);
                    })()}
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
                          .slice()
                          .sort((a, b) => {
                            const wa = Number(a.warrantyPeriod || 0);
                            const wb = Number(b.warrantyPeriod || 0);
                            if (wa !== wb) return wa - wb;
                            return (a.name || '').localeCompare(b.name || '');
                          })
                          .map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                      </select>
                    </div>
                    <div className="form-group mt-2">
                      <div className="d-flex align-items-center gap-2">
                        <input
                          type="checkbox"
                          id="renewUseCustomExpiry"
                          checked={renewState.useCustomExpiry}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            if (checked) {
                              // Calculate default custom expiry date
                              const currentExpiry = new Date(o.expiryDate);
                              const base = currentExpiry > new Date() ? currentExpiry : new Date();
                              const pkg = getPackageInfo(renewState.packageId)?.package;
                              const months = Math.max(1, pkg?.warrantyPeriod || 1);
                              const d = new Date(base);
                              d.setMonth(d.getMonth() + months);
                              setRenewState(prev => prev ? { ...prev, useCustomExpiry: checked, customExpiryDate: prev.customExpiryDate || d } : prev);
                            } else {
                              setRenewState(prev => prev ? { ...prev, useCustomExpiry: checked, customExpiryDate: undefined } : prev);
                            }
                          }}
                        />
                        <label htmlFor="renewUseCustomExpiry" className="mb-0">Hạn tùy chỉnh</label>
                      </div>
                      {renewState.useCustomExpiry && (
                        <div className="mt-2">
                          <input
                            type="date"
                            className="form-control"
                            value={renewState.customExpiryDate instanceof Date && !isNaN(renewState.customExpiryDate.getTime())
                              ? renewState.customExpiryDate.toISOString().split('T')[0]
                              : ''}
                            onChange={(e) => {
                              setRenewState(prev => prev ? { ...prev, customExpiryDate: e.target.value ? new Date(e.target.value) : undefined } : prev);
                            }}
                          />
                        </div>
                      )}
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
                        {PAYMENT_STATUSES
                          .filter(p => p.value !== 'REFUNDED')
                          .map(p => (
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
                    <div className="mt-2">
                      <div className="d-flex align-items-center gap-2">
                        <input
                          type="checkbox"
                          id="renewMarkMessageSent"
                          checked={renewState.markMessageSent}
                          onChange={async (e) => {
                            const checked = e.target.checked;
                            setRenewState(prev => prev ? { ...prev, markMessageSent: checked } : prev);

                            // Update immediately in Supabase
                            const sb = getSupabase();
                            if (sb) {
                              const nowIso = new Date().toISOString();
                              if (checked) {
                                // Mark as sent
                                await sb.from('orders').update({
                                  renewal_message_sent: true,
                                  renewal_message_sent_at: nowIso,
                                  renewal_message_sent_by: state.user?.id || null
                                }).eq('id', renewState.order.id);

                                // Update local state
                                setOrders(prev => prev.map(o => o.id === renewState.order.id ? { ...o, renewalMessageSent: true, renewalMessageSentAt: new Date(), renewalMessageSentBy: state.user?.id || 'system' } : o));
                              } else {
                                // Unmark as sent
                                await sb.from('orders').update({
                                  renewal_message_sent: false,
                                  renewal_message_sent_at: null,
                                  renewal_message_sent_by: null
                                }).eq('id', renewState.order.id);

                                // Update local state
                                setOrders(prev => prev.map(o => o.id === renewState.order.id ? { ...o, renewalMessageSent: false, renewalMessageSentAt: undefined, renewalMessageSentBy: undefined } : o));
                              }
                            } else {
                              // Fallback to local database
                              try {
                                if (checked) {
                                  Database.updateOrder(renewState.order.id, { renewalMessageSent: true, renewalMessageSentAt: new Date(), renewalMessageSentBy: state.user?.id || 'system' } as any);
                                } else {
                                  Database.updateOrder(renewState.order.id, { renewalMessageSent: false, renewalMessageSentAt: undefined, renewalMessageSentBy: undefined } as any);
                                }
                              } catch { }
                            }

                            // Reload data to update table
                            await loadData();
                          }}
                        />
                        <label htmlFor="renewMarkMessageSent" className="mb-0">Đã gửi tin nhắn gia hạn</label>
                      </div>
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
                  lines.push('QR: https://prnt.sc/XkJoGtSeaVFw');
                  lines.push('');
                  // Detailed current order info
                  lines.push('Thông tin chi tiết đơn hàng hiện tại:');
                  lines.push(`- Mã đơn hàng: ${o.code || '-'}`);
                  lines.push(`- Khách hàng: ${getCustomerName(o.customerId)}`);
                  lines.push(`- Sản phẩm: ${productName}`);
                  lines.push(`- Gói: ${packageName}`);
                  lines.push(`- Ngày mua: ${new Date(o.purchaseDate).toLocaleDateString('vi-VN')}`);
                  lines.push(`- Ngày hết hạn: ${new Date(o.expiryDate).toLocaleDateString('vi-VN')}`);

                  // Append filtered warehouse fields under a header
                  {
                    const inv = (() => {
                      if (o.inventoryItemId) {
                        const found = inventory.find((i: any) => i.id === o.inventoryItemId);
                        if (found) return found;
                      }
                      const byLinked = inventory.find((i: any) => i.linked_order_id === o.id);
                      if (byLinked) return byLinked;
                      return inventory.find((i: any) => i.is_account_based && (i.profiles || []).some((p: any) => p.assignedOrderId === o.id));
                    })();

                    if (inv) {
                      const accountColumns = getOrderAccountColumns(o.packageId, inv);
                      const displayColumns = filterVisibleAccountColumns(accountColumns);

                      if (displayColumns.length > 0) {
                        lines.push('- Thông tin đơn hàng:');
                        displayColumns.forEach((col: any) => {
                          const value = (inv.accountData || {})[col.id] || '';
                          if (value.trim()) {
                            lines.push(`${col.title}:`);
                            lines.push(value);
                            lines.push(''); // Add empty line between fields
                          }
                        });
                      }
                    }
                  }

                  // Add custom fields if they exist
                  const customFieldValues = (o as any).customFieldValues || {};
                  if (pkgInfo?.package?.customFields && Object.keys(customFieldValues).length > 0) {
                    pkgInfo.package.customFields.forEach((cf: any) => {
                      const value = customFieldValues[cf.id];
                      if (value && String(value).trim()) {
                        lines.push(`- ${cf.title}:`);
                        lines.push(String(value).trim());
                        lines.push(''); // Add empty line between fields
                      }
                    });
                  }
                  lines.push('');
                  lines.push('Giá gia hạn:');
                  const sameProductPackages = packages
                    .filter(p => p.productId === (product?.id || ''))
                    .slice()
                    .sort((a, b) => {
                      const wa = Number(a.warrantyPeriod || 0);
                      const wb = Number(b.warrantyPeriod || 0);
                      if (wa !== wb) return wa - wb;
                      return (a.name || '').localeCompare(b.name || '');
                    });
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
                  const sb = getSupabase();
                  if (!sb) {
                    notify('Không thể kết nối đến database', 'error');
                    return;
                  }

                  try {
                    // Lấy thông tin package và customer từ state đã có
                    const pkg = getPackageInfo(renewState.packageId)?.package;
                    const customer = customers.find(c => c.id === o.customerId);

                    if (!pkg) {
                      notify('Không tìm thấy thông tin gói sản phẩm', 'error');
                      return;
                    }

                    // Tính toán hạn mới
                    const base = new Date(o.expiryDate);
                    const safeMonths = Math.max(1, Math.floor(pkg.warrantyPeriod || 1));
                    const nextExpiry = renewState.useCustomExpiry && renewState.customExpiryDate
                      ? new Date(renewState.customExpiryDate)
                      : (() => {
                        const d = new Date(base);
                        d.setMonth(d.getMonth() + safeMonths);
                        return d;
                      })();

                    // Tính giá
                    const defaultPrice = customer?.type === 'CTV' ? (pkg.ctvPrice || 0) : (pkg.retailPrice || 0);
                    const useCustomPrice = !!renewState.useCustomPrice && (renewState.customPrice || 0) > 0;
                    const nextCustomPrice = useCustomPrice ? Math.max(0, Number(renewState.customPrice || 0)) : undefined;
                    const renewalPrice = useCustomPrice && typeof nextCustomPrice === 'number' && nextCustomPrice > 0
                      ? nextCustomPrice
                      : defaultPrice;

                    // Tạo renewal record mới
                    const renewal = {
                      id: (Date.now().toString(36) + Math.random().toString(36).substr(2)),
                      months: safeMonths,
                      packageId: renewState.packageId,
                      previousPackageId: o.packageId,
                      price: renewalPrice,
                      useCustomPrice: useCustomPrice,
                      previousExpiryDate: new Date(o.expiryDate).toISOString(),
                      newExpiryDate: nextExpiry.toISOString(),
                      note: renewState.note,
                      paymentStatus: renewState.paymentStatus,
                      createdAt: new Date().toISOString(),
                      createdBy: state.user?.id || 'system'
                    };

                    // Lấy renewals hiện tại từ order
                    const existingRenewals = ((o as any).renewals || []).map((r: any) => ({
                      id: r.id,
                      months: r.months,
                      packageId: r.packageId,
                      previousPackageId: r.previousPackageId,
                      price: r.price,
                      useCustomPrice: r.useCustomPrice,
                      previousExpiryDate: r.previousExpiryDate,
                      newExpiryDate: r.newExpiryDate,
                      note: r.note,
                      paymentStatus: r.paymentStatus,
                      createdAt: r.createdAt,
                      createdBy: r.createdBy
                    }));

                    const newRenewals = [...existingRenewals, renewal];

                    // Cập nhật trực tiếp vào Supabase
                    const { error } = await sb.from('orders').update({
                      expiry_date: nextExpiry.toISOString(),
                      package_id: renewState.packageId,
                      renewals: newRenewals,
                      use_custom_price: useCustomPrice,
                      custom_price: nextCustomPrice || 0,
                      // Reset renewal message flags
                      renewal_message_sent: false,
                      renewal_message_sent_at: null,
                      renewal_message_sent_by: null,
                      updated_at: new Date().toISOString()
                    }).eq('id', o.id);

                    if (error) {
                      console.error('Renewal error:', error);
                      notify('Không thể gia hạn đơn hàng: ' + (error.message || 'Lỗi không xác định'), 'error');
                      return;
                    }

                    // Cập nhật expiry cho profile nếu là account-based inventory
                    try {
                      if (o.inventoryItemId) {
                        const invRes = await sb.from('inventory').select('*').eq('id', o.inventoryItemId).maybeSingle();
                        if (invRes.data?.is_account_based && invRes.data?.profiles) {
                          const profiles = invRes.data.profiles.map((p: any) => {
                            if (p.assignedOrderId === o.id) {
                              return { ...p, expiryAt: nextExpiry.toISOString() };
                            }
                            return p;
                          });
                          await sb.from('inventory').update({ profiles }).eq('id', o.inventoryItemId);
                        }
                      }
                    } catch (invErr) {
                      console.warn('Could not update inventory profile expiry:', invErr);
                    }

                    // Log activity
                    try {
                      await sb.from('activity_logs').insert({
                        employee_id: state.user?.id || null,
                        action: 'Gia hạn đơn hàng',
                        details: `orderId=${o.id}; orderCode=${o.code}; packageId=${renewState.packageId}; paymentStatus=${renewState.paymentStatus}; price=${useCustomPrice ? renewState.customPrice : 'DEFAULT'}`
                      });
                    } catch { }

                    // Tạo updated order object cho local state
                    const updated = {
                      ...o,
                      expiryDate: nextExpiry,
                      packageId: renewState.packageId,
                      renewals: newRenewals,
                      useCustomPrice,
                      customPrice: nextCustomPrice,
                      renewalMessageSent: false,
                      renewalMessageSentAt: undefined,
                      renewalMessageSentBy: undefined,
                      updatedAt: new Date()
                    };

                    setRenewState(null);
                    setViewingOrder(updated as any);
                    loadData();
                    notify('Gia hạn đơn hàng thành công', 'success');
                  } catch (err: any) {
                    console.error('Renewal error:', err);
                    notify('Không thể gia hạn đơn hàng: ' + (err?.message || 'Lỗi không xác định'), 'error');
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
                const refundAmount = refundState.useCustomAmount && refundState.customAmount !== undefined ? refundState.customAmount : refundState.amount;
                const cycle = getApplicableCycle(o, refundState.errorDate);
                const cycleStartLabel = cycle.cycleStart.toLocaleDateString('vi-VN');
                const cycleEndLabel = cycle.cycleEnd.toLocaleDateString('vi-VN');
                return (
                  <div className="p-2">
                    <div><strong>Tên đơn:</strong> {o.code}</div>
                    <div><strong>Sản phẩm:</strong> {productName}</div>
                    <div><strong>Gói:</strong> {packageName}</div>
                    <div><strong>Giá mua:</strong> {formatPrice(price)}</div>
                    <div><strong>Người mua:</strong> {customerName}</div>
                    {cycle.isFromRenewal ? (
                      <div><strong>Ngày mua (chu kỳ):</strong> {cycleStartLabel}</div>
                    ) : (
                      <div><strong>Ngày mua:</strong> {purchaseDate}</div>
                    )}
                    <div><strong>Khoảng tính:</strong> {cycleStartLabel} - {cycleEndLabel}</div>
                    <div><strong>Ngày lỗi:</strong> {errorDate}</div>
                    <div><strong>Số tiền hoàn:</strong> {formatPrice(refundAmount)}</div>
                    {(() => {
                      const inv = (() => {
                        if (o.inventoryItemId) {
                          const found = inventory.find((i: any) => i.id === o.inventoryItemId);
                          if (found) return found;
                        }
                        const byLinked = inventory.find((i: any) => i.linked_order_id === o.id);
                        if (byLinked) return byLinked;
                        return inventory.find((i: any) => i.is_account_based && (i.profiles || []).some((p: any) => p.assignedOrderId === o.id));
                      })();

                      if (!inv) return null;

                      const accountColumns = getOrderAccountColumns(o.packageId, inv);
                      const columns = Array.isArray(accountColumns) ? accountColumns : [];

                      if (columns.length === 0) return null;

                      return (
                        <div style={{ marginTop: '8px' }}>
                          <strong>Thông tin đơn hàng:</strong>
                          <div style={{ marginTop: '4px' }}>
                            {columns.map((col: any) => {
                              const value = (inv.accountData || {})[col.id] || '';
                              if (!value.trim()) return null;
                              return (
                                <div key={col.id} style={{ marginBottom: '8px' }}>
                                  <div><strong>{col.title}:</strong></div>
                                  <div style={{ marginTop: '2px', whiteSpace: 'pre-wrap' }}>{value}</div>
                                </div>
                              );
                            })}
                          </div>
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
                  <div className="alert alert-success mb-0">{formatPrice(refundState.useCustomAmount && refundState.customAmount !== undefined ? refundState.customAmount : refundState.amount)}</div>
                </div>
              </div>
              <div className="mt-3">
                <div className="form-check mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="useCustomRefund"
                    checked={refundState.useCustomAmount || false}
                    onChange={(e) => {
                      setRefundState(prev => prev ? {
                        ...prev,
                        useCustomAmount: e.target.checked,
                        customAmount: e.target.checked ? (prev.customAmount || prev.amount) : undefined
                      } : prev);
                    }}
                  />
                  <label className="form-check-label" htmlFor="useCustomRefund">
                    Nhập tiền hoàn tùy chỉnh
                  </label>
                </div>
                {refundState.useCustomAmount && (
                  <div>
                    <label className="form-label">Số tiền hoàn tùy chỉnh</label>
                    <input
                      type="number"
                      className="form-control"
                      value={refundState.customAmount ?? refundState.amount}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value) || 0;
                        setRefundState(prev => prev ? { ...prev, customAmount: value } : prev);
                      }}
                      min="0"
                      step="1000"
                    />
                  </div>
                )}
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
                    `Số tiền hoàn: ${formatPrice(refundState.useCustomAmount && refundState.customAmount !== undefined ? refundState.customAmount : refundState.amount)}`
                  ];

                  // Get filtered warehouse fields for copy
                  const inv = (() => {
                    if (o.inventoryItemId) {
                      const found = inventory.find((i: any) => i.id === o.inventoryItemId);
                      if (found) return found;
                    }
                    const byLinked = inventory.find((i: any) => i.linked_order_id === o.id);
                    if (byLinked) return byLinked;
                    return inventory.find((i: any) => i.is_account_based && (i.profiles || []).some((p: any) => p.assignedOrderId === o.id));
                  })();

                  if (inv) {
                    const accountColumns = getOrderAccountColumns(o.packageId, inv);
                    const displayColumns = filterVisibleAccountColumns(accountColumns);

                    if (displayColumns.length > 0) {
                      baseLines.push('', 'Thông tin đơn hàng:');
                      displayColumns.forEach((col: any) => {
                        const value = (inv.accountData || {})[col.id] || '';
                        if (value.trim()) {
                          baseLines.push(`${col.title}:`);
                          baseLines.push(value);
                          baseLines.push(''); // Add empty line between fields
                        }
                      });
                    }
                  }

                  // Add custom fields if they exist
                  const customFieldValues = (o as any).customFieldValues || {};
                  if (pkgInfo?.package?.customFields && Object.keys(customFieldValues).length > 0) {
                    pkgInfo.package.customFields.forEach((cf: any) => {
                      const value = customFieldValues[cf.id];
                      if (value && String(value).trim()) {
                        baseLines.push(`${cf.title}:`);
                        baseLines.push(String(value).trim());
                        baseLines.push(''); // Add empty line between fields
                      }
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
                  const nowIso = new Date().toISOString();
                  const finalAmount = refundState.useCustomAmount && refundState.customAmount !== undefined ? refundState.customAmount : refundState.amount;
                  const updated = Database.updateOrder(o.id, { paymentStatus: 'REFUNDED', status: 'CANCELLED', refundAmount: finalAmount, refundAt: nowIso } as any);
                  try {
                    const sb2 = getSupabase();
                    if (sb2) {
                      await sb2.from('orders').update({
                        payment_status: 'REFUNDED',
                        status: 'CANCELLED',
                        refund_amount: finalAmount,
                        refund_at: nowIso
                      }).eq('id', o.id);
                      await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Hoàn tiền đơn hàng', details: `orderId=${o.id}; orderCode=${o.code}; errorDate=${refundState.errorDate}; refundAmount=${finalAmount}` });
                    }
                  } catch { }
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
          <div className="modal-content" style={{ maxWidth: 800 }}>
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

              {/* Thông tin kho hàng */}
              {(() => {
                const invItem = inventory.find((i: any) => i.id === returnConfirmState.inventoryId);
                if (!invItem) return null;
                const productId = invItem.productId || invItem.product_id;
                const packageId = invItem.packageId || invItem.package_id;
                const product = productMap.get(productId) || products.find(p => p.id === productId);
                const pkg = packageMap.get(packageId) || packages.find(p => p.id === packageId);
                const isSharedPool = product?.sharedInventoryPool;
                const packageName = pkg?.name || (isSharedPool ? 'Kho chung' : 'Không có gói');
                const purchaseDate = invItem.purchaseDate || invItem.purchase_date;
                const expiryDate = invItem.expiryDate || invItem.expiry_date;

                return (
                  <div className="card mb-3">
                    <div className="card-header">
                      <h6 className="mb-0">Thông tin kho hàng</h6>
                    </div>
                    <div className="card-body">
                      <div><strong>Sản phẩm:</strong> {product?.name || productId || 'Không xác định'}</div>
                      <div><strong>Gói/Pool:</strong> {packageName}</div>
                      <div><strong>Nhập:</strong> {purchaseDate ? new Date(purchaseDate).toLocaleDateString('vi-VN') : 'N/A'}</div>
                      <div><strong>Hết hạn:</strong> {expiryDate ? new Date(expiryDate).toLocaleDateString('vi-VN') : 'N/A'}</div>
                      <div><strong>Nguồn:</strong> {invItem.sourceNote || '-'}</div>
                      <div><strong>Giá mua:</strong> {typeof invItem.purchasePrice === 'number' ? `${invItem.purchasePrice.toLocaleString('vi-VN')} ${invItem.currency || 'VND'}` : '-'}</div>
                      <div><strong>Thanh toán:</strong> {invItem.paymentStatus === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán'}</div>
                      {invItem.status === 'NEEDS_UPDATE' && invItem.previousLinkedOrderId && (() => {
                        const prevOrder = orders.find(o => o.id === invItem.previousLinkedOrderId);
                        return prevOrder ? (
                          <div style={{ marginTop: 6, padding: '8px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
                            <strong>Đơn hàng trước khi cần update:</strong> {prevOrder.code}
                          </div>
                        ) : null;
                      })()}
                      {invItem.productInfo && <div style={{ marginTop: 6 }}><strong>Thông tin sản phẩm:</strong><pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{invItem.productInfo}</pre></div>}
                      <div style={{ marginTop: 6 }}>
                        <strong>Ghi chú nội bộ:</strong>
                        {invItem.notes ? (
                          <pre style={{
                            whiteSpace: 'pre-wrap',
                            margin: '4px 0 0 0',
                            padding: '8px',
                            backgroundColor: 'var(--bg-tertiary)',
                            color: 'var(--text-primary)',
                            borderRadius: '4px',
                            fontSize: '14px',
                            border: '1px solid var(--border-color)'
                          }}>
                            {invItem.notes}
                          </pre>
                        ) : (
                          <span className="text-muted" style={{ marginLeft: 4 }}>Không có</span>
                        )}
                      </div>

                      {/* Account Information Section */}
                      {invItem.isAccountBased && invItem.accountColumns && invItem.accountColumns.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <strong>Thông tin tài khoản:</strong> <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>(Bấm vào để copy)</span>
                          <div style={{ marginTop: 6 }}>
                            {invItem.accountColumns.map((col: any) => {
                              const value = (invItem.accountData || {})[col.id] || '';
                              if (!value) return null;
                              return (
                                <div key={col.id} style={{ marginBottom: 8 }}>
                                  <div><strong>{col.title}:</strong></div>
                                  <pre
                                    style={{
                                      whiteSpace: 'pre-wrap',
                                      margin: 0,
                                      padding: '8px',
                                      backgroundColor: 'var(--bg-tertiary)',
                                      color: 'var(--text-primary)',
                                      borderRadius: '4px',
                                      fontSize: '14px',
                                      border: '1px solid var(--border-color)',
                                      cursor: 'pointer',
                                      transition: 'background-color 0.2s'
                                    }}
                                    onClick={() => {
                                      navigator.clipboard.writeText(value).then(() => {
                                        notify(`Đã copy ${col.title}`, 'success');
                                      }).catch(() => {
                                        notify('Không thể copy', 'error');
                                      });
                                    }}
                                    onMouseEnter={(e) => {
                                      (e.target as HTMLPreElement).style.backgroundColor = 'var(--bg-hover)';
                                    }}
                                    onMouseLeave={(e) => {
                                      (e.target as HTMLPreElement).style.backgroundColor = 'var(--bg-tertiary)';
                                    }}
                                    title={`Bấm để copy ${col.title}`}
                                  >
                                    {value}
                                  </pre>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Slot totals removed as requested */}

                      {/* Custom Fields from Order */}
                      {(() => {
                        const order = orders.find(o => o.id === returnConfirmState.order.id);
                        if (!order) return null;

                        const packageInfo = packageMap.get(order.packageId);
                        const customFieldValues = (order as any).customFieldValues || {};

                        if (!packageInfo?.customFields || packageInfo.customFields.length === 0) return null;

                        return (
                          <div style={{ marginTop: 12 }}>
                            <strong>Trường tùy chỉnh đơn hàng:</strong> <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>(Bấm vào để copy)</span>
                            <div style={{ marginTop: 6 }}>
                              {packageInfo.customFields.map((cf: any) => {
                                const value = customFieldValues[cf.id];
                                if (!value) return null;
                                return (
                                  <div key={cf.id} style={{ marginBottom: 8 }}>
                                    <div><strong>{cf.title}:</strong></div>
                                    <pre
                                      style={{
                                        whiteSpace: 'pre-wrap',
                                        margin: 0,
                                        padding: '8px',
                                        backgroundColor: 'var(--bg-tertiary)',
                                        color: 'var(--text-primary)',
                                        borderRadius: '4px',
                                        fontSize: '14px',
                                        border: '1px solid var(--border-color)',
                                        cursor: 'pointer',
                                        transition: 'background-color 0.2s'
                                      }}
                                      onClick={() => {
                                        navigator.clipboard.writeText(String(value).trim()).then(() => {
                                          notify(`Đã copy ${cf.title}`, 'success');
                                        }).catch(() => {
                                          notify('Không thể copy', 'error');
                                        });
                                      }}
                                      onMouseEnter={(e) => {
                                        (e.target as HTMLPreElement).style.backgroundColor = 'var(--bg-hover)';
                                      }}
                                      onMouseLeave={(e) => {
                                        (e.target as HTMLPreElement).style.backgroundColor = 'var(--bg-tertiary)';
                                      }}
                                      title={`Bấm để copy ${cf.title}`}
                                    >
                                      {value}
                                    </pre>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })()}

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

                  const sb = getSupabase();
                  if (!sb) {
                    notify('Không thể kết nối database', 'error');
                    return;
                  }

                  try {
                    const invItem = inventory.find((i: any) => i.id === inventoryId);
                    if (!invItem) {
                      notify('Không tìm thấy kho hàng', 'error');
                      return;
                    }

                    // Release inventory using direct Supabase query with error handling (same as OrderForm)
                    let inventoryUpdateSuccess = false;
                    if (invItem.is_account_based || (Array.isArray(invItem.profiles) && invItem.profiles.length > 0)) {
                      // Release account-based slots or slot-based inventory
                      const profiles = invItem.profiles || [];
                      const orderProfileIds = (order as any).inventory_profile_ids || [];

                      // Release all profiles assigned to this order (by assignedOrderId or by profile ID in inventory_profile_ids)
                      const updatedProfiles = profiles.map((profile: any) => {
                        const isAssignedToOrder = profile.assignedOrderId === order.id;
                        const isInOrderProfileIds = Array.isArray(orderProfileIds) && orderProfileIds.includes(profile.id);

                        if (isAssignedToOrder || isInOrderProfileIds) {
                          return {
                            ...profile,
                            isAssigned: false,
                            assignedOrderId: null,
                            assignedAt: null,
                            expiryAt: null
                          };
                        }
                        return profile;
                      });

                      // Check if there are any free slots remaining
                      const hasFreeSlots = updatedProfiles.some((p: any) =>
                        !p.isAssigned && !(p as any).needsUpdate
                      );

                      const { error: updateError } = await sb.from('inventory').update({
                        profiles: updatedProfiles,
                        status: hasFreeSlots ? 'AVAILABLE' : 'SOLD',
                        updated_at: new Date().toISOString()
                      }).eq('id', inventoryId);

                      if (updateError) {
                        notify('Lỗi khi giải phóng slot kho hàng', 'error');
                        console.error('Inventory update error:', updateError);
                        // Still try to clear order link even if inventory update fails
                      } else {
                        inventoryUpdateSuccess = true;
                      }
                    } else {
                      // Release classic inventory
                      const { error: updateError } = await sb.from('inventory').update({
                        status: 'AVAILABLE',
                        linked_order_id: null,
                        updated_at: new Date().toISOString()
                      }).eq('id', inventoryId);

                      if (updateError) {
                        notify('Lỗi khi giải phóng kho hàng', 'error');
                        console.error('Inventory update error:', updateError);
                        // Still try to clear order link even if inventory update fails
                      } else {
                        inventoryUpdateSuccess = true;
                      }
                    }

                    // Always clear order's inventory link, even if inventory update had errors
                    const { error: orderUpdateError } = await sb.from('orders').update({
                      inventory_item_id: null,
                      inventory_profile_ids: null
                    }).eq('id', order.id);

                    if (orderUpdateError) {
                      notify('Lỗi khi cập nhật đơn hàng', 'error');
                      console.error('Order update error:', orderUpdateError);
                      return;
                    }

                    if (!inventoryUpdateSuccess) {
                      notify('Đã xóa liên kết đơn hàng nhưng có lỗi khi cập nhật kho hàng', 'warning');
                    }

                    // Log activity
                    try {
                      await sb.from('activity_logs').insert({
                        employee_id: null,
                        action: mode === 'RETURN_ONLY' ? 'Trả slot về kho' : 'Xác nhận xóa slot & trả về kho',
                        details: `orderId=${order.id}; inventoryId=${inventoryId}`
                      });
                    } catch { }

                    if (mode === 'RETURN_ONLY') {
                      setReturnConfirmState(null);
                      loadData();
                      notify('Đã trả slot về kho', 'success');
                      return;
                    }

                    // DELETE_AND_RETURN mode: also delete the order
                    const { error: deleteError } = await sb.from('orders').delete().eq('id', order.id);
                    if (deleteError) {
                      notify('Không thể xóa đơn hàng', 'error');
                      return;
                    }

                    try {
                      await sb.from('activity_logs').insert({
                        employee_id: null,
                        action: 'Xóa đơn hàng',
                        details: `orderId=${order.id}; orderCode=${order.code}`
                      });
                    } catch { }

                    setReturnConfirmState(null);
                    loadData();
                    notify('Đã trả slot về kho và xóa đơn', 'success');
                  } catch (error) {
                    notify('Lỗi khi xử lý', 'error');
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
