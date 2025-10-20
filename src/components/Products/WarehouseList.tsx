import React, { useEffect, useMemo, useState } from 'react';
import { InventoryItem, Product, ProductPackage, Order, Customer, OrderStatus, ORDER_STATUSES, PaymentStatus, PAYMENT_STATUSES, InventoryPaymentStatus, INVENTORY_PAYMENT_STATUSES } from '../../types';
import { Database } from '../../utils/database';
import WarehouseForm from './WarehouseForm';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { exportToXlsx, generateExportFilename } from '../../utils/excel';
import DateRangeInput from '../Shared/DateRangeInput';
import { getSupabase } from '../../utils/supabaseClient';
import OrderDetailsModal from '../Orders/OrderDetailsModal';

const WarehouseList: React.FC = () => {
  const { state } = useAuth();
  const { notify } = useToast();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [filterProduct, setFilterProduct] = useState<string>('');
  const [filterPackage, setFilterPackage] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [confirmState, setConfirmState] = useState<null | { message: string; onConfirm: () => void }>(null);
  const [renewalDialog, setRenewalDialog] = useState<null | { id: string; months: number; amount: number; note: string }>(null);
  const [viewingInventory, setViewingInventory] = useState<null | InventoryItem>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [profilesModal, setProfilesModal] = useState<null | { item: InventoryItem }>(null);
  const [viewingOrder, setViewingOrder] = useState<null | Order>(null);
  const [onlyAccounts, setOnlyAccounts] = useState(false);
  const [onlyFreeSlots, setOnlyFreeSlots] = useState(false);
  const [hasStuckSlots, setHasStuckSlots] = useState(false);
  const [paymentStatusModal, setPaymentStatusModal] = useState<null | { selectedIds: string[] }>(null);
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<InventoryPaymentStatus>('UNPAID');

  const fixOrphanedSlots = async () => {
    const sb = getSupabase();
    if (!sb) return notify('Không thể kết nối database', 'error');
    
    setConfirmState({
      message: 'Tìm và fix các slot kho hàng bị kẹt (slot thường và account-based)?',
      onConfirm: async () => {
        try {
          let fixedCount = 0;
          const fixedDetails: string[] = [];
          
          // 1. Fix regular slots: SOLD but no linked_order_id
          const { data: orphanedSlots, error: fetchError } = await sb
            .from('inventory')
            .select('id, code, status, linked_order_id')
            .eq('status', 'SOLD')
            .is('linked_order_id', null);
          
          if (fetchError) {
            console.error('Error fetching orphaned slots:', fetchError);
            notify('Lỗi khi tìm slot bị kẹt', 'error');
            return;
          }
          
          if (orphanedSlots && orphanedSlots.length > 0) {
            const slotIds = orphanedSlots.map(slot => slot.id);
            const { error: updateError } = await sb
              .from('inventory')
              .update({ status: 'AVAILABLE', linked_order_id: null })
              .in('id', slotIds);
            
            if (updateError) {
              console.error('Error fixing orphaned slots:', updateError);
              notify('Lỗi khi fix slot thường bị kẹt', 'error');
            } else {
              fixedCount += orphanedSlots.length;
              fixedDetails.push(`${orphanedSlots.length} slot thường`);
            }
          }
          
          // 2. Fix account-based slots: profiles with assignedOrderId pointing to non-existent orders
          const { data: orders, error: ordersError } = await sb
            .from('orders')
            .select('id');
          
          if (ordersError) {
            console.error('Error fetching orders:', ordersError);
            notify('Lỗi khi kiểm tra đơn hàng', 'error');
            return;
          }
          
          const existingOrderIds = new Set((orders || []).map(o => o.id));
          
          const { data: accountBasedItems, error: accountError } = await sb
            .from('inventory')
            .select('id, code, profiles')
            .eq('is_account_based', true);
          
          if (accountError) {
            console.error('Error fetching account-based items:', accountError);
            notify('Lỗi khi tìm account-based slot bị kẹt', 'error');
            return;
          }
          
          let accountFixedCount = 0;
          if (accountBasedItems) {
            for (const item of accountBasedItems) {
              const profiles = Array.isArray(item.profiles) ? item.profiles : [];
              const stuckProfiles = profiles.filter((p: any) => 
                p.assignedOrderId && !existingOrderIds.has(p.assignedOrderId)
              );
              
              if (stuckProfiles.length > 0) {
                const nextProfiles = profiles.map((p: any) => (
                  p.assignedOrderId && !existingOrderIds.has(p.assignedOrderId)
                    ? { ...p, isAssigned: false, assignedOrderId: null, assignedAt: null, expiryAt: null }
                    : p
                ));
                
                const { error: updateError } = await sb
                  .from('inventory')
                  .update({ profiles: nextProfiles })
                  .eq('id', item.id);
                
                if (!updateError) {
                  accountFixedCount += stuckProfiles.length;
                }
              }
            }
          }
          
          if (accountFixedCount > 0) {
            fixedCount += accountFixedCount;
            fixedDetails.push(`${accountFixedCount} profile account-based`);
          }
          
          if (fixedCount === 0) {
            notify('Không tìm thấy slot nào bị kẹt', 'info');
            return;
          }
          
          // 3. Log hoạt động
          try {
            const sb2 = getSupabase();
            if (sb2) await sb2.from('activity_logs').insert({ 
              employee_id: state.user?.id || 'system', 
              action: 'Fix slot bị kẹt', 
              details: `Fixed ${fixedCount} slots: ${fixedDetails.join(', ')}` 
            });
          } catch {}
          
          notify(`Đã fix ${fixedCount} slot bị kẹt (${fixedDetails.join(', ')})`, 'success');
          refresh();
          
        } catch (error) {
          console.error('Unexpected error fixing orphaned slots:', error);
          notify('Lỗi không mong muốn khi fix slot', 'error');
        }
      }
    });
  };

  const releaseStuckProfiles = async (inventoryId: string) => {
    const sb = getSupabase();
    if (!sb) { notify('Không thể giải phóng slot kẹt', 'error'); return; }
    try {
      const { data: inv } = await sb.from('inventory').select('*').eq('id', inventoryId).single();
      if (!inv || !inv.is_account_based) return;
      const profiles = Array.isArray(inv.profiles) ? inv.profiles : [];
      const assignedIds: string[] = profiles.filter((p: any) => p.assignedOrderId).map((p: any) => p.assignedOrderId);
      if (assignedIds.length === 0) return;
      const { data: existing } = await sb.from('orders').select('id').in('id', assignedIds);
      const existingSet = new Set((existing || []).map((r: any) => r.id));
      const nextProfiles = profiles.map((p: any) => (
        p.assignedOrderId && !existingSet.has(p.assignedOrderId)
          ? { ...p, isAssigned: false, assignedOrderId: null, assignedAt: null, expiryAt: null }
          : p
      ));
      // Only update if changed
      const changed = JSON.stringify(nextProfiles) !== JSON.stringify(profiles);
      if (changed) {
        await sb.from('inventory').update({ profiles: nextProfiles }).eq('id', inventoryId);
        try {
          const sb2 = getSupabase();
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Giải phóng slot kẹt', details: `inventoryId=${inventoryId}` });
        } catch {}
        notify('Đã quét và giải phóng slot kẹt', 'success');
        refresh();
      } else {
        notify('Không phát hiện slot kẹt', 'info');
      }
    } catch {
      notify('Không thể quét slot kẹt', 'error');
    }
  };

  const releaseSingleProfile = async (inventoryId: string, profileId: string) => {
    const sb = getSupabase();
    if (!sb) { notify('Không thể giải phóng slot', 'error'); return; }
    try {
      const { data: inv } = await sb.from('inventory').select('*').eq('id', inventoryId).single();
      if (!inv || !inv.is_account_based) return;
      const profiles = Array.isArray(inv.profiles) ? inv.profiles : [];
      const nextProfiles = profiles.map((p: any) => (
        p.id === profileId ? { ...p, isAssigned: false, assignedOrderId: null, assignedAt: null, expiryAt: null } : p
      ));
      await sb.from('inventory').update({ profiles: nextProfiles }).eq('id', inventoryId);
      notify('Đã giải phóng slot', 'success');
      refresh();
    } catch {
      notify('Không thể giải phóng slot', 'error');
    }
  };

  const clearProfileNeedsUpdate = async (inventoryId: string, profileId: string) => {
    const sb = getSupabase();
    if (!sb) { notify('Không thể cập nhật slot', 'error'); return; }
    try {
      const { data: inv } = await sb.from('inventory').select('*').eq('id', inventoryId).single();
      if (!inv || !inv.is_account_based) return;
      const profiles = Array.isArray(inv.profiles) ? inv.profiles : [];
      const nextProfiles = profiles.map((p: any) => (
        p.id === profileId ? { ...p, needsUpdate: false } : p
      ));
      const anyNeedsUpdate = nextProfiles.some((p: any) => !!p.needsUpdate);
      const anyAssigned = nextProfiles.some((p: any) => !!p.isAssigned);
      const nextStatus = (!anyNeedsUpdate && !anyAssigned && inv.status === 'NEEDS_UPDATE') ? 'AVAILABLE' : undefined;
      if (nextStatus) {
        await sb.from('inventory').update({ profiles: nextProfiles, status: nextStatus }).eq('id', inventoryId);
      } else {
        await sb.from('inventory').update({ profiles: nextProfiles }).eq('id', inventoryId);
      }
      notify('Đã đánh dấu slot đã update', 'success');
      refresh();
    } catch {
      notify('Không thể cập nhật slot', 'error');
    }
  };

  const checkForStuckSlots = async () => {
    const sb = getSupabase();
    if (!sb) return;
    
    try {
      // 1. Check regular slots: SOLD but no linked_order_id
      const { data: orphanedSlots, error: fetchError } = await sb
        .from('inventory')
        .select('id, code, status, linked_order_id')
        .eq('status', 'SOLD')
        .is('linked_order_id', null);
      
      if (fetchError) {
        console.error('Error checking orphaned slots:', fetchError);
        return;
      }
      
      // 2. Check account-based slots: profiles with assignedOrderId pointing to non-existent orders
      const { data: accountBasedItems, error: accountError } = await sb
        .from('inventory')
        .select('id, code, profiles')
        .eq('is_account_based', true);
      
      if (accountError) {
        console.error('Error checking account-based items:', accountError);
        return;
      }
      
      // Get all existing order IDs
      const { data: orders, error: ordersError } = await sb
        .from('orders')
        .select('id');
      
      if (ordersError) {
        console.error('Error fetching orders:', ordersError);
        return;
      }
      
      const existingOrderIds = new Set((orders || []).map(o => o.id));
      
      // Check for stuck account-based profiles
      let hasStuckAccountProfiles = false;
      if (accountBasedItems) {
        for (const item of accountBasedItems) {
          const profiles = Array.isArray(item.profiles) ? item.profiles : [];
          const stuckProfiles = profiles.filter((p: any) => 
            p.assignedOrderId && !existingOrderIds.has(p.assignedOrderId)
          );
          if (stuckProfiles.length > 0) {
            hasStuckAccountProfiles = true;
            break;
          }
        }
      }
      
      // Set hasStuckSlots based on findings
      const hasRegularStuckSlots = orphanedSlots && orphanedSlots.length > 0;
      setHasStuckSlots(hasRegularStuckSlots || hasStuckAccountProfiles);
      
    } catch (error) {
      console.error('Error checking for stuck slots:', error);
    }
  };

  const refresh = async () => {
    const sb = getSupabase();
    if (!sb) return;
    // Optional sweep on client for local display of expired flags is no longer needed
    const [invRes, prodRes, pkgRes, custRes] = await Promise.all([
      sb.from('inventory').select('*').order('created_at', { ascending: true }),
      sb.from('products').select('*').order('created_at', { ascending: true }),
      sb.from('packages').select('*').order('created_at', { ascending: true }),
      sb.from('customers').select('*').order('created_at', { ascending: true })
    ]);

    // Auto-update inventory status based on expiry_date
    try {
      const now = new Date();
      const raw = Array.isArray(invRes.data) ? invRes.data : [];

      const toExpireIds: string[] = [];
      const toUnexpireIds: string[] = [];

      for (const r of raw) {
        const expiry = r.expiry_date ? new Date(r.expiry_date) : null;
        const isExpiredNow = !!expiry && expiry < now;
        const isSold = r.status === 'SOLD';
        const isExpiredStatus = r.status === 'EXPIRED';

        // Determine if account-based item currently has any assigned profiles
        const hasAssignedProfiles = !!r.is_account_based && Array.isArray(r.profiles)
          ? r.profiles.some((p: any) => !!p.isAssigned)
          : false;

        // Mark to EXPIRED when past due and not SOLD
        if (isExpiredNow && !isSold && !isExpiredStatus) {
          toExpireIds.push(r.id);
        }

        // Revert EXPIRED -> AVAILABLE if renewed and no active assignment
        if (!isExpiredNow && isExpiredStatus && !isSold && !r.linked_order_id && !hasAssignedProfiles) {
          toUnexpireIds.push(r.id);
        }
      }

      if (toExpireIds.length > 0) {
        await sb.from('inventory').update({ status: 'EXPIRED' }).in('id', toExpireIds);
      }
      if (toUnexpireIds.length > 0) {
        await sb.from('inventory').update({ status: 'AVAILABLE' }).in('id', toUnexpireIds);
      }
    } catch (e) {
      // Best-effort; ignore failures and continue rendering
      console.error('Auto-expire sweep failed', e);
    }
    const inv = (invRes.data || []).map((r: any) => {
      const purchaseDate = r.purchase_date ? new Date(r.purchase_date) : new Date();
      let expiryDate = r.expiry_date ? new Date(r.expiry_date) : null;
      
      // If no expiry date, calculate based on product type
      if (!expiryDate) {
        const product = (prodRes.data || []).find((p: any) => p.id === r.product_id);
        if (product?.shared_inventory_pool) {
          // Shared pool products: 1 month default
          expiryDate = new Date(purchaseDate);
          expiryDate.setMonth(expiryDate.getMonth() + 1);
        } else {
          // Regular products: use package warranty period
          const packageInfo = (pkgRes.data || []).find((p: any) => p.id === r.package_id);
          const warrantyPeriod = packageInfo?.warranty_period || 1;
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
      paymentStatus: r.payment_status || 'UNPAID',
      isAccountBased: !!r.is_account_based,
      accountColumns: r.account_columns || [],
      accountData: r.account_data || {},
      totalSlots: r.total_slots || 0,
      customWarrantyMonths: r.custom_warranty_months || undefined,
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
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
    };
    }) as InventoryItem[];
    
    const prods = (prodRes.data || []).map((r: any) => ({
      ...r,
      sharedInventoryPool: r.shared_inventory_pool || r.sharedInventoryPool,
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
    })) as Product[];
    
    const pkgs = (pkgRes.data || []).map((r: any) => ({
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
    })) as ProductPackage[];
    
    const custs = (custRes.data || []) as Customer[];
    setItems(inv);
    setProducts(prods);
    setPackages(pkgs);
    setCustomers(custs);
    
    // Check for stuck slots after data is loaded
    checkForStuckSlots();
  };

  useEffect(() => {
    refresh();
  }, []);

  // Realtime inventory subscribe
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const ch = sb
      .channel('realtime:inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        refresh();
      })
      .subscribe();
    return () => { try { ch.unsubscribe(); } catch {} };
  }, []);

  // Initialize from URL/localStorage
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      
      // Check if we have order-related params that shouldn't be in warehouse
      const orderParams = ['payment', 'expiry', 'onlyExpiringNotSent'];
      const hasOrderParams = Array.from(params.keys()).some(key => orderParams.includes(key));
      
      // Also check for order-specific status values
      const orderStatusValues = ['PROCESSING', 'COMPLETED', 'CANCELLED'];
      const hasOrderStatus = params.get('status') && orderStatusValues.includes(params.get('status')!);
      
      if (hasOrderParams || hasOrderStatus) {
        // Clear URL completely when coming from orders tab
        window.history.replaceState(null, '', window.location.pathname);
        // Reset all filters to default
        setSearchTerm('');
        setDebouncedSearchTerm('');
        setFilterProduct('');
        setFilterPackage('');
        setFilterStatus('');
        setFilterPaymentStatus('');
        setDateFrom('');
        setDateTo('');
        setOnlyAccounts(false);
        setOnlyFreeSlots(false);
        setPage(1);
        setLimit(parseInt(localStorage.getItem('warehouseList.limit') || '10', 10));
        return;
      }
      
      // Normal warehouse params initialization
      const q = params.get('q') || '';
      const prod = params.get('product') || '';
      const pkg = params.get('package') || '';
      const status = params.get('status') || '';
      const paymentStatus = params.get('paymentStatus') || '';
      const from = params.get('from') || '';
      const to = params.get('to') || '';
      const accounts = params.get('accounts') === '1';
      const free = params.get('free') === '1';
      const p = parseInt(params.get('page') || '1', 10);
      const l = parseInt((params.get('limit') || localStorage.getItem('warehouseList.limit') || '10'), 10);
      setSearchTerm(q);
      setDebouncedSearchTerm(q);
      setFilterProduct(prod);
      setFilterPackage(pkg);
      setFilterStatus(status);
      setFilterPaymentStatus(paymentStatus);
      setDateFrom(from);
      setDateTo(to);
      setOnlyAccounts(accounts);
      setOnlyFreeSlots(free);
      setPage(!Number.isNaN(p) && p > 0 ? p : 1);
      if (!Number.isNaN(l) && l > 0) setLimit(l);
    } catch {}
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Reset page on filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchTerm, filterProduct, filterPackage, filterStatus, filterPaymentStatus, dateFrom, dateTo, onlyAccounts, onlyFreeSlots]);

  // Persist limit
  useEffect(() => {
    try { localStorage.setItem('warehouseList.limit', String(limit)); } catch {}
  }, [limit]);

  // Sync URL
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (debouncedSearchTerm) params.set('q', debouncedSearchTerm); else params.delete('q');
      if (filterProduct) params.set('product', filterProduct); else params.delete('product');
      if (filterPackage) params.set('package', filterPackage); else params.delete('package');
      if (filterStatus) params.set('status', filterStatus); else params.delete('status');
      if (filterPaymentStatus) params.set('paymentStatus', filterPaymentStatus); else params.delete('paymentStatus');
      if (dateFrom) params.set('from', dateFrom); else params.delete('from');
      if (dateTo) params.set('to', dateTo); else params.delete('to');
      params.set('accounts', onlyAccounts ? '1' : '0');
      params.set('free', onlyFreeSlots ? '1' : '0');
      params.set('page', String(page));
      params.set('limit', String(limit));
      const s = params.toString();
      const url = `${window.location.pathname}${s ? `?${s}` : ''}`;
      window.history.replaceState(null, '', url);
    } catch {}
  }, [debouncedSearchTerm, filterProduct, filterPackage, filterStatus, filterPaymentStatus, dateFrom, dateTo, onlyAccounts, onlyFreeSlots, page, limit]);

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p.name])), [products]);
  const packageMap = useMemo(() => new Map(packages.map(p => [p.id, p.name])), [packages]);
  const customerMap = useMemo(() => new Map(customers.map(c => [c.id, c.name])), [customers]);

  const getPackageInfo = (packageId: string) => {
    const pkg = packages.find(p => p.id === packageId);
    const product = pkg ? products.find(pr => pr.id === pkg.productId) : undefined;
    return { pkg, product } as { pkg?: ProductPackage; product?: Product };
  };

  const formatDate = (date: Date) => new Date(date).toLocaleDateString('vi-VN');
  const formatPrice = (price: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);

  const getStatusLabel = (status: any) => {
    return ORDER_STATUSES.find(s => s.value === status)?.label || status;
  };

  const getPaymentLabel = (value: any) => {
    return PAYMENT_STATUSES.find(p => p.value === value)?.label || 'Chưa thanh toán';
  };

  const buildFullOrderInfo = (order: Order): { lines: string[]; text: string } => {
    let baseLines = String((order as any).orderInfo || '')
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    const pkg = getPackageInfo(order.packageId).pkg;
    const custom = ((order as any).customFieldValues || {}) as Record<string, string>;
    if (pkg && Array.isArray(pkg.customFields) && pkg.customFields.length) {
      pkg.customFields.forEach(cf => {
        const val = custom[cf.id];
        if (val !== undefined && String(val).trim()) {
          baseLines.push(`${cf.title}: ${val}`);
        }
      });
    }
    // Filter out internal-only info
    baseLines = baseLines.filter(line => {
      const normalized = line.toLowerCase();
      if (normalized.startsWith('slot:')) return false;
      return true;
    });
    const text = baseLines.join('\n');
    return { lines: baseLines, text };
  };

  const filteredItems = useMemo(() => {
    const norm = debouncedSearchTerm.trim().toLowerCase();
    return items.filter(i => {
      // Search in account data fields
      const accountDataMatches = !norm || (() => {
        if (!i.accountData || typeof i.accountData !== 'object') return false;
        return Object.values(i.accountData).some(value => 
          String(value || '').toLowerCase().includes(norm)
        );
      })();

      // Search in linked orders (classic linked_order_id and account-based profiles)
      const linkedOrderMatches = !norm || (() => {
        const orderIds: string[] = [];
        if (i.linkedOrderId) orderIds.push(i.linkedOrderId);
        const profiles = Array.isArray(i.profiles) ? i.profiles : [];
        profiles.forEach((p: any) => { if (p.assignedOrderId) orderIds.push(p.assignedOrderId); });
        const unique = Array.from(new Set(orderIds));
        if (unique.length === 0) return false;
        const allOrders = Database.getOrders();
        return unique.some(id => {
          const o = allOrders.find((x: any) => x.id === id);
          if (!o) return false;
          const customerNameLower = (customerMap.get(o.customerId) || '').toLowerCase();
          const pkgInfo = getPackageInfo(o.packageId);
          const productNameLower = (pkgInfo.product?.name || '').toLowerCase();
          const packageNameLower = (pkgInfo.pkg?.name || '').toLowerCase();
          const detailsLower = buildFullOrderInfo(o).text.toLowerCase();
          const notesLower = (o.notes ? String(o.notes) : '').toLowerCase();
          const orderInfoLower = (o as any).orderInfo ? String((o as any).orderInfo).toLowerCase() : '';
          return (
            (o.code || '').toLowerCase().includes(norm) ||
            customerNameLower.includes(norm) ||
            productNameLower.includes(norm) ||
            packageNameLower.includes(norm) ||
            detailsLower.includes(norm) ||
            notesLower.includes(norm) ||
            orderInfoLower.includes(norm)
          );
        });
      })();

      const matchesSearch = !norm ||
        (i.code || '').toLowerCase().includes(norm) ||
        (productMap.get(i.productId) || '').toLowerCase().includes(norm) ||
        (packageMap.get(i.packageId) || '').toLowerCase().includes(norm) ||
        (i.productInfo || '').toLowerCase().includes(norm) ||
        (i.sourceNote || '').toLowerCase().includes(norm) ||
        (i.notes || '').toLowerCase().includes(norm) ||
        accountDataMatches ||
        linkedOrderMatches;

      const matchesProduct = !filterProduct || i.productId === filterProduct;
      const matchesPackage = !filterPackage || i.packageId === filterPackage;
      const matchesStatus = !filterStatus || i.status === filterStatus as any;
      const matchesPaymentStatus = !filterPaymentStatus || i.paymentStatus === filterPaymentStatus as any;

      const pFromOk = !dateFrom || new Date(i.purchaseDate) >= new Date(dateFrom);
      const pToOk = !dateTo || new Date(i.purchaseDate) <= new Date(dateTo);

      const pkg = packages.find(p => p.id === i.packageId) as any;
      const isAcc = !!(i.isAccountBased || pkg?.isAccountBased);
      const hasFree = isAcc ? ((i.totalSlots || 0) - (i.profiles || []).filter(p => p.isAssigned).length) > 0 : false;
      const accountsOk = !onlyAccounts || isAcc;
      const freeOk = !onlyFreeSlots || hasFree;

      return matchesSearch && matchesProduct && matchesPackage && matchesStatus && matchesPaymentStatus && pFromOk && pToOk && accountsOk && freeOk;
    });
  }, [items, filterProduct, filterPackage, filterStatus, filterPaymentStatus, debouncedSearchTerm, dateFrom, dateTo, productMap, packageMap, onlyAccounts, onlyFreeSlots, packages]);

  const total = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;
  const sortedItems = filteredItems
    .slice()
    .sort((a, b) => {
      const getNum = (code?: string | null) => {
        if (!code) return Number.POSITIVE_INFINITY;
        const m = String(code).match(/\d+/);
        return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
      };
      const na = getNum(a.code as any);
      const nb = getNum(b.code as any);
      if (na !== nb) return na - nb;
      return (a.code || '').localeCompare(b.code || '');
    });
  const pageItems = sortedItems.slice(start, start + limit);

  const exportInventoryXlsx = (items: InventoryItem[], filename: string) => {
    const rows = items.map((i, idx) => {
      const prodName = productMap.get(i.productId) || i.productId;
      const pkg = packages.find(p => p.id === i.packageId) as any;
      const pool = (() => {
        const prod = products.find(p => p.id === i.productId);
        return prod?.sharedInventoryPool ? 'Pool chung' : (packageMap.get(i.packageId) || i.packageId);
      })();
      const isAcc = (i.isAccountBased || pkg?.isAccountBased);
      const used = (i.profiles || []).filter(p => p.isAssigned).length;
      const totalSlots = i.totalSlots || 0;
      return {
        code: i.code || `KHO${idx + 1}`,
        product: prodName,
        group: pool,
        purchaseDate: new Date(i.purchaseDate).toISOString().split('T')[0],
        expiryDate: new Date(i.expiryDate).toISOString().split('T')[0],
        warrantyMonths: (() => {
          const prod = products.find(p => p.id === i.productId);
          if (prod?.sharedInventoryPool) {
            return i.customWarrantyMonths ? `${i.customWarrantyMonths} tháng` : '-';
          }
          const pkg = packages.find(p => p.id === i.packageId);
          return pkg ? `${pkg.warrantyPeriod} tháng` : '-';
        })(),
        source: i.sourceNote || '',
        purchasePrice: typeof i.purchasePrice === 'number' ? i.purchasePrice : '',
        paymentStatus: i.paymentStatus || 'UNPAID',
        productInfo: i.productInfo || '',
        notes: i.notes || '',
        status: i.status,
        slots: isAcc ? `${used}/${totalSlots}` : '-'
      };
    });
    exportToXlsx(rows, [
      { header: 'Mã kho', key: 'code', width: 14 },
      { header: 'Sản phẩm', key: 'product', width: 24 },
      { header: 'Gói/Pool', key: 'group', width: 18 },
      { header: 'Nhập', key: 'purchaseDate', width: 12 },
      { header: 'Hết hạn', key: 'expiryDate', width: 12 },
      { header: 'Thời hạn', key: 'warrantyMonths', width: 12 },
      { header: 'Nguồn', key: 'source', width: 18 },
      { header: 'Giá nhập', key: 'purchasePrice', width: 14 },
      { header: 'Thanh toán', key: 'paymentStatus', width: 14 },
      { header: 'Thông tin', key: 'productInfo', width: 50 },
      { header: 'Ghi chú', key: 'notes', width: 32 },
      { header: 'Trạng thái', key: 'status', width: 14 },
      { header: 'Slot', key: 'slots', width: 10 },
    ], filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, 'Kho hàng');
  };

  const toggleSelectAll = (checked: boolean, ids: string[]) => setSelectedIds(checked ? ids : []);
  const toggleSelect = (id: string, checked: boolean) => setSelectedIds(prev => checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id));
  const bulkDelete = () => {
    const deletable = pageItems.filter(i => i.status === 'AVAILABLE').map(i => i.id).filter(id => selectedIds.includes(id));
    if (deletable.length === 0) return;
    setConfirmState({
      message: `Xóa ${deletable.length} mục kho (chỉ mục Sẵn có)?`,
      onConfirm: async () => {
        const sb = getSupabase();
        if (!sb) return notify('Không thể xóa kho', 'error');
        const { error } = await sb.from('inventory').delete().in('id', deletable);
        if (!error) {
          // Update local storage immediately
          const currentInventory = Database.getInventory();
          Database.setInventory(currentInventory.filter(i => !deletable.includes(i.id)));
          
          // Force refresh form if it's open
          if (showForm && !editingItem) {
            setShowForm(false);
            setTimeout(() => {
              setShowForm(true);
            }, 50); // Reduced delay for better UX
          }
          
          try {
            const sb2 = getSupabase();
            if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Xóa hàng loạt kho', details: `ids=${deletable.join(',')}` });
          } catch {}
          setSelectedIds([]);
          refresh();
          notify('Đã xóa mục kho đã chọn', 'success');
        } else {
          notify('Không thể xóa kho', 'error');
        }
      }
    });
  };
  const bulkUnlink = () => {
    const unlinkables = pageItems.filter(i => i.linkedOrderId).map(i => i.id).filter(id => selectedIds.includes(id));
    if (unlinkables.length === 0) return;
    setConfirmState({
      message: `Gỡ liên kết ${unlinkables.length} mục kho khỏi đơn?`,
      onConfirm: async () => {
        const sb = getSupabase();
        if (!sb) return notify('Không thể gỡ liên kết', 'error');
        for (const id of unlinkables) {
          const item = items.find(i => i.id === id);
          if (!item) continue;
          if (item.isAccountBased) {
            const nextProfiles = (item.profiles || []).map((p: any) => (
              p.assignedOrderId ? { ...p, isAssigned: false, assignedOrderId: null, assignedAt: null, expiryAt: null } : p
            ));
            await sb.from('inventory').update({ profiles: nextProfiles }).eq('id', id);
          } else {
            await sb.from('inventory').update({ status: 'AVAILABLE', linked_order_id: null }).eq('id', id);
          }
        }
        try {
          const sb2 = getSupabase();
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Gỡ liên kết kho hàng loạt', details: `ids=${unlinkables.join(',')}` });
        } catch {}
        setSelectedIds([]);
        refresh();
        notify('Đã gỡ liên kết các mục kho', 'success');
      }
    });
  };

  const bulkUpdatePaymentStatus = () => {
    const selectedItems = pageItems.filter(i => selectedIds.includes(i.id));
    if (selectedItems.length === 0) return;
    setSelectedPaymentStatus('UNPAID'); // Reset to default
    setPaymentStatusModal({ selectedIds: selectedItems.map(i => i.id) });
  };

  const remove = (id: string) => {
    setConfirmState({
      message: 'Xóa mục này khỏi kho?',
      onConfirm: async () => {
        const sb = getSupabase();
        if (!sb) return notify('Không thể xóa mục này khỏi kho', 'error');
        const snapshot = items.find(i => i.id === id) || null;
        const { error } = await sb.from('inventory').delete().eq('id', id);
        if (!error) {
          // Update local storage immediately
          const currentInventory = Database.getInventory();
          Database.setInventory(currentInventory.filter(i => i.id !== id));
          
          // Force refresh form if it's open
          if (showForm && !editingItem) {
            setShowForm(false);
            setTimeout(() => {
              setShowForm(true);
            }, 50); // Reduced delay for better UX
          }
          
          try {
            const sb2 = getSupabase();
            if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Xóa khỏi kho', details: `inventoryItemId=${id}; productId=${snapshot?.productId || ''}; packageId=${snapshot?.packageId || ''}; productInfo=${snapshot?.productInfo || ''}` });
          } catch {}
          notify('Đã xóa khỏi kho', 'success');
        } else {
          notify('Không thể xóa mục này khỏi kho', 'error');
        }
        refresh();
      }
    });
  };

  const unlinkFromOrder = (id: string) => {
    const inv = items.find(i => i.id === id);
    if (!inv || !inv.linkedOrderId) return;
    setConfirmState({
      message: 'Gỡ liên kết khỏi đơn và đặt trạng thái Sẵn có?',
      onConfirm: async () => {
        const sb = getSupabase();
        if (!sb) return notify('Không thể gỡ liên kết khỏi đơn', 'error');
        if (inv.isAccountBased) {
          const nextProfiles = (inv.profiles || []).map((p: any) => (
            p.assignedOrderId === inv.linkedOrderId ? { ...p, isAssigned: false, assignedOrderId: null, assignedAt: null, expiryAt: null } : p
          ));
          await sb.from('inventory').update({ profiles: nextProfiles }).eq('id', id);
        } else {
          await sb.from('inventory').update({ status: 'AVAILABLE', linked_order_id: null }).eq('id', id);
        }
        try {
          const sb2 = getSupabase();
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Gỡ liên kết kho khỏi đơn', details: `inventoryId=${id}; orderId=${inv.linkedOrderId}` });
        } catch {}
        notify('Đã gỡ liên kết khỏi đơn và đặt trạng thái Sẵn có', 'success');
        refresh();
      }
    });
  };

  const renewInventory = (id: string) => {
    const inv = items.find(i => i.id === id);
    if (!inv) return;
    // default months based on product/package
    const product = products.find(p => p.id === inv.productId);
    const packageInfo = packages.find(p => p.id === inv.packageId);
    const defaultMonths = product?.sharedInventoryPool ? 1 : (packageInfo?.warrantyPeriod || 1);
    setRenewalDialog({ id, months: defaultMonths, amount: 0, note: '' });
  };

  const bulkRenewal = () => {
    const renewables = pageItems.filter(i => selectedIds.includes(i.id));
    if (renewables.length === 0) return;
    
    setConfirmState({
      message: `Gia hạn ${renewables.length} kho hàng đã chọn?`,
      onConfirm: async () => {
        const sb = getSupabase();
        if (!sb) return notify('Không thể gia hạn kho hàng', 'error');
        
        let successCount = 0;
        let errorCount = 0;
        const renewalDetails: string[] = [];
        
        for (const inv of renewables) {
          try {
            const product = products.find(p => p.id === inv.productId);
            const packageInfo = packages.find(p => p.id === inv.packageId);
            
            // Calculate new expiry date
            const currentExpiry = new Date(inv.expiryDate);
            const newExpiry = new Date(currentExpiry);
            
            if (product?.sharedInventoryPool) {
              // For shared pool products, add 1 month
              newExpiry.setMonth(newExpiry.getMonth() + 1);
            } else {
              // For regular products, add package warranty period
              const warrantyPeriod = packageInfo?.warrantyPeriod || 1;
              newExpiry.setMonth(newExpiry.getMonth() + warrantyPeriod);
            }
            
            const { error } = await sb.from('inventory').update({ 
              expiry_date: newExpiry.toISOString() 
            }).eq('id', inv.id);
            
            if (!error) {
              successCount++;
              renewalDetails.push(`${inv.code}: ${currentExpiry.toISOString().split('T')[0]} -> ${newExpiry.toISOString().split('T')[0]}`);
            } else {
              errorCount++;
            }
          } catch (err) {
            errorCount++;
          }
        }
        
        if (successCount > 0) {
          try {
            const sb2 = getSupabase();
            if (sb2) await sb2.from('activity_logs').insert({ 
              employee_id: state.user?.id || 'system', 
              action: 'Gia hạn hàng loạt kho hàng', 
              details: `count=${successCount}; ids=${renewables.map(i => i.id).join(',')}; details=${renewalDetails.join('; ')}` 
            });
          } catch {}
        }
        
        if (errorCount === 0) {
          notify(`Đã gia hạn thành công ${successCount} kho hàng`, 'success');
        } else if (successCount > 0) {
          notify(`Đã gia hạn thành công ${successCount} kho hàng, ${errorCount} lỗi`, 'warning');
        } else {
          notify('Không thể gia hạn kho hàng', 'error');
        }
        
        setSelectedIds([]);
        refresh();
      }
    });
  };

  const statusLabel = (status: InventoryItem['status']) => {
    switch (status) {
      case 'AVAILABLE': return 'Sẵn có';
      case 'SOLD': return 'Đã bán';
      case 'EXPIRED': return 'Hết hạn';
      case 'NEEDS_UPDATE': return 'Cần update';
      default: return status;
    }
  };

  const getActualStatus = (item: InventoryItem) => {
    // Check if item is expired
    const now = new Date();
    const expiryDate = new Date(item.expiryDate);
    if (expiryDate < now) {
      return 'EXPIRED';
    }
    return item.status;
  };

  const statusBadge = (item: InventoryItem) => {
    const actualStatus = getActualStatus(item);
    const cls = actualStatus === 'AVAILABLE'
      ? 'status-completed'
      : actualStatus === 'SOLD'
      ? 'status-completed'
      : actualStatus === 'NEEDS_UPDATE'
      ? 'status-processing'
      : 'status-cancelled';
    const content = <span className={`status-badge ${cls}`}>{statusLabel(actualStatus)}</span>;
    if (actualStatus !== 'SOLD') return content;
    // When SOLD, allow click to view linked orders (classic and account-based)
    return (
      <button
        className="btn btn-sm btn-light"
        title="Xem đơn hàng đã liên kết"
        onClick={async () => {
          const sb = getSupabase();
          if (!sb) return;
          const orderIds: string[] = [];
          // 1) Classic link
          if (item.linkedOrderId) orderIds.push(item.linkedOrderId);
          // 2) Account-based: any profiles assigned
          const profiles = Array.isArray(item.profiles) ? item.profiles : [];
          profiles.forEach((p: any) => { if (p.assignedOrderId) orderIds.push(p.assignedOrderId); });
          const unique = Array.from(new Set(orderIds));
          if (unique.length === 0) { notify('Kho này không có đơn liên kết', 'info'); return; }
          // Fetch orders to show, prefer local DB first
          let found = Database.getOrders().filter(o => unique.includes(o.id));
          if (found.length !== unique.length) {
            const { data } = await sb.from('orders').select('*').in('id', unique);
            if (data && data.length) {
              const mapped = data.map((r: any) => ({
                id: r.id,
                code: r.code,
                customerId: r.customer_id,
                packageId: r.package_id,
                status: r.status,
                paymentStatus: r.payment_status,
                orderInfo: r.order_info,
                notes: r.notes,
                inventoryItemId: r.inventory_item_id,
                inventoryProfileId: r.inventory_profile_id,
                useCustomPrice: r.use_custom_price || false,
                customPrice: r.custom_price,
                customFieldValues: r.custom_field_values,
                purchaseDate: r.purchase_date ? new Date(r.purchase_date) : new Date(),
                expiryDate: r.expiry_date ? new Date(r.expiry_date) : new Date(),
                createdAt: r.created_at ? new Date(r.created_at) : new Date(),
                updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
              }));
              found = mapped as any;
            }
          }
          if (found.length === 1) {
            setViewingOrder(found[0]);
            return;
          }
          // If multiple, open a simple chooser modal
          setConfirmState({
            message: `Kho này liên kết ${found.length} đơn. Mở đơn mới nhất?`,
            onConfirm: () => {
              const latest = found.sort((a: any, b: any) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
              setViewingOrder(latest as any);
            }
          });
        }}
      >
        {statusLabel(actualStatus)}
      </button>
    );
  };

  const resetFilters = () => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setFilterProduct('');
    setFilterPackage('');
    setFilterStatus('');
    setFilterPaymentStatus('');
    setDateFrom('');
    setDateTo('');
    setOnlyAccounts(false);
    setOnlyFreeSlots(false);
    setPage(1);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="d-flex justify-content-between align-items-center">
          <h2 className="card-title">Danh sách kho hàng</h2>
          <div className="d-flex gap-2">
            <button className="btn btn-light" onClick={() => {
              const filename = generateExportFilename('KhoHang', {
                searchTerm: debouncedSearchTerm,
                filterProduct: filterProduct ? products.find(p => p.id === filterProduct)?.name : '',
                filterPackage: filterPackage ? packages.find(p => p.id === filterPackage)?.name : '',
                filterStatus,
                filterPaymentStatus,
                dateFrom,
                dateTo,
                onlyAccounts,
                onlyFreeSlots
              }, 'TrangHienTai');
              exportInventoryXlsx(pageItems, filename);
            }}>Xuất Excel (trang hiện tại)</button>
            <button className="btn btn-light" onClick={() => {
              const filename = generateExportFilename('KhoHang', {
                searchTerm: debouncedSearchTerm,
                filterProduct: filterProduct ? products.find(p => p.id === filterProduct)?.name : '',
                filterPackage: filterPackage ? packages.find(p => p.id === filterPackage)?.name : '',
                filterStatus,
                filterPaymentStatus,
                dateFrom,
                dateTo,
                onlyAccounts,
                onlyFreeSlots
              }, 'KetQuaLoc');
              exportInventoryXlsx(filteredItems, filename);
            }}>Xuất Excel (kết quả đã lọc)</button>
            {selectedIds.length > 0 && (
              <>
                <button className="btn btn-success" onClick={bulkRenewal}>Gia hạn đã chọn</button>
                <button className="btn btn-danger" onClick={bulkDelete}>Xóa đã chọn</button>
                <button className="btn btn-secondary" onClick={bulkUnlink}>Gỡ liên kết đã chọn</button>
                <button className="btn btn-info" onClick={bulkUpdatePaymentStatus}>Cập nhật thanh toán</button>
              </>
            )}
            <button className="btn btn-primary" onClick={() => { 
              setEditingItem(null); 
              setShowForm(false); // Force close first
              setTimeout(() => {
                setShowForm(true); // Then open with fresh state
              }, 50); // Small delay to ensure fresh state
            }}>Nhập kho</button>
            {hasStuckSlots && (
              <button className="btn btn-warning" onClick={fixOrphanedSlots}>Fix slot bị kẹt</button>
            )}
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <div>
            <input
              type="text"
              className="form-control"
              placeholder="Tìm kiếm mã, sản phẩm, ghi chú, thông tin tài khoản..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <select className="form-control" value={filterProduct} onChange={(e) => { setFilterProduct(e.target.value); setFilterPackage(''); }}>
              <option value="">Lọc theo sản phẩm</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <select className="form-control" value={filterPackage} onChange={(e) => setFilterPackage(e.target.value)} disabled={!filterProduct}>
              <option value="">Lọc theo gói</option>
              {packages.filter(pk => !filterProduct || pk.productId === filterProduct).map(pk => (
                <option key={pk.id} value={pk.id}>{pk.name}</option>
              ))}
            </select>
          </div>
          <div>
            <select className="form-control" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">Trạng thái</option>
              <option value="AVAILABLE">Sẵn có</option>
              <option value="SOLD">Đã bán</option>
              <option value="EXPIRED">Hết hạn</option>
              <option value="NEEDS_UPDATE">Cần update</option>
            </select>
          </div>
          <div>
            <select className="form-control" value={filterPaymentStatus} onChange={(e) => setFilterPaymentStatus(e.target.value)}>
              <option value="">Thanh toán</option>
              {INVENTORY_PAYMENT_STATUSES.map(status => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <DateRangeInput
              label="Khoảng ngày nhập"
              from={dateFrom}
              to={dateTo}
              onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
            />
          </div>
          <div>
            <select
              className="form-control"
              value={onlyAccounts ? '1' : '0'}
              onChange={(e) => setOnlyAccounts(e.target.value === '1')}
            >
              <option value="0">Tất cả tài khoản</option>
              <option value="1">Chỉ tài khoản nhiều slot</option>
            </select>
          </div>
          <div>
            <select
              className="form-control"
              value={onlyFreeSlots ? '1' : '0'}
              onChange={(e) => setOnlyFreeSlots(e.target.value === '1')}
            >
              <option value="0">Tất cả slot</option>
              <option value="1">Chỉ còn slot trống</option>
            </select>
          </div>
          <div>
            <button className="btn btn-light w-100" onClick={resetFilters}>Reset bộ lọc</button>
          </div>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="text-center py-4">
          <p>Không có dữ liệu</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={pageItems.length > 0 && pageItems.every(i => selectedIds.includes(i.id))}
                    onChange={(e) => toggleSelectAll(e.target.checked, pageItems.map(i => i.id))}
                  />
                </th>
                <th>Mã kho</th>
                <th>Sản phẩm</th>
                <th>Gói / Pool</th>
                <th>Ngày nhập</th>
                <th>Hết hạn</th>
                <th>Thời hạn</th>
                <th>Nguồn</th>
                <th>Giá mua</th>
                <th>Thanh toán</th>
                <th>Trạng thái</th>
                <th>Slot</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((i, index) => (
                <tr key={i.id}>
                  <td>
                    <input type="checkbox" checked={selectedIds.includes(i.id)} onChange={(e) => toggleSelect(i.id, e.target.checked)} />
                  </td>
                  <td>{i.code || `KHO${index + 1}`}</td>
                  <td>{productMap.get(i.productId) || i.productId}</td>
                  <td>{(() => {
                    const prod = products.find(p => p.id === i.productId);
                    if (prod?.sharedInventoryPool) {
                      return <span className="text-muted">Pool chung</span>;
                    }
                    return packageMap.get(i.packageId) || i.packageId;
                  })()}</td>
                  <td>{new Date(i.purchaseDate).toLocaleDateString('vi-VN')}</td>
                  <td>{new Date(i.expiryDate).toLocaleDateString('vi-VN')}</td>
                  <td>{(() => {
                    const prod = products.find(p => p.id === i.productId);
                    if (prod?.sharedInventoryPool) {
                      return i.customWarrantyMonths ? `${i.customWarrantyMonths} tháng` : '-';
                    }
                    const pkg = packages.find(p => p.id === i.packageId);
                    return pkg ? `${pkg.warrantyPeriod} tháng` : '-';
                  })()}</td>
                  <td>{i.sourceNote || '-'}</td>
                  <td>{i.purchasePrice ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(i.purchasePrice) : '-'}</td>
                  <td>
                    <span className={`status-badge ${i.paymentStatus === 'PAID' ? 'status-completed' : 'status-cancelled'}`}>
                      {INVENTORY_PAYMENT_STATUSES.find(s => s.value === i.paymentStatus)?.label || 'Chưa TT'}
                    </span>
                  </td>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      {statusBadge(i)}
                      {i.status === 'NEEDS_UPDATE' && (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => setConfirmState({
                            message: `Chuyển ${i.code} từ Cần update -> Sẵn có?`,
                            onConfirm: async () => {
                              const sb = getSupabase();
                              if (!sb) { notify('Không thể cập nhật trạng thái', 'error'); return; }
                              const { error } = await sb.from('inventory').update({ status: 'AVAILABLE' }).eq('id', i.id);
                              if (error) return notify('Không thể cập nhật trạng thái', 'error');
                              try {
                                const sb2 = getSupabase();
                                if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Đánh dấu kho cần update -> sẵn có', details: `inventoryId=${i.id}; code=${i.code}` });
                              } catch {}
                              notify('Đã chuyển về Sẵn có', 'success');
                              refresh();
                            }
                          })}
                          title="Đặt lại trạng thái Sẵn có"
                        >
                          Mark Sẵn có
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    {(i.isAccountBased || ((packages.find(p => p.id === i.packageId) || {}) as any).isAccountBased) ? (() => {
                      const used = (i.profiles || []).filter(p => p.isAssigned).length;
                      const total = i.totalSlots || 0;
                      return (
                        <button className="btn btn-sm btn-light" onClick={() => setProfilesModal({ item: i })}>
                          {used}/{total}
                        </button>
                      );
                    })() : '-'}
                  </td>
                  <td>
                    <div className="d-flex gap-2">
                      <button className="btn btn-sm btn-light" onClick={() => setViewingInventory(i)}>Xem</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => { setEditingItem(i); setShowForm(true); }}>Sửa</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mt-3">
        <div>
          <select className="form-control" style={{ width: 100 }} value={limit} onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}>
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

      {showForm && (
        <WarehouseForm key={editingItem?.id || 'new'} item={editingItem} onClose={() => { setShowForm(false); setEditingItem(null); }} onSuccess={() => { setShowForm(false); setEditingItem(null); refresh(); }} />
      )}

      {profilesModal && (
        <div className="modal" role="dialog" aria-modal>
          <div className="modal-content" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">Slots - {profilesModal.item.code}</h3>
              <button className="close" onClick={() => setProfilesModal(null)}>×</button>
            </div>
            <div className="mb-3">
              {(() => {
                const item = items.find(x => x.id === profilesModal.item.id) || profilesModal.item;
                const profiles = item.profiles || [];
                if (!profiles.length) return <div className="text-muted">Không có slot</div>;
                return (
                  <div className="table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Slot</th>
                          <th>Trạng thái</th>
                          <th>Đơn hàng</th>
                          <th>Hết hạn</th>
                          <th>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profiles.map(p => {
                          const orderId = p.assignedOrderId;
                          const order = orderId ? Database.getOrders().find(o => o.id === orderId) : null;
                          return (
                            <tr key={p.id}>
                              <td>{p.label}</td>
                              <td>{(() => {
                                if (p.isAssigned) return 'Đang dùng';
                                return (p as any).needsUpdate ? 'Trống (Cần update)' : 'Trống';
                              })()}</td>
                              <td>{order ? `${order.code}` : '-'}</td>
                              <td>{p.expiryAt ? new Date(p.expiryAt).toISOString().split('T')[0] : '-'}</td>
                              <td>
                                <div className="d-flex gap-2">
                                  {order && (
                                    <button className="btn btn-sm btn-light" onClick={() => { setProfilesModal(null); setViewingOrder(order); }}>
                                      Xem đơn hàng
                                    </button>
                                  )}
                                  {!order && p.isAssigned && (
                                    <button className="btn btn-sm btn-danger" onClick={() => releaseSingleProfile(item.id, p.id)}>Giải phóng</button>
                                  )}
                                  {!p.isAssigned && (p as any).needsUpdate && (
                                    <button className="btn btn-sm btn-primary" onClick={() => setConfirmState({
                                      message: `Đánh dấu slot "${p.label}" đã update?`,
                                      onConfirm: () => clearProfileNeedsUpdate(item.id, p.id)
                                    })}>Đã update</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
            <div className="d-flex justify-content-end gap-2">
              <button className="btn btn-secondary" onClick={() => setProfilesModal(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {renewalDialog && (() => {
        const inv = items.find(x => x.id === renewalDialog.id);
        if (!inv) return null;
        return (
          <div className="modal" role="dialog" aria-modal style={{ zIndex: 10002 }}>
            <div className="modal-content" style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <h3 className="modal-title">Gia hạn kho {inv.code}</h3>
                <button className="close" onClick={() => setRenewalDialog(null)}>×</button>
              </div>
              <div className="mb-3">
                <div className="form-group">
                  <label className="form-label">Số tháng</label>
                  <input type="number" className="form-control" value={renewalDialog.months} min={1} onChange={e => setRenewalDialog({ ...renewalDialog, months: Math.max(1, parseInt(e.target.value || '1', 10)) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Giá gia hạn (VND)</label>
                  <input type="number" className="form-control" value={renewalDialog.amount} min={0} onChange={e => setRenewalDialog({ ...renewalDialog, amount: Math.max(0, parseInt(e.target.value || '0', 10)) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Ghi chú</label>
                  <input type="text" className="form-control" value={renewalDialog.note} onChange={e => setRenewalDialog({ ...renewalDialog, note: e.target.value })} />
                </div>
              </div>
              <div className="d-flex justify-content-end gap-2">
                <button className="btn btn-secondary" onClick={() => setRenewalDialog(null)}>Hủy</button>
                <button className="btn btn-success" onClick={async () => {
                  const sb = getSupabase();
                  if (!sb) { notify('Không thể gia hạn', 'error'); return; }
                  const currentExpiry = new Date(inv.expiryDate);
                  const newExpiry = new Date(currentExpiry);
                  newExpiry.setMonth(newExpiry.getMonth() + (renewalDialog.months || 1));
                  const { error } = await sb.from('inventory').update({ expiry_date: newExpiry.toISOString() }).eq('id', inv.id);
                  if (!error) {
                    Database.renewInventoryItem(inv.id, renewalDialog.months, renewalDialog.amount, { note: renewalDialog.note, createdBy: state.user?.id || 'system' });
                    try {
                      const sb2 = getSupabase();
                      if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Gia hạn kho hàng', details: `inventoryId=${inv.id}; oldExpiry=${currentExpiry.toISOString().split('T')[0]}; newExpiry=${newExpiry.toISOString().split('T')[0]}; months=${renewalDialog.months}; amount=${renewalDialog.amount}` });
                    } catch {}
                    notify('Gia hạn thành công', 'success');
                    setRenewalDialog(null);
                    refresh();
                  } else {
                    notify('Không thể gia hạn kho', 'error');
                  }
                }}>Xác nhận</button>
              </div>
            </div>
          </div>
        );
      })()}

      {viewingInventory && (() => {
        const inv = items.find(x => x.id === viewingInventory.id) || viewingInventory;
        const product = products.find(p => p.id === inv.productId);
        const pkg = packages.find(p => p.id === inv.packageId);
        const renewals = Database.getInventoryRenewals().filter(r => r.inventoryId === inv.id).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
        return (
          <div className="modal" role="dialog" aria-modal>
            <div className="modal-content" style={{ maxWidth: 600 }}>
              <div className="modal-header">
                <h3 className="modal-title">Kho {inv.code}</h3>
                <button className="close" onClick={() => setViewingInventory(null)}>×</button>
              </div>
              <div className="mb-3">
                <div><strong>Sản phẩm:</strong> {product?.name || inv.productId}</div>
                <div><strong>Gói:</strong> {pkg?.name || inv.packageId}</div>
                <div><strong>Nhập:</strong> {formatDate(inv.purchaseDate)}</div>
                <div><strong>Hết hạn:</strong> {formatDate(inv.expiryDate)}</div>
                <div><strong>Nguồn:</strong> {inv.sourceNote || '-'}</div>
                <div><strong>Giá mua:</strong> {typeof inv.purchasePrice === 'number' ? formatPrice(inv.purchasePrice) : '-'}</div>
                <div><strong>Thanh toán:</strong> {INVENTORY_PAYMENT_STATUSES.find(s => s.value === inv.paymentStatus)?.label || 'Chưa TT'}</div>
                {inv.productInfo && <div style={{ marginTop: 6 }}><strong>Thông tin sản phẩm:</strong><pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{inv.productInfo}</pre></div>}
                {inv.notes && <div style={{ marginTop: 6 }}><strong>Ghi chú nội bộ:</strong> {inv.notes}</div>}
                <div style={{ marginTop: 12 }}>
                  <strong>Lịch sử gia hạn:</strong>
                  {renewals.length === 0 ? (
                    <div>Chưa có</div>
                  ) : (
                    <ul style={{ paddingLeft: '18px', marginTop: '6px' }}>
                      {renewals.map(r => (
                        <li key={r.id}>
                          {new Date(r.createdAt).toLocaleDateString('vi-VN')} · +{r.months} tháng · HSD: {new Date(r.previousExpiryDate).toLocaleDateString('vi-VN')} → {new Date(r.newExpiryDate).toLocaleDateString('vi-VN')} · Giá: {formatPrice(r.amount)}{r.note ? ` · Ghi chú: ${r.note}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div className="d-flex justify-content-end gap-2">
                <button
                  className="btn btn-success"
                  onClick={() => { setViewingInventory(null); renewInventory(inv.id); }}
                >
                  Gia hạn
                </button>
                <button className="btn btn-secondary" onClick={() => setViewingInventory(null)}>Đóng</button>
              </div>
            </div>
          </div>
        );
      })()}

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

      {viewingOrder && (
        <OrderDetailsModal
          order={viewingOrder}
          onClose={() => setViewingOrder(null)}
          inventory={items as any}
          products={products as any}
          packages={packages as any}
          getCustomerName={(id: string) => customerMap.get(id) || 'Không xác định'}
          getPackageInfo={(packageId: string) => {
            const { pkg, product } = getPackageInfo(packageId);
            return { package: pkg, product } as any;
          }}
          getStatusLabel={getStatusLabel as any}
          getPaymentLabel={getPaymentLabel as any}
          formatDate={formatDate}
          formatPrice={formatPrice}
          onCopyInfo={async () => {
            const o = viewingOrder;
            const info = buildFullOrderInfo(o);
            const linesForCopy = info.lines.flatMap((line, idx) => idx < info.lines.length - 1 ? [line, ''] : [line]);
            const text = linesForCopy.join('\n');
            try {
              await navigator.clipboard.writeText(text);
              notify('Đã copy thông tin đơn hàng', 'success');
            } catch (e) {
              notify('Không thể copy vào clipboard', 'error');
            }
          }}
        />
      )}

      {paymentStatusModal && (() => {
        const selectedItems = pageItems.filter(i => paymentStatusModal.selectedIds.includes(i.id));
        
        return (
          <div className="modal" role="dialog" aria-modal>
            <div className="modal-content" style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <h3 className="modal-title">Cập nhật trạng thái thanh toán</h3>
                <button className="close" onClick={() => setPaymentStatusModal(null)}>×</button>
              </div>
              <div className="mb-3">
                <div className="mb-3">
                  <strong>Đã chọn {selectedItems.length} mục kho:</strong>
                  <ul style={{ paddingLeft: '18px', marginTop: '6px' }}>
                    {selectedItems.map(item => (
                      <li key={item.id}>{item.code || `KHO${item.id.slice(-4)}`}</li>
                    ))}
                  </ul>
                </div>
                <div className="form-group">
                  <label className="form-label">Trạng thái thanh toán mới</label>
                  <select 
                    className="form-control" 
                    value={selectedPaymentStatus} 
                    onChange={(e) => setSelectedPaymentStatus(e.target.value as InventoryPaymentStatus)}
                  >
                    {INVENTORY_PAYMENT_STATUSES.map(status => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="d-flex justify-content-end gap-2">
                <button className="btn btn-secondary" onClick={() => setPaymentStatusModal(null)}>Hủy</button>
                <button className="btn btn-primary" onClick={async () => {
                  const sb = getSupabase();
                  if (!sb) { notify('Không thể cập nhật trạng thái thanh toán', 'error'); return; }
                  
                  const { error } = await sb
                    .from('inventory')
                    .update({ payment_status: selectedPaymentStatus })
                    .in('id', paymentStatusModal.selectedIds);
                  
                  if (error) {
                    notify('Không thể cập nhật trạng thái thanh toán', 'error');
                    return;
                  }
                  
                  try {
                    const sb2 = getSupabase();
                    if (sb2) await sb2.from('activity_logs').insert({ 
                      employee_id: state.user?.id || 'system', 
                      action: 'Cập nhật trạng thái thanh toán hàng loạt', 
                      details: `count=${selectedItems.length}; status=${selectedPaymentStatus}; ids=${paymentStatusModal.selectedIds.join(',')}` 
                    });
                  } catch {}
                  
                  notify(`Đã cập nhật trạng thái thanh toán cho ${selectedItems.length} mục kho`, 'success');
                  setSelectedIds([]);
                  setPaymentStatusModal(null);
                  refresh();
                }}>Xác nhận</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default WarehouseList;


