import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { InventoryItem, Product, ProductPackage, Order, Customer, OrderStatus, ORDER_STATUSES, PaymentStatus, PAYMENT_STATUSES, InventoryPaymentStatus, INVENTORY_PAYMENT_STATUSES_FULL, InventoryRenewal } from '../../types';
import { Database } from '../../utils/database';
import WarehouseForm from './WarehouseForm';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { exportToXlsx, generateExportFilename } from '../../utils/excel';
import DateRangeInput from '../Shared/DateRangeInput';
import { getSupabase } from '../../utils/supabaseClient';
import OrderDetailsModal from '../Orders/OrderDetailsModal';
import { normalizeExpiryDate } from '../../utils/date';
import useMediaQuery from '../../hooks/useMediaQuery';
import { filterVisibleAccountColumns, resolveAccountColumns } from '../../utils/accountColumns';

const WarehouseList: React.FC = () => {
  const { state } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { notify } = useToast();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>('');
  const [filterProduct, setFilterProduct] = useState<string>('');
  const [filterPackage, setFilterPackage] = useState<string>('');
  const [filterSource, setFilterSource] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [confirmState, setConfirmState] = useState<null | { message: string; onConfirm: () => void }>(null);
  const [renewalDialog, setRenewalDialog] = useState<null | { id: string; months: number; amount: number; note: string; paymentStatus: InventoryPaymentStatus }>(null);
  const [bulkRenewalDialog, setBulkRenewalDialog] = useState<null | { ids: string[]; months: number; amount: number; note: string; paymentStatus: InventoryPaymentStatus }>(null);
  const [viewingInventory, setViewingInventory] = useState<null | InventoryItem>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [profilesModal, setProfilesModal] = useState<null | { item: InventoryItem }>(null);
  const [previousProfilesModal, setPreviousProfilesModal] = useState<null | { item: InventoryItem }>(null);
  const [viewingOrder, setViewingOrder] = useState<null | Order>(null);
  const [inventoryRenewals, setInventoryRenewals] = useState<InventoryRenewal[]>([]);
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
  const [onlyAccounts, setOnlyAccounts] = useState(false);
  const [onlyFreeSlots, setOnlyFreeSlots] = useState(false);
  const [hasStuckSlots, setHasStuckSlots] = useState(false);
  const [expiryFilter, setExpiryFilter] = useState<'EXPIRING' | 'EXPIRED' | 'ACTIVE' | ''>('');
  const [filterActiveStatus, setFilterActiveStatus] = useState<'ACTIVE' | 'NOT_ACTIVE' | ''>('');
  const [paymentStatusModal, setPaymentStatusModal] = useState<null | { selectedIds: string[] }>(null);
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<InventoryPaymentStatus>('UNPAID');
  const [bulkPaymentTarget, setBulkPaymentTarget] = useState<'INITIAL' | 'RENEWAL'>('INITIAL');
  const [selectedRenewalIds, setSelectedRenewalIds] = useState<string[]>([]);
  const [latestRenewalMap, setLatestRenewalMap] = useState<Map<string, InventoryRenewal>>(new Map());
  const [refundState, setRefundState] = useState<null | {
    item: InventoryItem;
    errorDate: string;
    amount: number;
    useCustomAmount?: boolean;
    customAmount?: number;
    refundReason: string;
  }>(null);
  const countAssignedSlots = (item?: InventoryItem | null) => {
    if (!item?.isAccountBased || !Array.isArray(item.profiles)) return 0;
    return item.profiles.filter(slot => slot && (slot.isAssigned || !!slot.assignedOrderId)).length;
  };
  const hasActiveSlots = (item?: InventoryItem | null) => countAssignedSlots(item) > 0;
  const getDeleteBlockedReason = (item?: InventoryItem | null) => {
    if (!item) return 'Kho không tồn tại';
    if (item.linkedOrderId) return 'Kho đang liên kết với đơn hàng';
    if (item.status !== 'AVAILABLE') return 'Chỉ xóa được kho ở trạng thái Sẵn có';
    if (hasActiveSlots(item)) return 'Kho account-based vẫn còn slot đang được sử dụng';
    return '';
  };
  const canDeleteInventoryItem = (item?: InventoryItem | null) => getDeleteBlockedReason(item) === '';
  // Load inventory renewals from Supabase for accurate history display
  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      if (!sb) return;
      const { data } = await sb.from('inventory_renewals').select('*');
      const mapped = (data || []).map((r: any) => ({
        id: r.id,
        inventoryId: r.inventory_id,
        months: r.months,
        amount: Number(r.amount) || 0,
        previousExpiryDate: r.previous_expiry_date ? new Date(r.previous_expiry_date) : new Date(),
        newExpiryDate: r.new_expiry_date ? new Date(r.new_expiry_date) : new Date(),
        note: r.note || undefined,
        paymentStatus: r.payment_status || undefined,
        createdAt: r.created_at ? new Date(r.created_at) : new Date(),
        createdBy: r.created_by || r.createdBy || '',
      }));
      setInventoryRenewals(mapped);
    })();
  }, []);

  useEffect(() => {
    const map = new Map<string, InventoryRenewal>();
    for (const renewal of inventoryRenewals) {
      const existing = map.get(renewal.inventoryId);
      if (!existing || new Date(renewal.newExpiryDate) > new Date(existing.newExpiryDate)) {
        map.set(renewal.inventoryId, renewal);
      }
    }
    setLatestRenewalMap(map);
  }, [inventoryRenewals]);

  const renewalsByInventory = useMemo(() => {
    const map = new Map<string, InventoryRenewal[]>();
    for (const renewal of inventoryRenewals) {
      const arr = map.get(renewal.inventoryId) || [];
      arr.push(renewal);
      map.set(renewal.inventoryId, arr);
    }
    return map;
  }, [inventoryRenewals]);

  useEffect(() => {
    if (!items.length) {
      setSelectedIds([]);
      return;
    }
    // Keep selected IDs that still exist in the items list
    setSelectedIds(prev => prev.filter(id => items.find(i => i.id === id)));
  }, [items]);

  const expiryMismatchItems = useMemo(() => {
    if (!items.length || latestRenewalMap.size === 0) return [];
    return items.filter(inv => {
      const latest = latestRenewalMap.get(inv.id);
      if (!latest) return false;
      return new Date(latest.newExpiryDate) > new Date(inv.expiryDate);
    });
  }, [items, latestRenewalMap]);

  const fixExpiryMismatches = () => {
    if (expiryMismatchItems.length === 0) {
      notify('Không có kho nào cần sửa hạn', 'info');
      return;
    }

    setConfirmState({
      message: `Cập nhật hạn sử dụng cho ${expiryMismatchItems.length} kho dựa trên lần gia hạn mới nhất?`,
      onConfirm: async () => {
        const sb = getSupabase();
        if (!sb) { notify('Không thể cập nhật hạn sử dụng', 'error'); return; }
        let success = 0;
        let failed = 0;
        const details: string[] = [];

        for (const inv of expiryMismatchItems) {
          const latest = latestRenewalMap.get(inv.id);
          if (!latest) continue;
          const expiryToUpdate = new Date(latest.newExpiryDate);
          const { error } = await sb
            .from('inventory')
            .update({ expiry_date: expiryToUpdate.toISOString() })
            .eq('id', inv.id);
          if (!error) {
            success++;
            details.push(`${inv.code || inv.id}: ${new Date(inv.expiryDate).toISOString().split('T')[0]} -> ${expiryToUpdate.toISOString().split('T')[0]}`);
          } else {
            failed++;
          }
        }

        if (success > 0) {
          try {
            const sb2 = getSupabase();
            if (sb2) await sb2.from('activity_logs').insert({
              employee_id: state.user?.id || null,
              action: 'Fix hạn kho',
              details: `count=${success}; items=${details.join(', ')}`
            });
          } catch { }
          notify(
            failed > 0
              ? `Đã cập nhật hạn sử dụng cho ${success} kho, ${failed} lỗi`
              : `Đã cập nhật hạn sử dụng cho ${success} kho`,
            failed > 0 ? 'warning' : 'success'
          );
          refresh();
        } else {
          notify('Không thể cập nhật hạn sử dụng', 'error');
        }
      }
    });
  };
  const fixOrphanedSlots = async () => {
    const sb = getSupabase();
    if (!sb) return notify('Không thể kết nối database', 'error');

    setConfirmState({
      message: 'Tìm và fix các slot kho hàng bị kẹt (slot thường và account-based)?',
      onConfirm: async () => {
        try {
          let fixedCount = 0;
          const fixedDetails: string[] = [];

          // Get all existing order IDs first
          const { data: orders, error: ordersError } = await sb
            .from('orders')
            .select('id');

          if (ordersError) {
            // Error fetching orders - ignore
            notify('Lỗi khi kiểm tra đơn hàng', 'error');
            return;
          }

          const existingOrderIds = new Set((orders || []).map(o => o.id));

          // 1. Fix regular slots: SOLD but no linked_order_id OR linked_order_id points to non-existent order
          // BUT exclude account-based inventory (they use profiles, not linked_order_id)
          const { data: allSoldSlots, error: fetchError } = await sb
            .from('inventory')
            .select('id, code, status, linked_order_id, is_account_based')
            .eq('status', 'SOLD');

          if (fetchError) {
            // Error fetching orphaned slots - ignore
            notify('Lỗi khi tìm slot bị kẹt', 'error');
            return;
          }

          // Only fix non-account-based slots for orphaned status
          const orphanedSlots = (allSoldSlots || []).filter(slot =>
            !slot.is_account_based && (!slot.linked_order_id || !existingOrderIds.has(slot.linked_order_id))
          );

          if (orphanedSlots.length > 0) {
            // Fixing orphaned slots

            const slotIds = orphanedSlots.map(slot => slot.id);
            // Slot IDs to fix

            const { data: updateResult, error: updateError } = await sb
              .from('inventory')
              .update({ status: 'AVAILABLE', linked_order_id: null })
              .in('id', slotIds)
              .select('id, code, status, linked_order_id');

            if (updateError) {
              // Error fixing orphaned slots - ignore
              notify('Lỗi khi fix slot thường bị kẹt', 'error');
            } else if (updateResult && updateResult.length > 0) {
              // Successfully fixed slots
              fixedCount += updateResult.length;
              fixedDetails.push(`${updateResult.length} slot thường`);
            } else {
              // No slots were actually updated - this might indicate a database issue
              notify('Không có slot nào được cập nhật. Có thể có vấn đề với database.', 'warning');
            }
          }

          // 1b. Fix AVAILABLE slots that still have stale linked_order_id (blocking deletion)
          const { data: availableWithLink, error: availableFetchError } = await sb
            .from('inventory')
            .select('id, code, status, linked_order_id, is_account_based')
            .eq('status', 'AVAILABLE')
            .not('linked_order_id', 'is', null);

          if (!availableFetchError && availableWithLink && availableWithLink.length > 0) {
            // These are AVAILABLE slots with stale linked_order_id - clear the link
            const staleIds = availableWithLink.map(slot => slot.id);
            const { data: staleUpdateResult, error: staleUpdateError } = await sb
              .from('inventory')
              .update({ linked_order_id: null })
              .in('id', staleIds)
              .select('id, code');

            if (!staleUpdateError && staleUpdateResult && staleUpdateResult.length > 0) {
              fixedCount += staleUpdateResult.length;
              fixedDetails.push(`${staleUpdateResult.length} kho sẵn có bị kẹt liên kết`);
            }
          }

          // 2. Fix account-based slots: profiles with assignedOrderId pointing to non-existent orders

          const { data: accountBasedItems, error: accountError } = await sb
            .from('inventory')
            .select('id, code, profiles')
            .eq('is_account_based', true);

          if (accountError) {
            // Error fetching account-based items - ignore
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

          // 3. Fix orders with inventory_item_id but no actual link
          const { data: allOrders, error: ordersFetchError } = await sb
            .from('orders')
            .select('id, code, inventory_item_id, inventory_profile_ids');

          if (!ordersFetchError && allOrders) {
            // Get all inventory items
            const { data: allInventory, error: invFetchError } = await sb
              .from('inventory')
              .select('id, is_account_based, profiles, linked_order_id');

            if (!invFetchError && allInventory) {
              const inventoryMap = new Map(allInventory.map((inv: any) => [inv.id, inv]));
              let ordersFixedCount = 0;
              const ordersToFix: string[] = [];

              for (const order of allOrders) {
                if (!order.inventory_item_id) continue;

                const inv = inventoryMap.get(order.inventory_item_id);
                if (!inv) {
                  // Inventory item doesn't exist, clear the link
                  ordersToFix.push(order.id);
                  continue;
                }

                // Check if there's an actual link
                if (inv.is_account_based) {
                  // For account-based, check if any profile is assigned to this order
                  const profiles = Array.isArray(inv.profiles) ? inv.profiles : [];
                  const hasAssignedSlot = profiles.some((p: any) =>
                    p.isAssigned && p.assignedOrderId === order.id
                  );

                  // Also check inventory_profile_ids
                  const orderProfileIds = order.inventory_profile_ids;
                  let hasValidProfileId = false;
                  if (orderProfileIds && Array.isArray(orderProfileIds) && orderProfileIds.length > 0) {
                    hasValidProfileId = orderProfileIds.some((profileId: string) => {
                      const profile = profiles.find((p: any) => p.id === profileId);
                      return profile && profile.isAssigned && profile.assignedOrderId === order.id;
                    });
                  }

                  if (!hasAssignedSlot && !hasValidProfileId) {
                    // No actual link, clear the order's inventory references
                    ordersToFix.push(order.id);
                  }
                } else {
                  // For classic inventory, check linked_order_id
                  if (inv.linked_order_id !== order.id) {
                    // No actual link, clear the order's inventory references
                    ordersToFix.push(order.id);
                  }
                }
              }

              if (ordersToFix.length > 0) {
                const { error: ordersUpdateError } = await sb
                  .from('orders')
                  .update({
                    inventory_item_id: null,
                    inventory_profile_ids: null
                  })
                  .in('id', ordersToFix);

                if (!ordersUpdateError) {
                  ordersFixedCount = ordersToFix.length;
                  fixedCount += ordersFixedCount;
                  fixedDetails.push(`${ordersFixedCount} đơn hàng`);
                }
              }
            }
          }

          if (fixedCount === 0) {
            notify('Không tìm thấy slot nào bị kẹt', 'info');
            return;
          }

          // 4. Log hoạt động
          try {
            const sb2 = getSupabase();
            if (sb2) await sb2.from('activity_logs').insert({
              employee_id: null,
              action: 'Fix slot bị kẹt',
              details: `Fixed ${fixedCount} slots: ${fixedDetails.join(', ')}`
            });
          } catch { }

          notify(`Đã fix ${fixedCount} slot bị kẹt (${fixedDetails.join(', ')})`, 'success');
          // Force refresh with delay to ensure database sync
          setTimeout(() => {
            refresh();
          }, 1000);

        } catch (error) {
          // Unexpected error fixing orphaned slots - ignore
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
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Giải phóng slot kẹt', details: `inventoryId=${inventoryId}; inventoryCode=${items.find(i => i.id === inventoryId)?.code || ''}` });
        } catch { }
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

      // Find the order that has this profile ID
      const profile = profiles.find((p: any) => p.id === profileId);
      const orderId = profile?.assignedOrderId;

      const nextProfiles = profiles.map((p: any) => (
        p.id === profileId ? { ...p, isAssigned: false, assignedOrderId: null, assignedAt: null, expiryAt: null } : p
      ));
      await sb.from('inventory').update({ profiles: nextProfiles }).eq('id', inventoryId);

      // Clear the profile ID from the order's inventory_profile_ids if it exists
      if (orderId) {
        const { data: order } = await sb.from('orders').select('inventory_profile_ids').eq('id', orderId).single();
        if (order && order.inventory_profile_ids && Array.isArray(order.inventory_profile_ids)) {
          const updatedProfileIds = order.inventory_profile_ids.filter((id: string) => id !== profileId);
          await sb.from('orders').update({
            inventory_profile_ids: updatedProfileIds.length > 0 ? updatedProfileIds : null
          }).eq('id', orderId);
        }
      }

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
        p.id === profileId ? { ...p, needsUpdate: false, previousOrderId: undefined } : p
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
      // Get all existing order IDs first
      const { data: orders, error: ordersError } = await sb
        .from('orders')
        .select('id');

      if (ordersError) {
        // Error fetching orders - ignore
        return;
      }

      const existingOrderIds = new Set((orders || []).map(o => o.id));

      // 1. Check regular slots: SOLD but no linked_order_id OR linked_order_id points to non-existent order
      // BUT exclude account-based inventory (they use profiles, not linked_order_id)
      const { data: allSoldSlots, error: fetchError } = await sb
        .from('inventory')
        .select('id, code, status, linked_order_id, is_account_based')
        .eq('status', 'SOLD');

      if (fetchError) {
        // Error checking orphaned slots - ignore
        return;
      }

      // Only check non-account-based slots for orphaned status
      const orphanedSlots = (allSoldSlots || []).filter(slot =>
        !slot.is_account_based && (!slot.linked_order_id || !existingOrderIds.has(slot.linked_order_id))
      );

      // 2. Check account-based slots: profiles with assignedOrderId pointing to non-existent orders
      const { data: accountBasedItems, error: accountError } = await sb
        .from('inventory')
        .select('id, code, profiles')
        .eq('is_account_based', true);

      if (accountError) {
        // Error checking account-based items - ignore
        return;
      }

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
      const hasRegularStuckSlots = orphanedSlots.length > 0;
      setHasStuckSlots(hasRegularStuckSlots || hasStuckAccountProfiles);

      // Debug logging
      if (hasRegularStuckSlots) {
        // Found regular stuck slots
      }

    } catch (error) {
      // Error checking for stuck slots - ignore
    }
  };

  const refresh = async () => {
    // WarehouseList: Starting refresh
    const sb = getSupabase();
    if (!sb) return;
    // Optional sweep on client for local display of expired flags is no longer needed
    const [invRes, prodRes, pkgRes, custRes] = await Promise.all([
      sb.from('inventory').select('*').order('created_at', { ascending: true }),
      sb.from('products').select('*').order('created_at', { ascending: true }),
      sb.from('packages').select('*').order('created_at', { ascending: true }),
      sb.from('customers').select('*').order('created_at', { ascending: true })
    ]);

    // WarehouseList: Data loaded

    // Auto-update inventory status based on expiry_date
    try {
      const now = new Date();
      const raw = Array.isArray(invRes.data) ? invRes.data : [];

      const toExpireIds: string[] = [];
      const toUnexpireIds: string[] = [];

      for (const r of raw) {
        const expiry = normalizeExpiryDate(r.expiry_date);
        const isExpiredNow = !!expiry && expiry.getTime() < now.getTime();
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

      // Auto-update account-based inventory status
      const accountBasedItems = raw.filter((r: any) => r.is_account_based);
      const toMarkSold: string[] = [];
      const toMarkAvailable: string[] = [];

      for (const r of accountBasedItems) {
        const profiles = Array.isArray(r.profiles) ? r.profiles : [];

        // If no profiles array or empty, consider it as having free slots
        if (profiles.length === 0) {
          if (r.status === 'SOLD') {
            toMarkAvailable.push(r.id);
          }
          continue;
        }

        // Check if there are any free slots (not assigned and not needsUpdate)
        const hasFreeSlot = profiles.some((p: any) => !p.isAssigned && !(p as any).needsUpdate);

        if (!hasFreeSlot && r.status !== 'SOLD') {
          toMarkSold.push(r.id);
        } else if (hasFreeSlot && r.status === 'SOLD') {
          toMarkAvailable.push(r.id);
        }
      }

      if (toMarkSold.length > 0) {
        await sb.from('inventory').update({ status: 'SOLD' }).in('id', toMarkSold);
      }
      if (toMarkAvailable.length > 0) {
        await sb.from('inventory').update({ status: 'AVAILABLE' }).in('id', toMarkAvailable);
      }
    } catch (e) {
      // Best-effort; ignore failures and continue rendering
      // Auto-expire sweep failed - ignore
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
        poolWarrantyMonths: r.pool_warranty_months || undefined,
        refundAmount: r.refund_amount || undefined,
        refundAt: r.refund_at ? new Date(r.refund_at) : undefined,
        refundReason: r.refund_reason || undefined,
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

          // UI resilience: if profiles are empty but we can infer links from orders
          if (!!r.is_account_based && profiles.length === 0 && (r.total_slots || 0) > 0) {
            // Try to find linked orders by searching through orders table
            // This is a fallback for display purposes only
            const linkedOrders = Database.getOrders().filter((order: any) =>
              order.inventoryProfileIds && Array.isArray(order.inventoryProfileIds) &&
              order.inventoryProfileIds.some((profileId: string) =>
                profileId.startsWith('slot-') && parseInt(profileId.split('-')[1]) <= (r.total_slots || 0)
              )
            );

            if (linkedOrders.length > 0) {
              // Generate profiles with inferred assignments
              return Array.from({ length: r.total_slots || 0 }, (_, idx) => {
                const slotId = `slot-${idx + 1}`;
                const linkedOrder = linkedOrders.find((order: any) =>
                  order.inventoryProfileIds && order.inventoryProfileIds.includes(slotId)
                );

                return {
                  id: slotId,
                  label: `Slot ${idx + 1}`,
                  isAssigned: !!linkedOrder,
                  assignedOrderId: linkedOrder?.id,
                  assignedAt: linkedOrder?.createdAt,
                  expiryAt: linkedOrder?.expiryDate
                };
              });
            }
          }

          return profiles;
        })(),
        linkedOrderId: r.linked_order_id || undefined,
        previousLinkedOrderId: r.previous_linked_order_id || undefined,
        isActive: r.is_active !== false, // default to true if not set
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

  // Initialize from URL once
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q') || '';
      const status = params.get('status') || '';
      const paymentStatus = params.get('paymentStatus') || '';
      const product = params.get('product') || '';
      const packageId = params.get('package') || '';
      const from = params.get('from') || '';
      const to = params.get('to') || '';
      const expiry = (params.get('expiry') as 'EXPIRING' | 'EXPIRED' | 'ACTIVE' | '' | null) || '';
      const accounts = params.get('accounts') === '1';
      const free = params.get('free') === '1';
      const p = parseInt(params.get('page') || '1', 10);
      const l = parseInt((params.get('limit') || localStorage.getItem('warehouseList.limit') || '10'), 10);

      // Update all states in a batch to avoid timing issues
      setSearchTerm(q);
      setDebouncedSearchTerm(q);
      setFilterStatus(status);
      setFilterPaymentStatus(paymentStatus);
      setFilterProduct(product);
      setFilterPackage(packageId);
      setDateFrom(from);
      setDateTo(to);
      setExpiryFilter(expiry);
      setOnlyAccounts(accounts);
      setOnlyFreeSlots(free);
      setPage(!Number.isNaN(p) && p > 0 ? p : 1);
      if (!Number.isNaN(l) && l > 0) setLimit(l);
    } catch (e) {
      // WarehouseList: Error reading URL params - ignore
    }
  }, []);

  // Re-read URL parameters after a short delay (for lazy loading and app:search events)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const params = new URLSearchParams(window.location.search);
        const status = params.get('status') || '';
        const paymentStatus = params.get('paymentStatus') || '';
        const product = params.get('product') || '';
        const packageId = params.get('package') || '';
        const source = params.get('source') || '';
        const from = params.get('from') || '';
        const to = params.get('to') || '';
        const expiry = (params.get('expiry') as 'EXPIRING' | 'EXPIRED' | 'ACTIVE' | '' | null) || '';
        const accounts = params.get('accounts') === '1';
        const free = params.get('free') === '1';
        const p = parseInt(params.get('page') || '1', 10);

        // Only update if values are different to avoid infinite loops
        if (status !== filterStatus) setFilterStatus(status);
        if (paymentStatus !== filterPaymentStatus) setFilterPaymentStatus(paymentStatus);
        if (product !== filterProduct) setFilterProduct(product);
        if (packageId !== filterPackage) setFilterPackage(packageId);
        if (source !== filterSource) setFilterSource(source);
        if (from !== dateFrom) setDateFrom(from);
        if (to !== dateTo) setDateTo(to);
        if (expiry !== expiryFilter) setExpiryFilter(expiry);
        if (accounts !== onlyAccounts) setOnlyAccounts(accounts);
        if (free !== onlyFreeSlots) setOnlyFreeSlots(free);
        if (p !== page) setPage(p);
      } catch { }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    refresh();
  }, []);

  // Listen for packages updates from PackageForm
  useEffect(() => {
    const handlePackagesUpdate = () => {
      refresh();
    };

    window.addEventListener('packagesUpdated', handlePackagesUpdate);
    return () => window.removeEventListener('packagesUpdated', handlePackagesUpdate);
  }, []);

  // Listen for view warehouse events from notifications
  useEffect(() => {
    const handleViewWarehouse = (e: any) => {
      const inventoryId = e.detail;
      const found = items.find(item => item.id === inventoryId);
      if (found) {
        setViewingInventory(found);
      }
    };

    window.addEventListener('app:viewWarehouse', handleViewWarehouse as any);
    return () => {
      window.removeEventListener('app:viewWarehouse', handleViewWarehouse as any);
    };
  }, [items]);

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
    return () => { try { ch.unsubscribe(); } catch { } };
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Reset page on filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchTerm, filterStatus, filterPaymentStatus, filterProduct, filterPackage, filterSource, dateFrom, dateTo, expiryFilter, onlyAccounts, onlyFreeSlots]);

  // Persist limit
  useEffect(() => {
    try { localStorage.setItem('warehouseList.limit', String(limit)); } catch { }
  }, [limit]);

  // Sync URL
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (debouncedSearchTerm) params.set('q', debouncedSearchTerm); else params.delete('q');
      if (filterStatus) params.set('status', filterStatus); else params.delete('status');
      if (filterPaymentStatus) params.set('paymentStatus', filterPaymentStatus); else params.delete('paymentStatus');
      if (filterProduct) params.set('product', filterProduct); else params.delete('product');
      if (filterPackage) params.set('package', filterPackage); else params.delete('package');
      if (filterSource) params.set('source', filterSource); else params.delete('source');
      if (dateFrom) params.set('from', dateFrom); else params.delete('from');
      if (dateTo) params.set('to', dateTo); else params.delete('to');
      if (expiryFilter) params.set('expiry', expiryFilter); else params.delete('expiry');
      params.set('accounts', onlyAccounts ? '1' : '0');
      params.set('free', onlyFreeSlots ? '1' : '0');
      params.set('page', String(page));
      params.set('limit', String(limit));
      const s = params.toString();
      const url = `${window.location.pathname}${s ? `?${s}` : ''}`;
      window.history.replaceState(null, '', url);
    } catch { }
  }, [debouncedSearchTerm, filterStatus, filterPaymentStatus, filterProduct, filterPackage, filterSource, dateFrom, dateTo, expiryFilter, onlyAccounts, onlyFreeSlots, page, limit]);

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

  const getInventoryPaymentLabel = (value: InventoryPaymentStatus | undefined) => {
    return INVENTORY_PAYMENT_STATUSES_FULL.find(p => p.value === value)?.label || 'Chưa thanh toán';
  };

  const getInventoryDisplayPaymentStatus = (item: InventoryItem | null | undefined): InventoryPaymentStatus => {
    if (!item) return 'UNPAID';
    // If refunded, always show REFUNDED
    if (item.paymentStatus === 'REFUNDED') return 'REFUNDED';
    if ((item.paymentStatus || 'UNPAID') !== 'PAID') {
      return 'UNPAID';
    }
    const renewals = renewalsByInventory.get(item.id) || [];
    const hasUnpaidRenewal = renewals.some(r => (r.paymentStatus || 'UNPAID') !== 'PAID');
    return hasUnpaidRenewal ? 'UNPAID' : 'PAID';
  };

  const getInventoryPaymentClass = (status: InventoryPaymentStatus | undefined) => {
    if (status === 'REFUNDED') return 'status-refunded';
    return status === 'PAID' ? 'status-completed' : 'status-cancelled';
  };

  const buildFullOrderInfo = (order: Order): { lines: string[]; text: string } => {
    const baseLines: string[] = [];
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
    const text = baseLines.join('\n');
    return { lines: baseLines, text };
  };

  const EXPIRY_SOON_WINDOW_MS = 7 * 24 * 3600 * 1000;

  const getExpiryTimestamp = (date: Date | string) => {
    const normalized = normalizeExpiryDate(date);
    return normalized ? normalized.getTime() : null;
  };

  const deriveBaseStatus = (item: InventoryItem) => {
    // If item is refunded, always show EXPIRED status
    if (item.paymentStatus === 'REFUNDED') {
      return 'EXPIRED';
    }

    // For account-based items, compute status from profiles only (ignore expiry override here)
    if (item.isAccountBased || packages.find(p => p.id === item.packageId)?.isAccountBased) {
      const profiles = Array.isArray(item.profiles) ? item.profiles : [];
      const totalSlots = item.totalSlots || profiles.length;

      if (totalSlots === 0) return item.status;

      const hasFreeSlot = profiles.some((p: any) => !p.isAssigned && !p.needsUpdate);

      if (profiles.length === 0) {
        return 'AVAILABLE';
      }

      if (!profiles.some((p: any) => p.isAssigned)) {
        return 'AVAILABLE';
      }

      if (!hasFreeSlot) {
        return 'SOLD';
      }
      return 'AVAILABLE';
    }

    // Regular inventory: fall back to stored status (but clear legacy EXPIRED flag)
    if (item.status === 'EXPIRED') return 'AVAILABLE';
    return item.status;
  };

  const getActualStatus = (item: InventoryItem) => {
    const expiryTs = getExpiryTimestamp(item.expiryDate);
    if (expiryTs !== null && expiryTs < Date.now()) {
      return 'EXPIRED';
    }
    return deriveBaseStatus(item);
  };

  const isExpiringSoon = (i: InventoryItem) => {
    const expiryTs = getExpiryTimestamp(i.expiryDate);
    if (expiryTs === null) return false;
    const now = Date.now();
    if (expiryTs <= now) return false;
    return expiryTs - now <= EXPIRY_SOON_WINDOW_MS;
  };

  // Round down to nearest 1000đ for refund amount
  const roundDownToThousand = (value: number) => {
    return Math.max(0, Math.floor(value / 1000) * 1000);
  };

  // Calculate refund amount for warehouse based on remaining time
  // For warehouses with renewals, use the most recent renewal period
  const computeWarehouseRefundAmount = (item: InventoryItem, errorDateStr: string) => {
    const errorDate = new Date(errorDateStr);
    if (isNaN(errorDate.getTime())) return 0;

    // Get renewals for this item, sorted by createdAt descending (newest first)
    const itemRenewals = inventoryRenewals
      .filter(r => r.inventoryId === item.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    let periodStart: Date;
    let periodEnd: Date;
    let periodPrice: number;

    if (itemRenewals.length > 0) {
      // Use the most recent renewal period
      const latestRenewal = itemRenewals[0];
      periodStart = new Date(latestRenewal.previousExpiryDate);
      periodEnd = new Date(latestRenewal.newExpiryDate);
      periodPrice = latestRenewal.amount || 0;
    } else {
      // No renewals - use original purchase period
      periodStart = new Date(item.purchaseDate);
      periodEnd = new Date(item.expiryDate);
      periodPrice = item.purchasePrice || 0;
    }

    if (!periodPrice) return 0;
    if (errorDate <= periodStart) return roundDownToThousand(periodPrice);
    if (errorDate >= periodEnd) return 0;

    const totalDays = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)));
    const remainingDays = Math.max(0, Math.ceil((periodEnd.getTime() - errorDate.getTime()) / (1000 * 60 * 60 * 24)));
    const prorate = remainingDays / totalDays;
    return roundDownToThousand(Math.round(periodPrice * prorate));
  };

  // Base filtered list (without product/package filters) - used to determine available filter options
  const baseFilteredItems = useMemo(() => {
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
          return (
            (o.code || '').toLowerCase().includes(norm) ||
            customerNameLower.includes(norm) ||
            productNameLower.includes(norm) ||
            packageNameLower.includes(norm) ||
            detailsLower.includes(norm) ||
            notesLower.includes(norm)
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

      // Always use getActualStatus() for status filtering (except NEEDS_UPDATE)
      // This ensures expired warehouses are not shown when filtering by SOLD, AVAILABLE, etc.
      const matchesStatus = !filterStatus || (
        filterStatus === 'NEEDS_UPDATE'
          ? (i.status === 'NEEDS_UPDATE' || (Array.isArray(i.profiles) && i.profiles.some((p: any) => p.needsUpdate)))
          : getActualStatus(i) === filterStatus
      );
      const matchesPaymentStatus = !filterPaymentStatus || getInventoryDisplayPaymentStatus(i) === filterPaymentStatus as InventoryPaymentStatus;
      const normalizedSource = (i.sourceNote || '').trim().toLowerCase();
      const matchesSource = !filterSource || normalizedSource.includes(filterSource);

      const pFromOk = !dateFrom || new Date(i.purchaseDate) >= new Date(dateFrom);
      const pToOk = !dateTo || new Date(i.purchaseDate) <= new Date(dateTo);

      // Expiry bucket filter (giống OrderList: Tất cả hạn dùng)
      if (expiryFilter) {
        const expiryTs = getExpiryTimestamp(i.expiryDate);
        const nowTs = Date.now();
        if (expiryTs !== null) {
          const daysToExpiry = Math.ceil((expiryTs - nowTs) / 86400000);
          const isExpired = expiryTs < nowTs;
          const isExpiring = daysToExpiry >= 0 && daysToExpiry <= 7;
          const isActive = expiryTs >= nowTs && daysToExpiry > 7;
          const matchesExpiry =
            (expiryFilter === 'EXPIRED' && isExpired) ||
            (expiryFilter === 'EXPIRING' && isExpiring) ||
            (expiryFilter === 'ACTIVE' && isActive);
          if (!matchesExpiry) return false;
        } else {
          // Không có hạn thì không match bất kỳ bucket nào khi đang lọc
          return false;
        }
      }

      const pkg = packages.find(p => p.id === i.packageId) as any;
      const isAcc = !!(i.isAccountBased || pkg?.isAccountBased);
      const hasFree = isAcc ? ((i.totalSlots || 0) - (i.profiles || []).filter(p => p.isAssigned).length) > 0 : false;
      const accountsOk = !onlyAccounts || isAcc;
      const freeOk = !onlyFreeSlots || hasFree;

      // Active status filter
      const matchesActiveStatus = !filterActiveStatus || (
        filterActiveStatus === 'ACTIVE' ? (i.isActive !== false) : (i.isActive === false)
      );

      return matchesSearch && matchesStatus && matchesPaymentStatus && matchesSource && pFromOk && pToOk && accountsOk && freeOk && matchesActiveStatus;
    });
  }, [items, filterStatus, filterPaymentStatus, filterSource, debouncedSearchTerm, dateFrom, dateTo, expiryFilter, productMap, packageMap, onlyAccounts, onlyFreeSlots, packages, customerMap, filterActiveStatus]);

  // Extract available products, packages, and sources from base filtered list
  // Products: if package filter is set, only show products that have that package
  const availableProducts = useMemo(() => {
    const productSet = new Set<string>();
    baseFilteredItems.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        // If package filter is set, only include products that have that package
        if (filterPackage) {
          const pkg = packages.find(p => p.id === filterPackage);
          if (pkg && pkg.productId === product.id) {
            productSet.add(product.id);
          }
        } else {
          productSet.add(product.id);
        }
      }
    });
    return Array.from(productSet).map(id => products.find(p => p.id === id)).filter(Boolean) as Product[];
  }, [baseFilteredItems, products, packages, filterPackage]);

  // Sources: unique non-empty sourceNote from base filtered list (case-insensitive),
  // further constrained by current product/package filters so it reflects the visible list
  const availableSources = useMemo(() => {
    const sourceMap = new Map<string, string>(); // key: normalized (lowercase), value: original label
    baseFilteredItems.forEach(item => {
      // Respect current product/package filters when building source options
      if (filterProduct && item.productId !== filterProduct) return;
      if (filterPackage && item.packageId !== filterPackage) return;

      const raw = (item.sourceNote || '').trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      if (!sourceMap.has(key)) {
        sourceMap.set(key, raw);
      }
    });
    return Array.from(sourceMap.values()).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [baseFilteredItems, filterProduct, filterPackage]);

  // Packages: if product filter is set, only show packages from that product
  const availablePackages = useMemo(() => {
    const packageSet = new Set<string>();
    baseFilteredItems.forEach(item => {
      const pkg = packages.find(p => p.id === item.packageId);
      if (pkg) {
        // If product filter is set, only include packages from that product
        if (filterProduct) {
          if (pkg.productId === filterProduct) {
            packageSet.add(pkg.id);
          }
        } else {
          packageSet.add(pkg.id);
        }
      }
    });
    return Array.from(packageSet).map(id => packages.find(p => p.id === id)).filter(Boolean) as ProductPackage[];
  }, [baseFilteredItems, packages, filterProduct]);

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

  const filteredItems = useMemo(() => {
    const norm = debouncedSearchTerm.trim().toLowerCase();

    // WarehouseList: Filtering items

    const filtered = items.filter(i => {
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
          return (
            (o.code || '').toLowerCase().includes(norm) ||
            customerNameLower.includes(norm) ||
            productNameLower.includes(norm) ||
            packageNameLower.includes(norm) ||
            detailsLower.includes(norm) ||
            notesLower.includes(norm)
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

      // Always use getActualStatus() for status filtering (except NEEDS_UPDATE)
      // This ensures expired warehouses are not shown when filtering by SOLD, AVAILABLE, etc.
      const matchesStatus = !filterStatus || (
        filterStatus === 'NEEDS_UPDATE'
          ? (i.status === 'NEEDS_UPDATE' || (Array.isArray(i.profiles) && i.profiles.some((p: any) => p.needsUpdate)))
          : getActualStatus(i) === filterStatus
      );
      const matchesPaymentStatus = !filterPaymentStatus || getInventoryDisplayPaymentStatus(i) === filterPaymentStatus as InventoryPaymentStatus;
      const normalizedSource = (i.sourceNote || '').trim().toLowerCase();
      const matchesSource = !filterSource || normalizedSource.includes(filterSource);

      const pFromOk = !dateFrom || new Date(i.purchaseDate) >= new Date(dateFrom);
      const pToOk = !dateTo || new Date(i.purchaseDate) <= new Date(dateTo);

      // Expiry bucket filter (giống OrderList: Tất cả hạn dùng)
      if (expiryFilter) {
        const expiryTs = getExpiryTimestamp(i.expiryDate);
        const nowTs = Date.now();
        if (expiryTs !== null) {
          const daysToExpiry = Math.ceil((expiryTs - nowTs) / 86400000);
          const isExpired = expiryTs < nowTs;
          const isExpiring = daysToExpiry >= 0 && daysToExpiry <= 7;
          const isActive = expiryTs >= nowTs && daysToExpiry > 7;
          const matchesExpiry =
            (expiryFilter === 'EXPIRED' && isExpired) ||
            (expiryFilter === 'EXPIRING' && isExpiring) ||
            (expiryFilter === 'ACTIVE' && isActive);
          if (!matchesExpiry) return false;
        } else {
          return false;
        }
      }

      const pkg = packages.find(p => p.id === i.packageId) as any;
      const isAcc = !!(i.isAccountBased || pkg?.isAccountBased);
      const hasFree = isAcc ? ((i.totalSlots || 0) - (i.profiles || []).filter(p => p.isAssigned).length) > 0 : false;
      const accountsOk = !onlyAccounts || isAcc;
      const freeOk = !onlyFreeSlots || hasFree;

      // Product filter
      if (filterProduct && i.productId !== filterProduct) return false;

      // Package filter
      if (filterPackage && i.packageId !== filterPackage) return false;

      // Active status filter
      const matchesActiveStatus = !filterActiveStatus || (
        filterActiveStatus === 'ACTIVE' ? (i.isActive !== false) : (i.isActive === false)
      );

      return matchesSearch && matchesStatus && matchesPaymentStatus && matchesSource && pFromOk && pToOk && accountsOk && freeOk && matchesActiveStatus;
    });

    // WarehouseList: Filtered results

    return filtered;
  }, [items, filterStatus, filterPaymentStatus, filterSource, filterProduct, filterPackage, debouncedSearchTerm, dateFrom, dateTo, expiryFilter, productMap, packageMap, onlyAccounts, onlyFreeSlots, packages, filterActiveStatus]);

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
  const deletablePageIds = pageItems.filter(i => canDeleteInventoryItem(i)).map(i => i.id);

  // Calculate total purchasePrice for selected items (similar to OrderList)
  const getSelectedTotal = useMemo(() => {
    let sum = 0;
    for (const id of selectedIds) {
      const item = items.find(i => i.id === id);
      if (!item) continue;
      sum += item.purchasePrice || 0;
    }
    return sum;
  }, [selectedIds, items]);

  const exportInventoryXlsx = (items: InventoryItem[], filename: string) => {
    const rows = items.map((i, idx) => {
      const product = products.find(p => p.id === i.productId);
      const packageInfo = packages.find(p => p.id === i.packageId);
      const linkedOrder = i.linkedOrderId ? Database.getOrders().find(o => o.id === i.linkedOrderId) : null;
      const linkedCustomer = linkedOrder ? customers.find(c => c.id === linkedOrder.customerId) : null;

      // Build account data info
      const accountDataInfo = i.accountData ? Object.entries(i.accountData).map(([key, value]) => `${key}: ${value}`).join('; ') : '';

      // Build profiles info
      const profilesInfo = i.profiles?.map(p => `${p.label}: ${p.isAssigned ? 'Đã gán' : 'Trống'}`).join('; ') || '';

      // Build renewal history (placeholder - renewals not available in InventoryItem)
      const renewalHistory = '';

      const isAcc = (i.isAccountBased || packageInfo?.isAccountBased);
      const used = (i.profiles || []).filter(p => p.isAssigned).length;
      const totalSlots = i.totalSlots || 0;

      return {
        // Basic info
        code: i.code || `KHO${idx + 1}`,
        productName: product?.name || 'Không xác định',
        productCode: product?.code || '',
        productDescription: product?.description || '',
        packageName: packageInfo?.name || 'Không xác định',
        packageCode: packageInfo?.code || '',

        // Dates
        purchaseDate: new Date(i.purchaseDate).toLocaleDateString('vi-VN'),
        expiryDate: new Date(i.expiryDate).toLocaleDateString('vi-VN'),
        purchaseDateRaw: i.purchaseDate.toISOString().split('T')[0],
        expiryDateRaw: i.expiryDate.toISOString().split('T')[0],

        // Warranty info
        warrantyMonths: (() => {
          if (product?.sharedInventoryPool) {
            return i.poolWarrantyMonths ? `${i.poolWarrantyMonths} tháng` : '-';
          }
          return packageInfo?.warrantyPeriod ? `${packageInfo.warrantyPeriod} tháng` : '-';
        })(),
        warrantyMonthsValue: product?.sharedInventoryPool ? (i.poolWarrantyMonths || 0) : (packageInfo?.warrantyPeriod || 0),
        isSharedPool: product?.sharedInventoryPool ? 'Có' : 'Không',

        // Source info
        sourceNote: i.sourceNote || '',
        supplierName: i.supplierName || '',
        supplierId: i.supplierId || '',
        currency: i.currency || '',

        // Pricing
        purchasePrice: i.purchasePrice || 0,
        paymentStatus: getInventoryPaymentLabel(getInventoryDisplayPaymentStatus(i)),
        paymentStatusValue: getInventoryDisplayPaymentStatus(i),

        // Product info
        productInfo: i.productInfo || '',
        notes: i.notes || '',
        status: i.status,

        // Account-based info
        isAccountBased: isAcc ? 'Có' : 'Không',
        isAccountBasedValue: isAcc,
        accountColumns: i.accountColumns?.map(col => col.title).join('; ') || '',
        accountColumnsCount: i.accountColumns?.length || 0,
        accountData: accountDataInfo,
        totalSlots: totalSlots,
        usedSlots: used,
        freeSlots: totalSlots - used,
        slotsInfo: isAcc ? `${used}/${totalSlots}` : '-',
        profiles: profilesInfo,

        // Linked order info
        linkedOrderCode: linkedOrder?.code || '',
        linkedCustomerName: linkedCustomer?.name || '',
        linkedCustomerCode: linkedCustomer?.code || '',
        previousLinkedOrderId: i.previousLinkedOrderId || '',

        // Renewal info
        renewalHistory: renewalHistory,
        renewalCount: 0,

        // System info
        createdAt: new Date(i.createdAt).toLocaleDateString('vi-VN'),
        updatedAt: new Date(i.updatedAt).toLocaleDateString('vi-VN'),
        createdAtRaw: i.createdAt.toISOString(),
        updatedAtRaw: i.updatedAt.toISOString(),

        // Active status
        isActive: i.isActive !== false ? 'Active' : 'Not Active',
        isActiveValue: i.isActive !== false,
      };
    });

    exportToXlsx(rows, [
      // Basic info
      { header: 'Mã kho', key: 'code', width: 14 },
      { header: 'Tên sản phẩm', key: 'productName', width: 24 },
      { header: 'Mã sản phẩm', key: 'productCode', width: 16 },
      { header: 'Mô tả sản phẩm', key: 'productDescription', width: 30 },
      { header: 'Tên gói', key: 'packageName', width: 20 },
      { header: 'Mã gói', key: 'packageCode', width: 16 },

      // Source
      { header: 'Nguồn', key: 'sourceNote', width: 20 },

      // Dates
      { header: 'Ngày nhập', key: 'purchaseDate', width: 14 },
      { header: 'Ngày hết hạn', key: 'expiryDate', width: 14 },

      // Warranty info
      { header: 'Thời hạn bảo hành', key: 'warrantyMonths', width: 16 },
      { header: 'Thời hạn (tháng)', key: 'warrantyMonthsValue', width: 14 },
      { header: 'Kho chung', key: 'isSharedPool', width: 12 },

      // Supplier info
      { header: 'Nhà cung cấp', key: 'supplierName', width: 20 },
      { header: 'Mã nhà cung cấp', key: 'supplierId', width: 16 },
      { header: 'Tiền tệ', key: 'currency', width: 10 },

      // Pricing
      { header: 'Giá nhập', key: 'purchasePrice', width: 14 },
      { header: 'Trạng thái thanh toán', key: 'paymentStatus', width: 16 },
      { header: 'Trạng thái thanh toán (giá trị)', key: 'paymentStatusValue', width: 20 },

      // Product info
      { header: 'Thông tin sản phẩm', key: 'productInfo', width: 50 },
      { header: 'Ghi chú', key: 'notes', width: 32 },
      { header: 'Trạng thái', key: 'status', width: 14 },

      // Account-based info
      { header: 'Dạng tài khoản', key: 'isAccountBased', width: 14 },
      { header: 'Dạng tài khoản (giá trị)', key: 'isAccountBasedValue', width: 18 },
      { header: 'Cột tài khoản', key: 'accountColumns', width: 30 },
      { header: 'Số cột tài khoản', key: 'accountColumnsCount', width: 16 },
      { header: 'Dữ liệu tài khoản', key: 'accountData', width: 40 },
      { header: 'Tổng slot', key: 'totalSlots', width: 10 },
      { header: 'Slot đã dùng', key: 'usedSlots', width: 12 },
      { header: 'Slot trống', key: 'freeSlots', width: 10 },
      { header: 'Thông tin slot', key: 'slotsInfo', width: 12 },
      { header: 'Chi tiết profile', key: 'profiles', width: 40 },

      // Linked order info
      { header: 'Mã đơn liên kết', key: 'linkedOrderCode', width: 16 },
      { header: 'Tên khách liên kết', key: 'linkedCustomerName', width: 20 },
      { header: 'Mã khách liên kết', key: 'linkedCustomerCode', width: 16 },
      { header: 'Đơn liên kết trước', key: 'previousLinkedOrderId', width: 18 },

      // Renewal info
      { header: 'Lịch sử gia hạn', key: 'renewalHistory', width: 40 },
      { header: 'Số lần gia hạn', key: 'renewalCount', width: 14 },

      // System info
      { header: 'Ngày tạo', key: 'createdAt', width: 14 },
      { header: 'Ngày cập nhật', key: 'updatedAt', width: 14 },

      // Active status
      { header: 'Trạng thái Active', key: 'isActive', width: 14 },
    ], filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, 'Kho hàng');
  };

  const toggleSelectAll = (checked: boolean, ids: string[]) => {
    if (checked) {
      setSelectedIds(prev => Array.from(new Set([...prev, ...ids])));
    } else {
      setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
    }
  };
  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds(prev => checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id));
  };
  const bulkDelete = () => {
    const deletable = pageItems.filter(i => selectedIds.includes(i.id) && canDeleteInventoryItem(i)).map(i => i.id);
    const blocked = pageItems.filter(i => selectedIds.includes(i.id) && !canDeleteInventoryItem(i)).map(i => i.id);
    if (blocked.length > 0) {
      notify(`${blocked.length} kho chưa thể xóa (còn slot hoặc đang liên kết)`, 'warning');
      setSelectedIds(prev => prev.filter(id => !blocked.includes(id)));
    }
    if (deletable.length === 0) return;
    setConfirmState({
      message: `Xóa ${deletable.length} mục kho (chỉ kho trống & không slot đang dùng)?`,
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
            const codes = deletable.map(id => pageItems.find(i => i.id === id)?.code).filter(Boolean);
            if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Xóa hàng loạt kho', details: `codes=${codes.join(',')}` });
          } catch { }
          setSelectedIds(prev => prev.filter(id => !deletable.includes(id)));
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
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Gỡ liên kết kho hàng loạt', details: `codes=${unlinkables.map(id => items.find(i => i.id === id)?.code).filter(Boolean).join(',')}` });
        } catch { }
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
    setBulkPaymentTarget('INITIAL');
    setSelectedRenewalIds([]);
    setPaymentStatusModal({ selectedIds: selectedItems.map(i => i.id) });
  };

  const remove = (id: string) => {
    const target = items.find(i => i.id === id);
    const reason = getDeleteBlockedReason(target);
    if (reason) {
      notify(reason, 'warning');
      return;
    }
    setConfirmState({
      message: 'Xóa mục này khỏi kho?',
      onConfirm: async () => {
        const sb = getSupabase();
        if (!sb) return notify('Không thể xóa mục này khỏi kho', 'error');
        const snapshot = items.find(i => i.id === id) || null;
        const { data: latest } = await sb
          .from('inventory')
          .select('id, status, linked_order_id, is_account_based, profiles')
          .eq('id', id)
          .maybeSingle();
        if (latest) {
          const normalized = {
            ...(snapshot || {} as InventoryItem),
            id: latest.id,
            status: latest.status,
            linkedOrderId: latest.linked_order_id || undefined,
            isAccountBased: latest.is_account_based,
            profiles: Array.isArray(latest.profiles) ? latest.profiles : snapshot?.profiles
          } as InventoryItem;
          const latestReason = getDeleteBlockedReason(normalized);
          if (latestReason) {
            notify(latestReason, 'error');
            refresh();
            return;
          }
        }
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
            if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Xóa khỏi kho', details: `inventoryId=${id}; inventoryCode=${snapshot?.code || ''}; productId=${snapshot?.productId || ''}; packageId=${snapshot?.packageId || ''}; productInfo=${snapshot?.productInfo || ''}` });
          } catch { }
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
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Gỡ liên kết kho khỏi đơn', details: `inventoryId=${id}; inventoryCode=${inv.code || ''}; orderId=${inv.linkedOrderId}` });
        } catch { }
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
    // Mặc định lần gia hạn kho luôn là chưa thanh toán, không lấy theo trạng thái hiện tại
    setRenewalDialog({ id, months: defaultMonths, amount: 0, note: '', paymentStatus: 'UNPAID' });
  };

  const bulkRenewal = () => {
    const renewables = pageItems.filter(i => selectedIds.includes(i.id));
    if (renewables.length === 0) return;
    setBulkRenewalDialog({ ids: renewables.map(i => i.id), months: 1, amount: 0, note: '', paymentStatus: 'UNPAID' });
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

    // Check if this item has any linked orders (for clickable behavior)
    const isAccountBased = item.isAccountBased || ((packages.find(p => p.id === item.packageId) || {}) as any).isAccountBased;
    const profiles = Array.isArray(item.profiles) ? item.profiles : [];
    const hasAssignedSlots = profiles.some((p: any) => p.isAssigned || p.assignedOrderId);
    const hasLinkedOrder = item.linkedOrderId || hasAssignedSlots;

    // If no linked orders/assigned slots, return non-clickable badge
    if (!hasLinkedOrder) return content;

    // For account-based inventory with assigned slots, open profiles modal
    if (isAccountBased && hasAssignedSlots) {
      return (
        <button
          className="btn btn-sm btn-light"
          title="Xem danh sách slot"
          onClick={() => setProfilesModal({ item })}
        >
          {statusLabel(actualStatus)}
        </button>
      );
    }

    // For classic inventory with linked orders, view linked orders
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
                notes: r.notes,
                inventoryItemId: r.inventory_item_id,
                inventoryProfileIds: r.inventory_profile_ids || undefined,
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
    setFilterStatus('');
    setFilterPaymentStatus('');
    setFilterProduct('');
    setFilterPackage('');
    setFilterSource('');
    setDateFrom('');
    setDateTo('');
    setExpiryFilter('');
    setOnlyAccounts(false);
    setOnlyFreeSlots(false);
    setFilterActiveStatus('');
    setPage(1);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="d-flex justify-content-between align-items-center">
          <h2 className="card-title">Danh sách kho hàng</h2>
          <div className="d-flex gap-2">
            {!isMobile && (
              <>
                <button className="btn btn-light" onClick={() => {
                  const filename = generateExportFilename('KhoHang', {
                    searchTerm: debouncedSearchTerm,
                    filterStatus,
                    filterPaymentStatus,
                    dateFrom,
                    dateTo,
                    onlyAccounts,
                    onlyFreeSlots
                  }, 'KetQuaLoc');
                  exportInventoryXlsx(filteredItems, filename);
                }}>Xuất Excel (kết quả đã lọc)</button>
              </>
            )}
            {expiryMismatchItems.length > 0 && (
              <button className="btn btn-warning" onClick={fixExpiryMismatches} title="Cập nhật hạn sử dụng dựa trên lịch sử gia hạn">
                🔧 Fix hạn kho ({expiryMismatchItems.length})
              </button>
            )}
            {hasStuckSlots && (
              <button className="btn btn-warning" onClick={fixOrphanedSlots} title="Fix các slot kho hàng bị kẹt">
                🔧 Fix Slot Bị Kẹt
              </button>
            )}
            {selectedIds.length > 0 && !isMobile && (
              <>
                <span className="badge bg-primary">Đã chọn: {selectedIds.length}</span>
                <span className="badge bg-info">Tổng tiền: {formatPrice(getSelectedTotal)}</span>
                <button className="btn btn-success" onClick={bulkRenewal}>Gia hạn đã chọn</button>
                {!selectedIds.some(id => !canDeleteInventoryItem(items.find(i => i.id === id))) && (
                  <button className="btn btn-danger" onClick={bulkDelete}>Xóa đã chọn</button>
                )}
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
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="mb-3">
          <input
            type="text"
            className="form-control"
            placeholder="Tìm kiếm mã, sản phẩm, ghi chú..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8 }}>
          {/* Row 1: Product, Package, Source, Status */}
          <div>
            <select
              className="form-control"
              value={filterProduct}
              onChange={(e) => {
                const newProductId = e.target.value;
                setFilterProduct(newProductId);
                // Clear package filter only if current package doesn't belong to the new product
                if (newProductId && filterPackage) {
                  const currentPackage = packages.find(p => p.id === filterPackage);
                  if (currentPackage) {
                    if (currentPackage.productId !== newProductId) {
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
                  const newPackage = packages.find(p => p.id === newPackageId);
                  if (newPackage) {
                    if (newPackage.productId !== filterProduct) {
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
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
            >
              <option value="">Tất cả nguồn nhập</option>
              {availableSources.map(source => {
                const value = source.trim().toLowerCase();
                return (
                  <option key={value} value={value}>
                    {source}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Row 2: Status, Active Status, Payment, Expiry */}
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
            <select
              className="form-control"
              value={filterActiveStatus}
              onChange={(e) => setFilterActiveStatus(e.target.value as 'ACTIVE' | 'NOT_ACTIVE' | '')}
            >
              <option value="">Trạng thái Active</option>
              <option value="ACTIVE">Active</option>
              <option value="NOT_ACTIVE">Not Active</option>
            </select>
          </div>
          <div>
            <select className="form-control" value={filterPaymentStatus} onChange={(e) => setFilterPaymentStatus(e.target.value)}>
              <option value="">Thanh toán</option>
              {INVENTORY_PAYMENT_STATUSES_FULL.map(status => (
                <option key={status.value} value={status.value}>{status.label}</option>
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
              <option value="EXPIRING">Sắp hết hạn (≤ 7 ngày)</option>
              <option value="EXPIRED">Đã hết hạn</option>
              <option value="ACTIVE">Còn hạn (&gt; 7 ngày)</option>
            </select>
          </div>

          {/* Row 3: Slot type + Date Range */}
          <div>
            <select
              className="form-control"
              value={onlyAccounts ? 'ACCOUNTS' : (onlyFreeSlots ? 'FREE' : '')}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'ACCOUNTS') {
                  setOnlyAccounts(true);
                  setOnlyFreeSlots(false);
                } else if (val === 'FREE') {
                  setOnlyAccounts(false);
                  setOnlyFreeSlots(true);
                } else {
                  setOnlyAccounts(false);
                  setOnlyFreeSlots(false);
                }
              }}
            >
              <option value="">Tất cả loại slot</option>
              <option value="ACCOUNTS">Chỉ tài khoản nhiều slot</option>
              <option value="FREE">Chỉ còn slot trống</option>
            </select>
          </div>
          <div style={{ gridColumn: isMobile ? 'auto' : 'span 2' }}>
            <DateRangeInput
              label="Khoảng ngày nhập"
              from={dateFrom}
              to={dateTo}
              onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
            />
          </div>
          <div style={{ gridColumn: isMobile ? '1 / -1' : 'auto', display: 'flex', alignItems: 'center' }}>
            <button className="btn btn-light w-100" onClick={resetFilters}>Reset bộ lọc</button>
          </div>
        </div>
      </div>

      {
        filteredItems.length === 0 ? (
          <div className="text-center py-4">
            <p>Không có dữ liệu</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="warehouse-mobile">
              {pageItems.map((item, index) => (
                <div key={item.id} className="warehouse-card">
                  <div className="warehouse-card-header">
                    <div className="d-flex align-items-center gap-2">
                      <div className="warehouse-card-title">{item.code || `KHO${index + 1}`}</div>
                    </div>
                    <div className="warehouse-card-subtitle">{formatDate(item.purchaseDate)}</div>
                  </div>

                  <div className="warehouse-card-row">
                    <div className="warehouse-card-label">Sản phẩm</div>
                    <div className="warehouse-card-value">{productMap.get(item.productId) || item.productId}</div>
                  </div>
                  <div className="warehouse-card-row">
                    <div className="warehouse-card-label">Gói/Pool</div>
                    <div className="warehouse-card-value">{(() => {
                      const prod = products.find(p => p.id === item.productId);
                      if (prod?.sharedInventoryPool) {
                        return 'Pool chung';
                      }
                      return packageMap.get(item.packageId) || item.packageId;
                    })()}</div>
                  </div>
                  <div className="warehouse-card-row">
                    <div className="warehouse-card-label">Hết hạn</div>
                    <div className="warehouse-card-value">{formatDate(item.expiryDate)}</div>
                  </div>
                  <div className="warehouse-card-row">
                    <div className="warehouse-card-label">Thời hạn</div>
                    <div className="warehouse-card-value">{(() => {
                      const prod = products.find(p => p.id === item.productId);
                      if (prod?.sharedInventoryPool) {
                        return item.poolWarrantyMonths ? `${item.poolWarrantyMonths} tháng` : '-';
                      }
                      const pkg = packages.find(p => p.id === item.packageId);
                      return pkg ? `${pkg.warrantyPeriod} tháng` : '-';
                    })()}</div>
                  </div>
                  <div className="warehouse-card-row">
                    <div className="warehouse-card-label">Giá mua</div>
                    <div className="warehouse-card-value">{typeof item.purchasePrice === 'number' ? formatPrice(item.purchasePrice) : '-'}</div>
                  </div>
                  <div className="warehouse-card-row">
                    <div className="warehouse-card-label">Thanh toán</div>
                    <div className="warehouse-card-value">
                      {(() => {
                        const paymentStatus = getInventoryDisplayPaymentStatus(item);
                        return (
                          <span className={`status-badge ${getInventoryPaymentClass(paymentStatus)}`}>
                            {getInventoryPaymentLabel(paymentStatus)}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="warehouse-card-row">
                    <div className="warehouse-card-label">Trạng thái</div>
                    <div className="warehouse-card-value">
                      <div className="d-flex align-items-center gap-2">
                        {statusBadge(item)}
                        {item.status === 'NEEDS_UPDATE' && (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => setConfirmState({
                              message: `Chuyển ${item.code} từ Cần update -> Sẵn có?`,
                              onConfirm: async () => {
                                const sb = getSupabase();
                                if (!sb) { notify('Không thể cập nhật trạng thái', 'error'); return; }
                                const { error } = await sb.from('inventory').update({ status: 'AVAILABLE', previous_linked_order_id: null }).eq('id', item.id);
                                if (error) return notify('Không thể cập nhật trạng thái', 'error');
                                try {
                                  const sb2 = getSupabase();
                                  if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Đánh dấu kho cần update -> sẵn có', details: `inventoryId=${item.id}; inventoryCode=${item.code}` });
                                } catch { }
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
                    </div>
                  </div>
                  <div className="warehouse-card-row">
                    <div className="warehouse-card-label">Slot</div>
                    <div className="warehouse-card-value">
                      {(item.isAccountBased || ((packages.find(p => p.id === item.packageId) || {}) as any).isAccountBased) ? (() => {
                        const profiles = Array.isArray(item.profiles) ? item.profiles : [];
                        const total = item.totalSlots || 0;

                        // Count assigned slots from profiles
                        let used = profiles.filter(p => p.isAssigned).length;

                        // Fallback: if profiles are empty but we have linked orders, count from orders
                        if (profiles.length === 0 && total > 0) {
                          const linkedOrders = Database.getOrders().filter((order: any) =>
                            order.inventoryProfileIds && Array.isArray(order.inventoryProfileIds) &&
                            order.inventoryProfileIds.some((profileId: string) =>
                              profileId.startsWith('slot-') && parseInt(profileId.split('-')[1]) <= total
                            )
                          );

                          if (linkedOrders.length > 0) {
                            // Count unique slot IDs from all linked orders
                            const allSlotIds = new Set();
                            linkedOrders.forEach((order: any) => {
                              order.inventoryProfileIds.forEach((profileId: string) => {
                                if (profileId.startsWith('slot-') && parseInt(profileId.split('-')[1]) <= total) {
                                  allSlotIds.add(profileId);
                                }
                              });
                            });
                            used = allSlotIds.size;
                          }
                        }

                        return (
                          <button className="btn btn-sm btn-light" onClick={() => setProfilesModal({ item })}>
                            {used}/{total}
                          </button>
                        );
                      })() : '-'}
                    </div>
                  </div>

                  <div className="warehouse-card-actions">
                    <button className="btn btn-light" onClick={() => setViewingInventory(item)}>Xem</button>
                    <button className="btn btn-secondary" onClick={() => { setEditingItem(item); setShowForm(true); }}>Sửa</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="table-responsive warehouse-table">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 36, minWidth: 36, maxWidth: 36 }}>
                      <input
                        type="checkbox"
                        checked={pageItems.length > 0 && pageItems.every(i => selectedIds.includes(i.id))}
                        disabled={pageItems.length === 0}
                        onChange={(e) => toggleSelectAll(e.target.checked, pageItems.map(i => i.id))}
                      />
                    </th>
                    <th style={{ width: '80px', minWidth: '80px', maxWidth: '100px' }}>Mã kho</th>
                    <th style={{ width: '120px', minWidth: '120px', maxWidth: '150px' }}>Sản phẩm</th>
                    <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Gói / Pool</th>
                    <th style={{ width: '60px', minWidth: '60px', maxWidth: '80px' }}>Nguồn</th>
                    <th style={{ width: '80px', minWidth: '80px', maxWidth: '100px' }}>Ngày nhập</th>
                    <th style={{ width: '80px', minWidth: '80px', maxWidth: '100px' }}>Hết hạn</th>
                    <th style={{ width: '80px', minWidth: '80px', maxWidth: '100px' }}>Thời hạn</th>
                    <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Giá mua</th>
                    <th style={{ width: '80px', minWidth: '80px', maxWidth: '100px' }}>Thanh toán</th>
                    <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Trạng thái</th>
                    <th style={{ width: '60px', minWidth: '60px', maxWidth: '80px' }}>Active</th>
                    <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((i, index) => (
                    <tr key={i.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(i.id)}
                          onChange={(e) => toggleSelect(i.id, e.target.checked)}
                        />
                      </td>
                      <td className="text-truncate" title={i.code || `KHO${index + 1}`}>{i.code || `KHO${index + 1}`}</td>
                      <td className="text-truncate" title={productMap.get(i.productId) || i.productId}>{productMap.get(i.productId) || i.productId}</td>
                      <td className="text-truncate" title={(() => {
                        const prod = products.find(p => p.id === i.productId);
                        if (prod?.sharedInventoryPool) {
                          return 'Pool chung';
                        }
                        return packageMap.get(i.packageId) || i.packageId;
                      })()}>{(() => {
                        const prod = products.find(p => p.id === i.productId);
                        if (prod?.sharedInventoryPool) {
                          return <span className="text-muted">Pool chung</span>;
                        }
                        return packageMap.get(i.packageId) || i.packageId;
                      })()}</td>
                      <td style={{ wordWrap: 'break-word', wordBreak: 'break-word', whiteSpace: 'normal' }} title={i.sourceNote || '-'}>{i.sourceNote || '-'}</td>
                      <td className="text-truncate" title={new Date(i.purchaseDate).toLocaleDateString('vi-VN')}>{new Date(i.purchaseDate).toLocaleDateString('vi-VN')}</td>
                      <td className="text-truncate" title={new Date(i.expiryDate).toLocaleDateString('vi-VN')}>{new Date(i.expiryDate).toLocaleDateString('vi-VN')}</td>
                      <td className="text-truncate" title={(() => {
                        const prod = products.find(p => p.id === i.productId);
                        if (prod?.sharedInventoryPool) {
                          return i.poolWarrantyMonths ? `${i.poolWarrantyMonths} tháng` : '-';
                        }
                        const pkg = packages.find(p => p.id === i.packageId);
                        return pkg ? `${pkg.warrantyPeriod} tháng` : '-';
                      })()}>{(() => {
                        const prod = products.find(p => p.id === i.productId);
                        if (prod?.sharedInventoryPool) {
                          return i.poolWarrantyMonths ? `${i.poolWarrantyMonths} tháng` : '-';
                        }
                        const pkg = packages.find(p => p.id === i.packageId);
                        return pkg ? `${pkg.warrantyPeriod} tháng` : '-';
                      })()}</td>
                      <td className="text-truncate" title={typeof i.purchasePrice === 'number' ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(i.purchasePrice) : '-'}>{typeof i.purchasePrice === 'number' ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(i.purchasePrice) : '-'}</td>
                      <td>
                        {(() => {
                          const paymentStatus = getInventoryDisplayPaymentStatus(i);
                          return (
                            <span className={`status-badge ${getInventoryPaymentClass(paymentStatus)}`}>
                              {getInventoryPaymentLabel(paymentStatus)}
                            </span>
                          );
                        })()}
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
                                  const { error } = await sb.from('inventory').update({ status: 'AVAILABLE', previous_linked_order_id: null }).eq('id', i.id);
                                  if (error) return notify('Không thể cập nhật trạng thái', 'error');
                                  try {
                                    const sb2 = getSupabase();
                                    if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Đánh dấu kho cần update -> sẵn có', details: `inventoryId=${i.id}; inventoryCode=${i.code}` });
                                  } catch { }
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
                        {i.isActive !== false ? (
                          <span style={{ color: '#28a745', fontSize: '16px', fontWeight: 'bold' }}>✓</span>
                        ) : (
                          <span style={{ color: '#dc3545', fontSize: '16px', fontWeight: 'bold' }}>✗</span>
                        )}
                      </td>
                      <td>
                        <div className="d-flex gap-2">
                          <button className="btn btn-light btn-sm" onClick={() => setViewingInventory(i)}>Xem</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setEditingItem(i); setShowForm(true); }}>Sửa</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      }

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

      {
        showForm && (
          <WarehouseForm key={editingItem?.id || 'new'} item={editingItem} onClose={() => { setShowForm(false); setEditingItem(null); }} onSuccess={() => { setShowForm(false); setEditingItem(null); refresh(); }} />
        )
      }

      {
        profilesModal && (
          <div className="modal" role="dialog" aria-modal>
            <div className="modal-content" style={{ maxWidth: 560 }}>
              <div className="modal-header">
                <h3 className="modal-title">Slots - {profilesModal.item.code}</h3>
                <button className="close" onClick={() => setProfilesModal(null)}>×</button>
              </div>
              <div className="mb-3">
                {(() => {
                  const item = items.find(x => x.id === profilesModal.item.id) || profilesModal.item;
                  let profiles = item.profiles || [];
                  const totalSlots = item.totalSlots || 0;

                  // If profiles are empty but we have totalSlots, generate fallback profiles from orders
                  if (profiles.length === 0 && totalSlots > 0) {
                    const linkedOrders = Database.getOrders().filter((order: any) =>
                      order.inventoryProfileIds && Array.isArray(order.inventoryProfileIds) &&
                      order.inventoryProfileIds.some((profileId: string) =>
                        profileId.startsWith('slot-') && parseInt(profileId.split('-')[1]) <= totalSlots
                      )
                    );

                    if (linkedOrders.length > 0) {
                      // Generate profiles with inferred assignments
                      profiles = Array.from({ length: totalSlots }, (_, idx) => {
                        const slotId = `slot-${idx + 1}`;
                        const linkedOrder = linkedOrders.find((order: any) =>
                          order.inventoryProfileIds && order.inventoryProfileIds.includes(slotId)
                        );

                        return {
                          id: slotId,
                          label: `Slot ${idx + 1}`,
                          isAssigned: !!linkedOrder,
                          assignedOrderId: linkedOrder?.id,
                          assignedAt: linkedOrder?.createdAt,
                          expiryAt: linkedOrder?.expiryDate
                        };
                      });
                    } else {
                      // Generate empty profiles
                      profiles = Array.from({ length: totalSlots }, (_, idx) => ({
                        id: `slot-${idx + 1}`,
                        label: `Slot ${idx + 1}`,
                        isAssigned: false
                      }));
                    }
                  }

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
                            const prevOrderId = (p as any).previousOrderId;
                            const prevOrder = prevOrderId ? Database.getOrders().find(o => o.id === prevOrderId) : null;

                            return (
                              <tr key={p.id}>
                                <td>{p.label}</td>
                                <td>{(() => {
                                  if (p.isAssigned) return 'Đang dùng';
                                  if ((p as any).needsUpdate && prevOrder) return `Trống (Cần update - trước: ${prevOrder.code})`;
                                  return (p as any).needsUpdate ? 'Trống (Cần update)' : 'Trống';
                                })()}</td>
                                <td>{order ? `${order.code}` : prevOrder ? `(Trước: ${prevOrder.code})` : '-'}</td>
                                <td>{(() => {
                                  if (!p.isAssigned && (p as any).needsUpdate) {
                                    return (
                                      <button className="btn btn-sm btn-primary" onClick={() => setConfirmState({
                                        message: `Đánh dấu slot "${p.label}" đã update?`,
                                        onConfirm: () => clearProfileNeedsUpdate(item.id, p.id)
                                      })}>Đã update</button>
                                    );
                                  }
                                  return order?.expiryDate
                                    ? new Date(order.expiryDate).toISOString().split('T')[0]
                                    : (p.expiryAt ? new Date(p.expiryAt).toISOString().split('T')[0] : '-');
                                })()}</td>
                                <td>
                                  <div className="d-flex gap-2">
                                    {order && (
                                      <button className="btn btn-sm btn-light" onClick={() => { setPreviousProfilesModal(profilesModal); setProfilesModal(null); setViewingOrder(order); }}>
                                        Xem đơn hàng
                                      </button>
                                    )}
                                    {!order && prevOrder && (
                                      <button className="btn btn-sm btn-light" onClick={() => { setPreviousProfilesModal(profilesModal); setProfilesModal(null); setViewingOrder(prevOrder); }}>
                                        Xem đơn hàng
                                      </button>
                                    )}
                                    {!order && p.isAssigned && (
                                      <button className="btn btn-sm btn-danger" onClick={() => releaseSingleProfile(item.id, p.id)}>Giải phóng</button>
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
        )
      }

      {
        renewalDialog && (() => {
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
                    <input
                      type="text"
                      className="form-control"
                      value={
                        renewalDialog.amount === 0
                          ? ''
                          : new Intl.NumberFormat('vi-VN').format(renewalDialog.amount) + ' đ'
                      }
                      onChange={e => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        const num = raw ? Number(raw) : 0;
                        setRenewalDialog({ ...renewalDialog, amount: num });
                      }}
                      placeholder="0 đ"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ghi chú</label>
                    <input type="text" className="form-control" value={renewalDialog.note} onChange={e => setRenewalDialog({ ...renewalDialog, note: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Trạng thái thanh toán</label>
                    <select
                      className="form-control"
                      value={renewalDialog.paymentStatus}
                      onChange={e => setRenewalDialog({ ...renewalDialog, paymentStatus: e.target.value as InventoryPaymentStatus })}
                    >
                      {INVENTORY_PAYMENT_STATUSES_FULL.map(status => (
                        <option key={status.value} value={status.value}>{status.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Hạn mới (dự kiến)</label>
                    <div className="form-control" style={{ backgroundColor: '#f8f9fa', color: '#495057' }}>
                      {(() => {
                        const currentExpiry = new Date(inv.expiryDate);
                        const newExpiry = new Date(currentExpiry);
                        newExpiry.setMonth(newExpiry.getMonth() + (renewalDialog.months || 1));
                        return newExpiry.toLocaleDateString('vi-VN');
                      })()}
                    </div>
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
                    const { error } = await sb.from('inventory').update({
                      // Chỉ cập nhật hạn mới, không đụng tới trạng thái thanh toán lần nhập kho ban đầu
                      expiry_date: newExpiry.toISOString()
                    }).eq('id', inv.id);
                    if (!error) {
                      // Store renewal in Supabase
                      const { error: renewalError } = await sb.from('inventory_renewals').insert({
                        inventory_id: inv.id,
                        months: renewalDialog.months,
                        amount: renewalDialog.amount,
                        previous_expiry_date: currentExpiry.toISOString(),
                        new_expiry_date: newExpiry.toISOString(),
                        note: renewalDialog.note,
                        payment_status: renewalDialog.paymentStatus
                      });

                      if (!renewalError) {
                        // Also store locally for backward compatibility
                        Database.renewInventoryItem(inv.id, renewalDialog.months, renewalDialog.amount, { note: renewalDialog.note, paymentStatus: renewalDialog.paymentStatus, createdBy: state.user?.id || 'system' });
                        // Update in-memory list so history shows immediately
                        setInventoryRenewals(prev => ([
                          ...prev,
                          {
                            id: crypto?.randomUUID ? crypto.randomUUID() : `${inv.id}-${Date.now()}`,
                            inventoryId: inv.id,
                            months: renewalDialog.months,
                            amount: renewalDialog.amount,
                            previousExpiryDate: currentExpiry,
                            newExpiryDate: newExpiry,
                            note: renewalDialog.note,
                            paymentStatus: renewalDialog.paymentStatus,
                            createdAt: new Date(),
                            createdBy: state.user?.id || 'system'
                          }
                        ]));
                      }

                      try {
                        const sb2 = getSupabase();
                        if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Gia hạn kho hàng', details: `inventoryId=${inv.id}; inventoryCode=${inv.code || ''}; oldExpiry=${currentExpiry.toISOString().split('T')[0]}; newExpiry=${newExpiry.toISOString().split('T')[0]}; months=${renewalDialog.months}; amount=${renewalDialog.amount}; paymentStatus=${renewalDialog.paymentStatus}` });
                      } catch { }
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
        })()
      }

      {
        bulkRenewalDialog && (() => {
          const renewables = items.filter(x => bulkRenewalDialog.ids.includes(x.id));
          const count = renewables.length;
          return (
            <div className="modal" role="dialog" aria-modal style={{ zIndex: 10002 }}>
              <div className="modal-content" style={{ maxWidth: 420 }}>
                <div className="modal-header">
                  <h3 className="modal-title">Gia hạn hàng loạt ({count})</h3>
                  <button className="close" onClick={() => setBulkRenewalDialog(null)}>×</button>
                </div>
                <div className="mb-3">
                  <div className="form-group">
                    <label className="form-label">Số tháng</label>
                    <input
                      type="number"
                      className="form-control"
                      value={bulkRenewalDialog.months}
                      min={1}
                      onChange={e => setBulkRenewalDialog({ ...bulkRenewalDialog, months: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Giá gia hạn cho mỗi kho (VND)</label>
                    <input
                      type="text"
                      className="form-control"
                      value={
                        bulkRenewalDialog.amount === 0
                          ? ''
                          : new Intl.NumberFormat('vi-VN').format(bulkRenewalDialog.amount) + ' đ'
                      }
                      onChange={e => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        const num = raw ? Number(raw) : 0;
                        setBulkRenewalDialog({ ...bulkRenewalDialog, amount: num });
                      }}
                      placeholder="0 đ"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ghi chú</label>
                    <input
                      type="text"
                      className="form-control"
                      value={bulkRenewalDialog.note}
                      onChange={e => setBulkRenewalDialog({ ...bulkRenewalDialog, note: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Trạng thái thanh toán</label>
                    <select
                      className="form-control"
                      value={bulkRenewalDialog.paymentStatus}
                      onChange={e => setBulkRenewalDialog({ ...bulkRenewalDialog, paymentStatus: e.target.value as InventoryPaymentStatus })}
                    >
                      {INVENTORY_PAYMENT_STATUSES_FULL.map(status => (
                        <option key={status.value} value={status.value}>{status.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="alert alert-info" role="alert">
                    Tất cả kho sẽ được cộng +{bulkRenewalDialog.months} tháng. Chi phí sẽ được ghi nhận theo thời điểm bấm gia hạn.
                  </div>
                </div>
                <div className="d-flex justify-content-end gap-2">
                  <button className="btn btn-secondary" onClick={() => setBulkRenewalDialog(null)}>Hủy</button>
                  <button className="btn btn-success" onClick={async () => {
                    const sb = getSupabase();
                    if (!sb) { notify('Không thể gia hạn hàng loạt', 'error'); return; }
                    const renewablesNow = items.filter(x => bulkRenewalDialog.ids.includes(x.id));
                    let successCount = 0;
                    let errorCount = 0;
                    const renewalDetails: string[] = [];
                    for (const inv of renewablesNow) {
                      try {
                        const currentExpiry = new Date(inv.expiryDate);
                        const newExpiry = new Date(currentExpiry);
                        const monthsAdded = Math.max(1, bulkRenewalDialog.months || 1);
                        newExpiry.setMonth(newExpiry.getMonth() + monthsAdded);
                        const { error } = await sb.from('inventory').update({
                          expiry_date: newExpiry.toISOString(),
                          payment_status: bulkRenewalDialog.paymentStatus
                        }).eq('id', inv.id);
                        if (error) { errorCount++; continue; }
                        // Ghi nhận chi phí gia hạn
                        const { error: renewalError } = await sb.from('inventory_renewals').insert({
                          inventory_id: inv.id,
                          months: monthsAdded,
                          amount: bulkRenewalDialog.amount,
                          previous_expiry_date: currentExpiry.toISOString(),
                          new_expiry_date: newExpiry.toISOString(),
                          note: bulkRenewalDialog.note,
                          payment_status: bulkRenewalDialog.paymentStatus
                        });
                        if (renewalError) { errorCount++; continue; }
                        // Local cache (back-compat)
                        Database.renewInventoryItem(inv.id, monthsAdded, bulkRenewalDialog.amount, { note: bulkRenewalDialog.note, paymentStatus: bulkRenewalDialog.paymentStatus, createdBy: state.user?.id || 'system' });
                        // Update in-memory list so history shows immediately
                        setInventoryRenewals(prev => ([
                          ...prev,
                          {
                            id: crypto?.randomUUID ? crypto.randomUUID() : `${inv.id}-${Date.now()}`,
                            inventoryId: inv.id,
                            months: monthsAdded,
                            amount: bulkRenewalDialog.amount,
                            previousExpiryDate: currentExpiry,
                            newExpiryDate: newExpiry,
                            note: bulkRenewalDialog.note,
                            paymentStatus: bulkRenewalDialog.paymentStatus,
                            createdAt: new Date(),
                            createdBy: state.user?.id || 'system'
                          }
                        ]));
                        successCount++;
                        renewalDetails.push(`${inv.code}: ${currentExpiry.toISOString().split('T')[0]} -> ${newExpiry.toISOString().split('T')[0]}`);
                      } catch {
                        errorCount++;
                      }
                    }
                    if (successCount > 0) {
                      try {
                        const sb2 = getSupabase();
                        if (sb2) await sb2.from('activity_logs').insert({
                          employee_id: state.user?.id || null,
                          action: 'Gia hạn hàng loạt kho hàng',
                          details: `count=${successCount}; months=${bulkRenewalDialog.months}; amount=${bulkRenewalDialog.amount}; paymentStatus=${bulkRenewalDialog.paymentStatus}; ids=${renewablesNow.map(i => i.id).join(',')}; details=${renewalDetails.join('; ')}`
                        });
                      } catch { }
                    }
                    if (errorCount === 0) {
                      notify(`Đã gia hạn thành công ${successCount} kho hàng`, 'success');
                    } else if (successCount > 0) {
                      notify(`Đã gia hạn thành công ${successCount} kho hàng, ${errorCount} lỗi`, 'warning');
                    } else {
                      notify('Không thể gia hạn kho hàng', 'error');
                    }
                    setBulkRenewalDialog(null);
                    setSelectedIds([]);
                    refresh();
                  }}>Xác nhận</button>
                </div>
              </div>
            </div>
          );
        })()
      }

      {
        viewingInventory && (() => {
          const inv = items.find(x => x.id === viewingInventory.id) || viewingInventory;
          const productId = inv.productId || (inv as any).product_id;
          const packageId = inv.packageId || (inv as any).package_id;
          const product = products.find(p => p.id === productId);
          const pkg = packages.find(p => p.id === packageId);
          const isSharedPool = product?.sharedInventoryPool;
          const packageName = pkg?.name || (isSharedPool ? 'Kho chung' : 'Không có gói');
          const renewals = inventoryRenewals.filter(r => r.inventoryId === inv.id).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

          // Get the latest renewal's new expiry date if it's newer than current expiry
          const latestRenewal = renewals.length > 0 ? renewals[0] : null;
          const actualExpiryDate = latestRenewal && new Date(latestRenewal.newExpiryDate) > new Date(inv.expiryDate)
            ? latestRenewal.newExpiryDate
            : inv.expiryDate;
          const expiryDateMismatch = latestRenewal && new Date(latestRenewal.newExpiryDate) > new Date(inv.expiryDate);

          // Get account columns from package or inventory item
          const accountColumns = pkg?.accountColumns || inv.accountColumns || [];
          const accountData = inv.accountData || {};

          return (
            <div className="modal" role="dialog" aria-modal>
              <div className="modal-content" style={{ maxWidth: 600 }}>
                <div className="modal-header">
                  <h3 className="modal-title">Kho {inv.code}</h3>
                  <button className="close" onClick={() => setViewingInventory(null)}>×</button>
                </div>
                <div className="mb-3">
                  <div><strong>Sản phẩm:</strong> {product?.name || productId || 'Không xác định'}</div>
                  <div><strong>Gói/Pool:</strong> {packageName}</div>
                  <div><strong>Nhập:</strong> {formatDate(inv.purchaseDate)}</div>
                  <div>
                    <strong>Hết hạn:</strong> {formatDate(actualExpiryDate)}
                    {expiryDateMismatch && (
                      <span style={{ marginLeft: 8, color: '#dc3545', fontSize: '0.9em' }}>
                        (Cần cập nhật: {formatDate(inv.expiryDate)} → {formatDate(actualExpiryDate)})
                      </span>
                    )}
                  </div>
                  <div><strong>Nguồn:</strong> {inv.sourceNote || '-'}</div>
                  <div><strong>Giá mua:</strong> {typeof inv.purchasePrice === 'number' ? formatPrice(inv.purchasePrice) : '-'}</div>
                  <div><strong>Thanh toán:</strong> {(() => {
                    const paymentStatus = getInventoryDisplayPaymentStatus(inv);
                    return getInventoryPaymentLabel(paymentStatus);
                  })()}</div>
                  <div>
                    <strong>Trạng thái:</strong> {inv.isActive !== false ? 'Active' : 'Not Active'}
                  </div>
                  {inv.status === 'NEEDS_UPDATE' && inv.previousLinkedOrderId && (() => {
                    const prevOrder = Database.getOrders().find(o => o.id === inv.previousLinkedOrderId);
                    return prevOrder ? (
                      <div style={{ marginTop: 6, padding: '8px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
                        <strong>Đơn hàng trước khi cần update:</strong> {prevOrder.code}
                      </div>
                    ) : null;
                  })()}
                  {inv.productInfo && (
                    <div style={{ marginTop: 6 }}>
                      <strong>Thông tin sản phẩm:</strong>
                      <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{inv.productInfo}</pre>
                    </div>
                  )}
                  <div style={{ marginTop: 6 }}>
                    <strong>Ghi chú nội bộ:</strong>
                    {inv.notes ? (
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
                        {inv.notes}
                      </pre>
                    ) : (
                      <span className="text-muted" style={{ marginLeft: 4 }}>Không có</span>
                    )}
                  </div>

                  {/* Account Information Section - only show columns that have data */}
                  {(() => {
                    // Filter to only columns that have actual data
                    const columnsWithData = accountColumns.filter((col: any) => {
                      const value = accountData[col.id];
                      return value !== undefined && value !== null && String(value).trim() !== '';
                    });

                    if (columnsWithData.length === 0) return null;

                    return (
                      <div style={{ marginTop: 12 }}>
                        <strong>Thông tin tài khoản:</strong> <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>(Bấm vào để copy)</span>
                        <div style={{ marginTop: 6 }}>
                          {columnsWithData.map((col: any) => {
                            const value = accountData[col.id] || '';
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
                    );
                  })()}
                  <div style={{ marginTop: '16px' }}>
                    <strong style={{ fontSize: '16px' }}>Lịch sử gia hạn:</strong>

                    {/* Timeline: Nhập kho ban đầu */}
                    {(() => {
                      // Tính hạn sử dụng ban đầu: nếu có renewals, dùng previousExpiryDate của renewal cũ nhất
                      // Nếu không có, tính từ purchaseDate + warrantyPeriod
                      const sortedRenewals = [...renewals].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
                      const originalExpiryDate = sortedRenewals.length > 0 && sortedRenewals[0].previousExpiryDate
                        ? new Date(sortedRenewals[0].previousExpiryDate)
                        : (() => {
                          if (pkg?.warrantyPeriod) {
                            const expiry = new Date(inv.purchaseDate);
                            expiry.setMonth(expiry.getMonth() + Math.floor(pkg.warrantyPeriod));
                            return expiry;
                          }
                          return inv.expiryDate;
                        })();

                      return (
                        <div className="card mt-3" style={{ borderLeft: '4px solid #28a745', backgroundColor: 'var(--bg-secondary)' }}>
                          <div className="card-body" style={{ padding: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                              <div>
                                <strong style={{ color: '#28a745', fontSize: '14px' }}>📦 Nhập kho ban đầu</strong>
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                {formatDate(inv.purchaseDate)}
                              </div>
                            </div>
                            <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                              <div><strong>Sản phẩm:</strong> {product?.name || 'Không xác định'}</div>
                              <div><strong>Gói/Pool:</strong> {packageName}</div>
                              <div><strong>Giá mua:</strong> {typeof inv.purchasePrice === 'number' ? formatPrice(inv.purchasePrice) : '-'}</div>
                              <div><strong>Hạn sử dụng:</strong> {formatDate(originalExpiryDate)}</div>
                              <div><strong>Thanh toán:</strong> {INVENTORY_PAYMENT_STATUSES_FULL.find(s => s.value === inv.paymentStatus)?.label || 'Chưa thanh toán'}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Timeline: Các lần gia hạn */}
                    {renewals.length > 0 && (() => {
                      // Sắp xếp theo thời gian tạo tăng dần để Gia hạn lần 1 là lần sớm nhất
                      const sortedTimeline = [...renewals].sort(
                        (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)
                      );
                      return sortedTimeline.map((r, index) => {
                        const paymentStatusLabel = r.paymentStatus
                          ? (INVENTORY_PAYMENT_STATUSES_FULL.find(s => s.value === r.paymentStatus)?.label || 'Chưa thanh toán')
                          : 'Chưa thanh toán';

                        return (
                          <div key={r.id} className="card mt-2" style={{ borderLeft: '4px solid #007bff', backgroundColor: 'var(--bg-secondary)' }}>
                            <div className="card-body" style={{ padding: '12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <div>
                                  <strong style={{ color: '#007bff', fontSize: '14px' }}>🔄 Gia hạn lần {index + 1}</strong>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                  {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                                </div>
                              </div>
                              <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                                <div><strong>Thời gian gia hạn:</strong> +{r.months} tháng</div>
                                <div><strong>Hạn sử dụng:</strong> {new Date(r.previousExpiryDate).toLocaleDateString('vi-VN')} → <span style={{ color: '#28a745', fontWeight: '500' }}>{new Date(r.newExpiryDate).toLocaleDateString('vi-VN')}</span></div>
                                <div><strong>Giá gia hạn:</strong> {formatPrice(r.amount)}</div>
                                <div><strong>Thanh toán:</strong> {paymentStatusLabel}</div>
                                {r.note && (
                                  <div style={{ marginTop: '6px', padding: '6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '12px' }}>
                                    <strong>Ghi chú:</strong> {r.note}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}

                    {renewals.length === 0 && (
                      <div style={{ marginTop: '8px', padding: '8px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        Chưa có lần gia hạn nào
                      </div>
                    )}
                  </div>
                </div>
                <div className="d-flex justify-content-end gap-2">
                  {expiryDateMismatch && (
                    <button
                      className="btn btn-warning"
                      onClick={async () => {
                        const sb = getSupabase();
                        if (!sb) { notify('Không thể cập nhật hạn sử dụng', 'error'); return; }
                        const expiryToUpdate = latestRenewal ? new Date(latestRenewal.newExpiryDate) : inv.expiryDate;
                        const { error } = await sb.from('inventory').update({ expiry_date: expiryToUpdate.toISOString() }).eq('id', inv.id);
                        if (!error) {
                          notify('Đã cập nhật hạn sử dụng từ lịch sử gia hạn', 'success');
                          refresh();
                        } else {
                          notify('Không thể cập nhật hạn sử dụng', 'error');
                        }
                      }}
                    >
                      🔧 Sửa hạn sử dụng
                    </button>
                  )}
                  {inv.paymentStatus !== 'REFUNDED' && (
                    <button
                      className="btn btn-success"
                      onClick={() => { setViewingInventory(null); renewInventory(inv.id); }}
                    >
                      Gia hạn
                    </button>
                  )}
                  {inv.paymentStatus === 'REFUNDED' ? (
                    <div className="text-success" style={{ padding: '6px 12px', fontWeight: 'bold' }}>
                      Đã hoàn: {formatPrice((inv as any).refundAmount || 0)}
                    </div>
                  ) : (
                    <button
                      className="btn btn-warning"
                      onClick={() => {
                        setViewingInventory(null);
                        setRefundState({
                          item: inv,
                          errorDate: new Date().toISOString().split('T')[0],
                          amount: computeWarehouseRefundAmount(inv, new Date().toISOString().split('T')[0]),
                          refundReason: ''
                        });
                      }}
                    >
                      Tính tiền hoàn
                    </button>
                  )}
                  <button className="btn btn-secondary" onClick={() => setViewingInventory(null)}>Đóng</button>
                </div>
              </div>
            </div>
          );
        })()
      }

      {
        confirmState && (
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
        )
      }

      {
        viewingOrder && (
          <OrderDetailsModal
            order={viewingOrder}
            onClose={() => {
              if (previousProfilesModal) {
                setProfilesModal(previousProfilesModal);
                setPreviousProfilesModal(null);
              }
              setViewingOrder(null);
            }}
            inventory={items as any}
            products={products as any}
            packages={packages as any}
            getCustomerName={(id: string) => customerMap.get(id) || 'Không xác định'}
            getCustomerCode={(id: string) => (customers.find(c => c.id === id)?.code || '')}
            getPackageInfo={(packageId: string) => {
              const { pkg, product } = getPackageInfo(packageId);
              return { package: pkg, product } as any;
            }}
            getStatusLabel={getStatusLabel as any}
            getPaymentLabel={getPaymentLabel as any}
            formatDate={formatDate}
            formatPrice={formatPrice}
            onOpenRenew={() => {
              if (!viewingOrder) return;
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
              const customerName = customerMap.get(o.customerId) || 'Không xác định';
              const pkgInfo = getPackageInfo(o.packageId);
              const productName = pkgInfo?.product?.name || 'Không xác định';
              const packageName = pkgInfo?.pkg?.name || 'Không xác định';
              const statusLabel = getStatusLabel(o.status);
              const paymentLabel = getPaymentLabel(o.paymentStatus || 'UNPAID') || 'Chưa thanh toán';
              const purchaseDate = new Date(o.purchaseDate).toLocaleDateString('vi-VN');
              const expiryDate = new Date(o.expiryDate).toLocaleDateString('vi-VN');
              const price = (() => {
                if (o.useCustomPrice && o.customPrice) return o.customPrice;
                const customer = customers.find(c => c.id === o.customerId);
                const isCTV = (customer?.type || 'RETAIL') === 'CTV';
                return isCTV ? (pkgInfo?.pkg?.ctvPrice || 0) : (pkgInfo?.pkg?.retailPrice || 0);
              })();
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
                  const found = items.find((i: any) => i.id === o.inventoryItemId);
                  if (found) return found;
                }
                const byLinked = items.find((i: any) => i.linkedOrderId === o.id);
                if (byLinked) return byLinked;
                return items.find((i: any) => i.isAccountBased && (i.profiles || []).some((p: any) => p.assignedOrderId === o.id));
              })();
              if (inv) {
                const accountColumns = resolveAccountColumns({
                  orderPackageId: o.packageId,
                  inventoryItem: inv,
                  packages
                });
                const displayColumns = filterVisibleAccountColumns(accountColumns);
                if (displayColumns.length > 0) {
                  out.push('');
                  displayColumns.forEach((col: any) => {
                    const value = (inv.accountData || {})[col.id] || '';
                    if (String(value).trim()) {
                      out.push(`${col.title}: ${value}`);
                    }
                  });
                }
              }
              const customFieldValues = (o as any).customFieldValues || {};
              if (pkgInfo?.pkg?.customFields && Object.keys(customFieldValues).length > 0) {
                out.push('');
                pkgInfo.pkg.customFields.forEach((cf: any) => {
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
              await refresh();
            }}
          />
        )
      }

      {
        renewState && (
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
                  const pkgInfo = getPackageInfo(renewState.packageId);
                  const pkg = pkgInfo?.pkg;
                  const product = pkgInfo?.product;
                  const months = Math.max(1, (pkg as any)?.warrantyPeriod || 1);
                  const preview = (() => {
                    if (renewState.useCustomExpiry && renewState.customExpiryDate) {
                      return new Date(renewState.customExpiryDate);
                    }
                    const d = new Date(base);
                    d.setMonth(d.getMonth() + months);
                    return d;
                  })();
                  const cust = customers.find(c => c.id === o.customerId);
                  const defaultPrice = (cust?.type || 'RETAIL') === 'CTV' ? ((pkg as any)?.ctvPrice || 0) : ((pkg as any)?.retailPrice || 0);
                  const price = renewState.useCustomPrice ? (renewState.customPrice || 0) : defaultPrice;
                  return (
                    <div className="p-2">
                      <div><strong>Mã đơn:</strong> {o.code}</div>
                      <div><strong>Khách hàng:</strong> {customerMap.get(o.customerId) || 'Không xác định'}</div>
                      <div><strong>Hết hạn hiện tại:</strong> {currentExpiry.toLocaleDateString('vi-VN')}</div>
                      <div className="form-group">
                        <label className="form-label">Gói gia hạn</label>
                        <select
                          className="form-control"
                          value={renewState.packageId}
                          onChange={(e) => setRenewState(prev => prev ? { ...prev, packageId: e.target.value } : prev)}
                        >
                          {packages
                            .filter(p => p.productId === (product?.id || ''))
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
                                const currentExpiry = new Date(o.expiryDate);
                                const base = currentExpiry > new Date() ? currentExpiry : new Date();
                                const pkgInfo = getPackageInfo(renewState.packageId);
                                const months = Math.max(1, (pkgInfo?.pkg as any)?.warrantyPeriod || 1);
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
                              const sb = getSupabase();
                              const nowIso = new Date().toISOString();
                              if (sb) {
                                if (checked) {
                                  await sb.from('orders').update({
                                    renewal_message_sent: true,
                                    renewal_message_sent_at: nowIso,
                                    renewal_message_sent_by: null
                                  }).eq('id', renewState.order.id);
                                } else {
                                  await sb.from('orders').update({
                                    renewal_message_sent: false,
                                    renewal_message_sent_at: null,
                                    renewal_message_sent_by: null
                                  }).eq('id', renewState.order.id);
                                }
                              } else {
                                try {
                                  if (checked) {
                                    Database.updateOrder(renewState.order.id, { renewalMessageSent: true, renewalMessageSentAt: new Date(), renewalMessageSentBy: 'system' } as any);
                                  } else {
                                    Database.updateOrder(renewState.order.id, { renewalMessageSent: false, renewalMessageSentAt: undefined, renewalMessageSentBy: undefined } as any);
                                  }
                                } catch { }
                              }
                              // Optional: could refresh local orders cache if needed
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
                  className="btn btn-primary"
                  onClick={async () => {
                    if (!renewState) return;
                    const o = renewState.order;
                    const sb = getSupabase();
                    if (!sb) {
                      notify('Không thể kết nối đến database', 'error');
                      return;
                    }

                    try {
                      // Lấy thông tin package và customer từ state đã có
                      const pkgInfo = getPackageInfo(renewState.packageId);
                      const pkg = pkgInfo?.pkg;
                      const cust = customers.find(c => c.id === o.customerId);

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
                      const defaultPrice = cust?.type === 'CTV' ? (pkg.ctvPrice || 0) : (pkg.retailPrice || 0);
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
                        createdBy: 'system'
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
                      await refresh();
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
        )
      }

      {
        paymentStatusModal && (() => {
          const selectedItems = pageItems.filter(i => paymentStatusModal.selectedIds.includes(i.id));
          const renewalOptions = selectedItems.flatMap(item => {
            const renewals = (renewalsByInventory.get(item.id) || []).slice().sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
            return renewals.map((renewal, idx) => ({
              id: renewal.id,
              inventoryId: item.id,
              code: item.code || `KHO${item.id.slice(-4)}`,
              months: renewal.months,
              createdAt: renewal.createdAt,
              previousExpiryDate: renewal.previousExpiryDate,
              newExpiryDate: renewal.newExpiryDate,
              paymentStatus: renewal.paymentStatus || 'UNPAID',
              indexLabel: `Gia hạn #${renewals.length - idx}`
            }));
          });
          const renewalDisabled = renewalOptions.length === 0;
          const handleToggleRenewal = (id: string, checked: boolean) => {
            setSelectedRenewalIds(prev => {
              if (checked) {
                if (prev.includes(id)) return prev;
                return [...prev, id];
              }
              return prev.filter(rid => rid !== id);
            });
          };
          const canConfirm = bulkPaymentTarget === 'INITIAL' || (bulkPaymentTarget === 'RENEWAL' && selectedRenewalIds.length > 0);

          return (
            <div className="modal" role="dialog" aria-modal>
              <div className="modal-content" style={{ maxWidth: 520 }}>
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
                      {INVENTORY_PAYMENT_STATUSES_FULL.map(status => (
                        <option key={status.value} value={status.value}>{status.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Áp dụng cho</label>
                    <div className="d-flex flex-column gap-2">
                      <label className="d-flex align-items-center gap-2">
                        <input
                          type="radio"
                          name="bulkPaymentTarget"
                          value="INITIAL"
                          checked={bulkPaymentTarget === 'INITIAL'}
                          onChange={() => {
                            setBulkPaymentTarget('INITIAL');
                            setSelectedRenewalIds([]);
                          }}
                        />
                        <span>Lần nhập kho ban đầu</span>
                      </label>
                      <label className="d-flex align-items-center gap-2">
                        <input
                          type="radio"
                          name="bulkPaymentTarget"
                          value="RENEWAL"
                          disabled={renewalDisabled}
                          checked={bulkPaymentTarget === 'RENEWAL'}
                          onChange={() => {
                            setBulkPaymentTarget('RENEWAL');
                            setSelectedRenewalIds(renewalOptions.map(option => option.id));
                          }}
                        />
                        <span>Các lần gia hạn{renewalDisabled ? ' (Không có dữ liệu)' : ''}</span>
                      </label>
                    </div>
                  </div>
                  {bulkPaymentTarget === 'RENEWAL' && !renewalDisabled && (
                    <div className="form-group">
                      <label className="form-label">Chọn lần gia hạn</label>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="text-muted small">Đã chọn {selectedRenewalIds.length}/{renewalOptions.length}</div>
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-light"
                            onClick={() => setSelectedRenewalIds(renewalOptions.map(option => option.id))}
                          >
                            Chọn tất
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-light"
                            onClick={() => setSelectedRenewalIds([])}
                          >
                            Bỏ chọn
                          </button>
                        </div>
                      </div>
                      <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 4, padding: '8px' }}>
                        {renewalOptions.map(option => (
                          <label key={option.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                            <input
                              type="checkbox"
                              checked={selectedRenewalIds.includes(option.id)}
                              onChange={(e) => handleToggleRenewal(option.id, e.target.checked)}
                            />
                            <div>
                              <div><strong>{option.code}</strong> · {option.indexLabel}</div>
                              <div className="text-muted small">
                                {option.createdAt ? formatDate(option.createdAt) : ''} · +{option.months} tháng
                              </div>
                              <div className="text-muted small">
                                {formatDate(option.previousExpiryDate)} → <span style={{ color: '#28a745' }}>{formatDate(option.newExpiryDate)}</span>
                              </div>
                              <div className="text-muted small">
                                Hiện tại: {getInventoryPaymentLabel(option.paymentStatus as InventoryPaymentStatus)}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="d-flex justify-content-end gap-2">
                  <button className="btn btn-secondary" onClick={() => setPaymentStatusModal(null)}>Hủy</button>
                  <button
                    className="btn btn-primary"
                    disabled={!canConfirm}
                    onClick={async () => {
                      const sb = getSupabase();
                      if (!sb) { notify('Không thể cập nhật trạng thái thanh toán', 'error'); return; }

                      if (bulkPaymentTarget === 'INITIAL') {
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
                            employee_id: null,
                            action: 'Cập nhật thanh toán kho hàng loạt',
                            details: `count=${selectedItems.length}; status=${selectedPaymentStatus}; ids=${paymentStatusModal.selectedIds.join(',')}`
                          });
                        } catch { }

                        notify(`Đã cập nhật trạng thái thanh toán cho ${selectedItems.length} mục kho`, 'success');
                        setSelectedIds([]);
                        setPaymentStatusModal(null);
                        refresh();
                        return;
                      }

                      if (selectedRenewalIds.length === 0) {
                        notify('Vui lòng chọn ít nhất 1 lần gia hạn', 'warning');
                        return;
                      }

                      const { error } = await sb
                        .from('inventory_renewals')
                        .update({ payment_status: selectedPaymentStatus })
                        .in('id', selectedRenewalIds);

                      if (error) {
                        notify('Không thể cập nhật trạng thái thanh toán gia hạn', 'error');
                        return;
                      }

                      setInventoryRenewals(prev => prev.map(r => (
                        selectedRenewalIds.includes(r.id)
                          ? { ...r, paymentStatus: selectedPaymentStatus }
                          : r
                      )));

                      try {
                        const sb2 = getSupabase();
                        if (sb2) await sb2.from('activity_logs').insert({
                          employee_id: null,
                          action: 'Cập nhật thanh toán gia hạn kho hàng loạt',
                          details: `count=${selectedRenewalIds.length}; status=${selectedPaymentStatus}; renewalIds=${selectedRenewalIds.join(',')}`
                        });
                      } catch { }

                      notify(`Đã cập nhật trạng thái thanh toán cho ${selectedRenewalIds.length} lần gia hạn`, 'success');
                      setPaymentStatusModal(null);
                      setSelectedRenewalIds([]);
                      setBulkPaymentTarget('INITIAL');
                      refresh();
                    }}
                  >
                    Xác nhận
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      }

      {/* Warehouse Refund Modal */}
      {
        refundState && (
          <div className="modal">
            <div className="modal-content" style={{ maxWidth: 480 }}>
              <div className="modal-header">
                <h3 className="modal-title">Tính tiền hoàn kho hàng</h3>
                <button type="button" className="close" onClick={() => setRefundState(null)}>×</button>
              </div>
              <div className="mb-3">
                {(() => {
                  const item = refundState.item;
                  // Try package lookup first
                  const pkgInfo = getPackageInfo(item.packageId);
                  // For shared pool, look up product directly by productId
                  const product = pkgInfo?.product || products.find(p => p.id === (item as any).productId);
                  const productName = product?.name || 'Không xác định';
                  const packageName = pkgInfo?.pkg?.name || (product?.sharedInventoryPool ? 'Pool chung' : 'Không xác định');
                  const purchasePrice = item.purchasePrice || 0;

                  // Get renewal info for display
                  const itemRenewals = inventoryRenewals
                    .filter(r => r.inventoryId === item.id)
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                  const hasRenewals = itemRenewals.length > 0;
                  const latestRenewal = hasRenewals ? itemRenewals[0] : null;

                  // Dates for display based on whether there are renewals
                  const periodStart = hasRenewals
                    ? new Date(latestRenewal!.previousExpiryDate)
                    : new Date(item.purchaseDate);
                  const periodEnd = hasRenewals
                    ? new Date(latestRenewal!.newExpiryDate)
                    : new Date(item.expiryDate);
                  const periodPrice = hasRenewals
                    ? (latestRenewal!.amount || 0)
                    : purchasePrice;

                  const errorDate = new Date(refundState.errorDate).toLocaleDateString('vi-VN');
                  const refundAmount = refundState.useCustomAmount && refundState.customAmount !== undefined ? refundState.customAmount : refundState.amount;
                  return (
                    <div className="p-2">
                      <div><strong>Mã kho:</strong> {item.code}</div>
                      <div><strong>Sản phẩm:</strong> {productName}</div>
                      <div><strong>Gói:</strong> {packageName}</div>
                      <div><strong>Giá mua gốc:</strong> {formatPrice(purchasePrice)}</div>
                      {hasRenewals && (
                        <div className="alert alert-info py-1 px-2 mt-2 mb-2" style={{ fontSize: '13px' }}>
                          <strong>🔄 Tính theo chu kỳ gia hạn lần {itemRenewals.length}:</strong>
                          <div>Ngày mua (chu kỳ): <strong>{periodStart.toLocaleDateString('vi-VN')}</strong></div>
                          <div>Khoảng tính: {periodStart.toLocaleDateString('vi-VN')} - {periodEnd.toLocaleDateString('vi-VN')}</div>
                          <div>Giá chu kỳ: {formatPrice(periodPrice)}</div>
                        </div>
                      )}
                      {!hasRenewals && (
                        <>
                          <div><strong>Ngày mua:</strong> {new Date(item.purchaseDate).toLocaleDateString('vi-VN')}</div>
                          <div><strong>Ngày hết hạn:</strong> {new Date(item.expiryDate).toLocaleDateString('vi-VN')}</div>
                        </>
                      )}
                      <div><strong>Ngày lỗi:</strong> {errorDate}</div>
                      <div><strong>Số tiền hoàn:</strong> {formatPrice(refundAmount)}</div>
                      {item.sourceNote && <div><strong>Nguồn:</strong> {item.sourceNote}</div>}
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
                        const amt = computeWarehouseRefundAmount(refundState.item, nextDate);
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
                      id="useCustomWarehouseRefund"
                      checked={refundState.useCustomAmount || false}
                      onChange={(e) => {
                        setRefundState(prev => prev ? {
                          ...prev,
                          useCustomAmount: e.target.checked,
                          customAmount: e.target.checked ? (prev.customAmount || prev.amount) : undefined
                        } : prev);
                      }}
                    />
                    <label className="form-check-label" htmlFor="useCustomWarehouseRefund">
                      Nhập tiền hoàn tùy chỉnh
                    </label>
                  </div>
                  {refundState.useCustomAmount && (
                    <div>
                      <label className="form-label">Số tiền hoàn tùy chỉnh</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="text"
                          className="form-control"
                          style={{ flex: 1 }}
                          value={new Intl.NumberFormat('vi-VN').format(refundState.customAmount ?? refundState.amount)}
                          onChange={(e) => {
                            const numericValue = e.target.value.replace(/[^\d]/g, '');
                            const value = parseInt(numericValue, 10) || 0;
                            setRefundState(prev => prev ? { ...prev, customAmount: value } : prev);
                          }}
                        />
                        <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>đ</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-3">
                  <label className="form-label">Lý do hoàn tiền <span className="text-danger">*</span></label>
                  <textarea
                    className="form-control"
                    rows={2}
                    placeholder="Nhập lý do hoàn tiền..."
                    value={refundState.refundReason || ''}
                    onChange={(e) => setRefundState(prev => prev ? { ...prev, refundReason: e.target.value } : prev)}
                    required
                  />
                </div>
              </div>
              <div className="d-flex justify-content-end gap-2">
                <button className="btn btn-secondary" onClick={() => setRefundState(null)}>Đóng</button>
                <button
                  className="btn btn-danger"
                  onClick={async () => {
                    if (!refundState.refundReason || !refundState.refundReason.trim()) {
                      notify('Vui lòng nhập lý do hoàn tiền', 'error');
                      return;
                    }
                    const item = refundState.item;
                    const nowIso = new Date().toISOString();
                    const finalAmount = refundState.useCustomAmount && refundState.customAmount !== undefined ? refundState.customAmount : refundState.amount;
                    const refundReason = refundState.refundReason.trim();
                    try {
                      const sb2 = getSupabase();
                      if (sb2) {
                        const { error } = await sb2.from('inventory').update({
                          payment_status: 'REFUNDED',
                          status: 'EXPIRED',
                          is_active: false,
                          refund_amount: finalAmount,
                          refund_at: nowIso,
                          refund_reason: refundReason
                        }).eq('id', item.id);
                        if (error) {
                          notify(`Lỗi khi cập nhật kho hàng: ${error.message}`, 'error');
                          return;
                        }
                        await sb2.from('activity_logs').insert({
                          employee_id: state.user?.id || null,
                          action: 'Hoàn tiền kho hàng',
                          details: `inventoryId=${item.id}; inventoryCode=${item.code}; errorDate=${refundState.errorDate}; refundAmount=${finalAmount}; reason=${refundReason}`
                        });
                        setRefundState(null);
                        setViewingInventory(null);
                        refresh();
                        notify('Đã đánh dấu hoàn tiền cho kho hàng', 'success');
                      } else {
                        notify('Không thể kết nối database', 'error');
                      }
                    } catch (e: any) {
                      notify(`Lỗi: ${e?.message || 'Không thể hoàn tiền'}`, 'error');
                    }
                  }}
                >
                  Xác nhận hoàn tiền
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default WarehouseList;



