import React, { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../utils/supabaseClient';
import { Database } from '../../utils/database';
import { Customer, Order, Product, ProductPackage, Warranty, WarrantyFormData, WARRANTY_STATUSES, InventoryItem } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { exportToXlsx, generateExportFilename } from '../../utils/excel';
import DateRangeInput from '../Shared/DateRangeInput';

const WarrantyForm: React.FC<{ onClose: () => void; onSuccess: () => void; warranty?: Warranty }> = ({ onClose, onSuccess, warranty }) => {
  const { state } = useAuth();
  const { notify } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [form, setForm] = useState<WarrantyFormData>({ code: '', orderId: '', reason: '', status: 'PENDING' });
  const [orderSearch, setOrderSearch] = useState('');
  const [debouncedOrderSearch, setDebouncedOrderSearch] = useState('');
  const [replacementProfileId, setReplacementProfileId] = useState<string>('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [debouncedInventorySearch, setDebouncedInventorySearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const sb = getSupabase();
        if (!sb) {
          setOrders(Database.getOrders());
          setCustomers(Database.getCustomers());
          setPackages(Database.getPackages());
          setProducts(Database.getProducts());
          setInventoryItems(Database.getInventory());
          return;
        }
        const [oRes, cRes, pRes, prRes, iRes] = await Promise.all([
          sb.from('orders').select('*'),
          sb.from('customers').select('*'),
          sb.from('packages').select('*'),
          sb.from('products').select('*'),
          sb.from('inventory').select('*')
        ]);
        setOrders((oRes.data || []).map((r: any) => ({
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
          createdBy: r.created_by || 'system',
          createdAt: r.created_at ? new Date(r.created_at) : new Date(),
          updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
        })));
        setCustomers((cRes.data || []).map((r: any) => ({
          ...r,
          createdAt: r.created_at ? new Date(r.created_at) : new Date(),
          updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
        })) as any);
        setPackages((pRes.data || []).map((r: any) => ({
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
        })) as any);
        setProducts((prRes.data || []).map((r: any) => ({
          ...r,
          sharedInventoryPool: !!r.shared_inventory_pool,
          createdAt: r.created_at ? new Date(r.created_at) : new Date(),
          updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
        })) as any);
        setInventoryItems((iRes.data || []).map((r: any) => ({
          id: r.id,
          code: r.code,
          productId: r.product_id,
          packageId: r.package_id,
          purchaseDate: r.purchase_date ? new Date(r.purchase_date) : new Date(),
          expiryDate: r.expiry_date ? new Date(r.expiry_date) : undefined,
          sourceNote: r.source_note || '',
          purchasePrice: r.purchase_price,
          productInfo: r.product_info || '',
          notes: r.notes || '',
          status: r.status,
          isAccountBased: !!r.is_account_based,
          accountColumns: r.account_columns || [],
          accountData: r.account_data || {},
          totalSlots: r.total_slots || 0,
          profiles: Array.isArray(r.profiles) ? r.profiles : [],
          linkedOrderId: r.linked_order_id || undefined,
          createdAt: r.created_at ? new Date(r.created_at) : new Date(),
          updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
        })) as any);
      } catch {
        setOrders(Database.getOrders());
        setCustomers(Database.getCustomers());
        setPackages(Database.getPackages());
        setProducts(Database.getProducts());
        setInventoryItems(Database.getInventory());
      }
    })();
  }, []);

  // Realtime inventory subscribe inside form to avoid stale slots after assign
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const ch = sb
      .channel('realtime:warranty-form-inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, async () => {
        try {
          const { data } = await sb.from('inventory').select('*');
          setInventoryItems((data || []).map((r: any) => ({
            id: r.id,
            code: r.code,
            productId: r.product_id,
            packageId: r.package_id,
            purchaseDate: r.purchase_date ? new Date(r.purchase_date) : new Date(),
            expiryDate: r.expiry_date ? new Date(r.expiry_date) : undefined,
            sourceNote: r.source_note || '',
            purchasePrice: r.purchase_price,
            productInfo: r.product_info || '',
            notes: r.notes || '',
            status: r.status,
            isAccountBased: !!r.is_account_based,
            accountColumns: r.account_columns || [],
            accountData: r.account_data || {},
            totalSlots: r.total_slots || 0,
            profiles: Array.isArray(r.profiles) ? r.profiles : [],
            linkedOrderId: r.linked_order_id || undefined,
            createdAt: r.created_at ? new Date(r.created_at) : new Date(),
            updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
          })) as any);
        } catch {}
      })
      .subscribe();
    return () => { try { ch.unsubscribe(); } catch {} };
  }, []);

  // Auto-generate code for new warranty from Supabase, fallback to local
  useEffect(() => {
    if (warranty) return;
    (async () => {
      try {
        const sb = getSupabase();
        if (!sb) throw new Error('no supabase');
        const { data } = await sb.from('warranties').select('code').order('created_at', { ascending: false }).limit(2000);
        const codes = (data || []).map((r: any) => String(r.code || '')) as string[];
        const nextCode = Database.generateNextCodeFromList(codes, 'BH', 3);
        setForm(prev => ({ ...prev, code: nextCode }));
      } catch {
        const nextCode = Database.generateNextWarrantyCode();
        setForm(prev => ({ ...prev, code: nextCode }));
      }
    })();
  }, [warranty]);

  // Debounce searches
  useEffect(() => {
    const t = setTimeout(() => setDebouncedOrderSearch(orderSearch.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [orderSearch]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedInventorySearch(inventorySearch.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [inventorySearch]);

  useEffect(() => {
    if (warranty) {
      setForm({ 
        code: warranty.code, 
        orderId: warranty.orderId, 
        reason: warranty.reason, 
        status: warranty.status,
        replacementInventoryId: warranty.replacementInventoryId,
        newOrderInfo: warranty.newOrderInfo
      });
      setReplacementProfileId('');
    }
  }, [warranty]);

  const getOrderLabel = (o: Order) => {
    const customer = customers.find(c => c.id === o.customerId)?.name || 'Không xác định';
    const pkg = packages.find(p => p.id === o.packageId);
    const product = products.find(p => p?.id === pkg?.productId)?.name || '';
    return `#${o.code || '-'} | ${customer} - ${product} / ${pkg?.name || ''} - ${new Date(o.purchaseDate).toLocaleDateString('vi-VN')}`;
  };

  const getInventoryLabel = (item: InventoryItem) => {
    const product = products.find(p => p.id === item.productId)?.name || '';
    const pkg = packages.find(p => p.id === item.packageId)?.name || '';
    return `${product} / ${pkg} - ${item.productInfo || 'Không có thông tin'}`;
  };

  const availableInventoryItems = useMemo(() => {
    // Show only inventory eligible to replace for the selected order
    const selectedOrder = orders.find(o => o.id === form.orderId);
    if (!selectedOrder) {
      // Fallback: show broadly available items
      return inventoryItems.filter(it => it.status === 'AVAILABLE');
    }
    const pkg = packages.find(p => p.id === selectedOrder.packageId);
    const product = pkg ? products.find(pr => pr.id === pkg.productId) : undefined;
    const sharedPoolProductId = product?.sharedInventoryPool ? product.id : undefined;

    const eligibleItems = inventoryItems.filter(it => {
      // Pool boundary: match by product if shared pool, else exact package
      if (sharedPoolProductId) {
        if (it.productId !== sharedPoolProductId) return false;
      } else {
        if (it.packageId !== (pkg?.id || '')) return false;
      }
      // Status: allow ONLY AVAILABLE for classic items; for account-based, allow items with at least one free slot
      if (it.isAccountBased) {
        const profiles = Array.isArray(it.profiles) ? it.profiles : [];
        const hasFreeSlot = profiles.some((p: any) => !p.isAssigned && !(p as any).needsUpdate);
        return hasFreeSlot;
      }
      const statusEligible = it.status === 'AVAILABLE';
      if (!statusEligible) return false;
      // Classic stock: must not be linked to other orders
      return !it.linkedOrderId;
    });

    // FIX: Include current replacement inventory when editing warranty
    // This ensures the dropdown shows the currently selected replacement even if it's already SOLD
    if (warranty && warranty.replacementInventoryId) {
      const currentReplacement = inventoryItems.find(it => it.id === warranty.replacementInventoryId);
      if (currentReplacement && !eligibleItems.find(it => it.id === currentReplacement.id)) {
        eligibleItems.push(currentReplacement);
      }
    }

    return eligibleItems;
  }, [inventoryItems, orders, form.orderId, packages, products, warranty]);

  const looksLikeUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(val || ''));

  const filteredOrders = React.useMemo(() => {
    const q = debouncedOrderSearch;
    if (!q) return orders;
    return orders.filter(o => {
      const code = String(o.code || '').toLowerCase();
      const customer = customers.find(c => c.id === o.customerId)?.name?.toLowerCase() || '';
      const pkg = packages.find(p => p.id === o.packageId);
      const product = products.find(p => p?.id === pkg?.productId)?.name?.toLowerCase() || '';
      const pkgName = String(pkg?.name || '').toLowerCase();
      return code.includes(q) || customer.includes(q) || product.includes(q) || pkgName.includes(q);
    });
  }, [debouncedOrderSearch, orders, customers, packages, products]);

  const filteredInventory = React.useMemo(() => {
    const q = debouncedInventorySearch;
    if (!q) return availableInventoryItems;
    return availableInventoryItems.filter(item => {
      const code = String(item.code || '').toLowerCase();
      const info = String(item.productInfo || '').toLowerCase();
      const productName = (products.find(p => p.id === item.productId)?.name || '').toLowerCase();
      const packageName = (packages.find(p => p.id === item.packageId)?.name || '').toLowerCase();
      return code.includes(q) || info.includes(q) || productName.includes(q) || packageName.includes(q);
    });
  }, [debouncedInventorySearch, availableInventoryItems, products, packages]);

	const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!((form.code || '').trim()) || !form.orderId || !form.reason.trim()) {
      notify('Vui lòng nhập mã bảo hành, chọn đơn hàng và nhập lý do.', 'warning');
      return;
    }
    // Ensure newOrderInfo auto-fills from replacement selection when account-based
    const selectedItem = (form.replacementInventoryId ? inventoryItems.find(i => i.id === form.replacementInventoryId) : undefined) as InventoryItem | undefined;
    const autoInfo = (() => {
      if (!selectedItem) return undefined;
      if (selectedItem.isAccountBased) {
        const itemForOrder = { ...selectedItem, packageId: selectedItem.packageId } as InventoryItem;
        const text = Database.buildOrderInfoFromAccount(itemForOrder, replacementProfileId ? [replacementProfileId] : undefined);
        return text || undefined;
      }
      return selectedItem.productInfo || undefined;
    })();
    try {
			// Resolve canonical UUIDs to avoid "invalid input syntax for type uuid"
			const sb = getSupabase();
			if (!sb) throw new Error('Supabase not configured');
			let resolvedOrderId = form.orderId;
			let remoteOrder: any | null = null;
			const localSelectedOrder = orders.find(o => o.id === form.orderId);
			if (!looksLikeUuid(form.orderId)) {
				const orderCode = localSelectedOrder?.code;
				if (!orderCode) throw new Error('Không tìm thấy đơn hàng hợp lệ');
				const { data: ro } = await sb
					.from('orders')
					.select('id, customer_id, product_id, package_id')
					.eq('code', orderCode)
					.maybeSingle();
				if (ro?.id) {
					resolvedOrderId = ro.id as string;
					remoteOrder = ro;
				}
			}
			// Resolve replacement inventory id if needed
			let resolvedReplacementInventoryId = form.replacementInventoryId;
			if (resolvedReplacementInventoryId && !looksLikeUuid(resolvedReplacementInventoryId)) {
				const localItem = inventoryItems.find(i => i.id === resolvedReplacementInventoryId);
				const itemCode = localItem?.code;
				if (itemCode) {
					const { data: invRow } = await sb
						.from('inventory')
						.select('id')
						.eq('code', itemCode)
						.maybeSingle();
					if (invRow?.id) resolvedReplacementInventoryId = invRow.id as string;
				}
			}

			// Denormalized pointers from remote order if available (fall back to local)
			const denormCustomerId = (remoteOrder?.customer_id as string | undefined) || localSelectedOrder?.customerId || undefined;
			const denormProductId = (remoteOrder?.product_id as string | undefined) || (() => {
				const pkgId = localSelectedOrder?.packageId;
				const pkg = packages.find(p => p.id === pkgId);
				return pkg?.productId;
			})() || undefined;
			const denormPackageId = (remoteOrder?.package_id as string | undefined) || localSelectedOrder?.packageId || undefined;
			if (warranty) {
				const prevSnapshot = {
					code: warranty.code || '',
					orderId: warranty.orderId,
					reason: warranty.reason,
					status: warranty.status,
					replacementInventoryId: warranty.replacementInventoryId,
					newOrderInfo: warranty.newOrderInfo
				} as const;
				const nextSnapshot = {
					code: form.code,
					orderId: form.orderId,
					reason: form.reason.trim(),
					status: form.status,
					replacementInventoryId: form.replacementInventoryId,
					newOrderInfo: form.newOrderInfo
				} as const;
				const changedEntries: string[] = [];
				(Object.keys(prevSnapshot) as Array<keyof typeof prevSnapshot>).forEach((key) => {
					const beforeVal = String(prevSnapshot[key] ?? '');
					const afterVal = String(nextSnapshot[key] ?? '');
					if (beforeVal !== afterVal) {
						changedEntries.push(`${key}=${beforeVal}->${afterVal}`);
					}
				});

            const { error } = await sb
					.from('warranties')
					.update({
						code: form.code,
						order_id: resolvedOrderId,
						reason: form.reason.trim(),
						status: form.status,
						replacement_inventory_id: resolvedReplacementInventoryId || null,
						new_order_info: (form.newOrderInfo ?? autoInfo ?? null),
						customer_id: denormCustomerId || null,
						product_id: denormProductId || null,
						package_id: denormPackageId || null
					})
					.eq('id', warranty.id);
				if (error) throw new Error(error.message || 'Không thể cập nhật bảo hành');

            // If replacement not changed, skip inventory mutations entirely
            // FIX: Compare resolved IDs to handle local vs remote ID differences
            const originalReplacementId = warranty.replacementInventoryId;
            const currentReplacementId = resolvedReplacementInventoryId;
            const replacementChanged = originalReplacementId !== currentReplacementId;
            
            if (!replacementChanged) {
              try {
                const sb2 = getSupabase();
                if (sb2) await sb2.from('activity_logs').insert({ 
                  employee_id: state.user?.id || 'system', 
                  action: 'Cập nhật đơn bảo hành', 
                  details: [`warrantyId=${warranty.id}; warrantyCode=${warranty.code}`, 'no-replacement-change', `original=${originalReplacementId}, current=${currentReplacementId}`].join('; ') 
                });
              } catch {}
              notify('Cập nhật đơn bảo hành thành công', 'success');
              onSuccess();
              onClose();
              return;
            }

            // Only unlink previous inventory if we're actually replacing it with a different item
            // FIX: Use resolved IDs for consistent comparison
            const hasReplacementChanged = originalReplacementId !== currentReplacementId;
            const hasNewReplacement = currentReplacementId && currentReplacementId !== originalReplacementId;
            if (resolvedReplacementInventoryId && hasNewReplacement) {
              // DEBUG: Log inventory unlink operation
              try {
                const sb2 = getSupabase();
                if (sb2) await sb2.from('activity_logs').insert({ 
                  employee_id: state.user?.id || 'system', 
                  action: 'Warranty Inventory Unlink', 
                  details: [`warrantyId=${warranty.id}`, `orderId=${resolvedOrderId}`, `oldReplacement=${originalReplacementId}`, `newReplacement=${currentReplacementId}`, 'unlinking-previous-inventory'].join('; ') 
                });
              } catch {}
              
              // Mark previous inventory link as NEEDS_UPDATE and unlink profiles if any
              try {
                // Classic linked item(s)
                const { data: classicLinked } = await sb
                  .from('inventory')
                  .select('id, linked_order_id')
                  .eq('linked_order_id', resolvedOrderId)
                  .neq('id', resolvedReplacementInventoryId);
                const classicIds = (classicLinked || []).map((r: any) => r.id);
                if (classicIds.length) {
                  // Store previous linked order before clearing
                  for (const item of (classicLinked || [])) {
                    await sb
                      .from('inventory')
                      .update({ 
                        status: 'NEEDS_UPDATE', 
                        previous_linked_order_id: item.linked_order_id,
                        linked_order_id: null
                      })
                      .eq('id', item.id);
                  }
                }
                // Account-based: any profile pointing to this order gets unassigned; also set item status to NEEDS_UPDATE if all profiles freed
                const { data: accountItems } = await sb
                  .from('inventory')
                  .select('*')
                  .eq('is_account_based', true)
                  .neq('id', resolvedReplacementInventoryId);
                for (const it of (accountItems || [])) {
                  const profiles = Array.isArray(it.profiles) ? it.profiles : [];
                  if (!profiles.some((p: any) => p.assignedOrderId === resolvedOrderId)) continue;
                  const nextProfiles = profiles.map((p: any) => (
                    p.assignedOrderId === resolvedOrderId
                      ? { 
                          ...p, 
                          isAssigned: false, 
                          assignedOrderId: null, 
                          assignedAt: null, 
                          expiryAt: null, 
                          needsUpdate: true,
                          previousOrderId: resolvedOrderId // Store previous order id explicitly
                        }
                      : p
                  ));
                  await sb.from('inventory').update({ profiles: nextProfiles }).eq('id', it.id);
                  // After unassigning, if no profiles are assigned, flip status to NEEDS_UPDATE
                  const stillAssigned = nextProfiles.some((p: any) => p.isAssigned);
                  if (!stillAssigned) {
                    await sb.from('inventory').update({ status: 'NEEDS_UPDATE' }).eq('id', it.id);
                  }
                }
              } catch {}

              // Reflect availability in inventory for replacement
              const { data: invRow } = await sb.from('inventory').select('*').eq('id', resolvedReplacementInventoryId).maybeSingle();
              if (invRow) {
                // For classic inventory: ensure it's not linked elsewhere
                if (!invRow.is_account_based) {
                  if (invRow.linked_order_id && invRow.linked_order_id !== resolvedOrderId) throw new Error('Kho này đang liên kết đơn khác');
                }
                if (!!invRow.is_account_based) {
                  // If account-based, mark selected profile as assigned when provided
                  if (replacementProfileId) {
                    const profiles = Array.isArray(invRow.profiles) ? invRow.profiles : [];
                    // Validate chosen profile is free
                    const chosen = profiles.find((p: any) => p.id === replacementProfileId);
                    if (!chosen || chosen.isAssigned) throw new Error('Slot đã được sử dụng, vui lòng chọn slot trống');
                    const nextProfiles = profiles.map((p: any) => (
                      p.id === replacementProfileId ? { ...p, isAssigned: true, assignedOrderId: resolvedOrderId, assignedAt: new Date().toISOString() } : p
                    ));
                    await sb.from('inventory').update({ profiles: nextProfiles, status: 'SOLD' }).eq('id', invRow.id);
                  }
                } else {
                  // Classic item -> mark SOLD and link to order
                  await sb.from('inventory').update({ status: 'SOLD', linked_order_id: resolvedOrderId }).eq('id', invRow.id);
                }
              }
            }

            // Update order to point to the replacement inventory + profile and refresh order_info
            if (resolvedReplacementInventoryId && hasNewReplacement) {
              try {
                // DEBUG: Log order update operation
                const sb2 = getSupabase();
                if (sb2) await sb2.from('activity_logs').insert({ 
                  employee_id: state.user?.id || 'system', 
                  action: 'Warranty Order Update', 
                  details: [`warrantyId=${warranty.id}`, `orderId=${resolvedOrderId}`, `newInventoryId=${resolvedReplacementInventoryId}`, `profileId=${replacementProfileId || 'none'}`].join('; ') 
                });
              } catch {}
              
              try {
                await sb
                  .from('orders')
                  .update({
                    inventory_item_id: resolvedReplacementInventoryId,
                    inventory_profile_ids: (replacementProfileId ? [replacementProfileId] : null),
                    order_info: (autoInfo ?? null)
                  })
                  .eq('id', resolvedOrderId);
              } catch {}
            }

            // Auto-relink original inventory if warranty completed without replacement
            // Only relink if there's no current replacement AND we're not just changing status
            if (form.status === 'DONE' && !resolvedReplacementInventoryId && !warranty.replacementInventoryId) {
              // DEBUG: Log auto-relink operation
              try {
                const sb2 = getSupabase();
                if (sb2) await sb2.from('activity_logs').insert({ 
                  employee_id: state.user?.id || 'system', 
                  action: 'Warranty Auto-Relink', 
                  details: [`warrantyId=${warranty.id}`, `orderId=${resolvedOrderId}`, 'auto-relinking-original-inventory'].join('; ') 
                });
              } catch {}
              
              try {
                // For classic inventory: find items that were marked NEEDS_UPDATE for this order
                // We need to find items that were previously linked to this order and are now NEEDS_UPDATE
                const { data: classicLinked } = await sb
                  .from('inventory')
                  .select('id, status, previous_linked_order_id')
                  .eq('status', 'NEEDS_UPDATE')
                  .eq('previous_linked_order_id', resolvedOrderId)
                  .is('linked_order_id', null);
                
                // For classic items: set status back to SOLD and relink, clear previous_linked_order_id
                const classicIds = (classicLinked || []).map((r: any) => r.id);
                if (classicIds.length) {
                  await sb
                    .from('inventory')
                    .update({ status: 'SOLD', linked_order_id: resolvedOrderId, previous_linked_order_id: null })
                    .in('id', classicIds);
                }
                
                // For account-based: find profiles with needsUpdate for this order and reassign
                const { data: accountItems } = await sb
                  .from('inventory')
                  .select('*')
                  .eq('is_account_based', true);
                  
                for (const it of (accountItems || [])) {
                  const profiles = Array.isArray(it.profiles) ? it.profiles : [];
                  const hasNeedsUpdate = profiles.some((p: any) => p.needsUpdate);
                  if (!hasNeedsUpdate) continue;
                  
                  const nextProfiles = profiles.map((p: any) => (
                    p.needsUpdate
                      ? { ...p, isAssigned: true, assignedOrderId: resolvedOrderId, assignedAt: new Date().toISOString(), needsUpdate: false }
                      : p
                  ));
                  
                  await sb.from('inventory').update({ profiles: nextProfiles }).eq('id', it.id);
                  
                  // Update status to SOLD if all slots are now assigned
                  const allAssigned = nextProfiles.every((p: any) => p.isAssigned);
                  if (allAssigned) {
                    await sb.from('inventory').update({ status: 'SOLD' }).eq('id', it.id);
                  }
                }
              } catch (err) {
                console.error('Error relinking inventory:', err);
              }
            }
				try {
					const sb2 = getSupabase();
					if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Cập nhật đơn bảo hành', details: [`warrantyId=${warranty.id}; warrantyCode=${warranty.code}`, ...changedEntries].join('; ') });
				} catch {}
				notify('Cập nhật đơn bảo hành thành công', 'success');
			} else {

        const { error: insertError } = await sb
					.from('warranties')
					.insert({
						code: form.code,
						order_id: resolvedOrderId,
						reason: form.reason.trim(),
						status: form.status,
						replacement_inventory_id: resolvedReplacementInventoryId || null,
						new_order_info: (form.newOrderInfo ?? autoInfo ?? null),
						customer_id: denormCustomerId || null,
						product_id: denormProductId || null,
						package_id: denormPackageId || null
					});
				if (insertError) throw new Error(insertError.message || 'Không thể tạo đơn bảo hành');

        // Only unlink previous inventory if we're actually replacing it
        if (resolvedReplacementInventoryId) {
          // Mark previous inventory link as NEEDS_UPDATE and unlink profiles if any
          try {
            const { data: classicLinked } = await sb
              .from('inventory')
              .select('id, linked_order_id')
              .eq('linked_order_id', resolvedOrderId)
              .neq('id', resolvedReplacementInventoryId);
            const classicIds = (classicLinked || []).map((r: any) => r.id);
            if (classicIds.length) {
              // Store previous linked order before clearing
              for (const item of (classicLinked || [])) {
                await sb
                  .from('inventory')
                  .update({ 
                    status: 'NEEDS_UPDATE', 
                    previous_linked_order_id: item.linked_order_id,
                    linked_order_id: null
                  })
                  .eq('id', item.id);
              }
            }
            const { data: accountItems } = await sb
              .from('inventory')
              .select('*')
              .eq('is_account_based', true)
              .neq('id', resolvedReplacementInventoryId);
            for (const it of (accountItems || [])) {
              const profiles = Array.isArray(it.profiles) ? it.profiles : [];
              if (!profiles.some((p: any) => p.assignedOrderId === resolvedOrderId)) continue;
              const nextProfiles = profiles.map((p: any) => (
                p.assignedOrderId === resolvedOrderId
                  ? { 
                      ...p, 
                      isAssigned: false, 
                      assignedOrderId: null, 
                      assignedAt: null, 
                      expiryAt: null, 
                      needsUpdate: true,
                      previousOrderId: resolvedOrderId // Store previous order id explicitly
                    }
                  : p
              ));
              await sb.from('inventory').update({ profiles: nextProfiles }).eq('id', it.id);
              const stillAssigned = nextProfiles.some((p: any) => p.isAssigned);
              if (!stillAssigned) {
                await sb.from('inventory').update({ status: 'NEEDS_UPDATE' }).eq('id', it.id);
              }
            }
          } catch {}

          // Reflect inventory state for replacement
          const { data: invRow } = await sb.from('inventory').select('*').eq('id', resolvedReplacementInventoryId).maybeSingle();
          if (invRow) {
            if (!!invRow.is_account_based) {
              if (replacementProfileId) {
                const profiles = Array.isArray(invRow.profiles) ? invRow.profiles : [];
                // Validate chosen profile is free
                const chosen = profiles.find((p: any) => p.id === replacementProfileId);
                if (!chosen || chosen.isAssigned) throw new Error('Slot đã được sử dụng, vui lòng chọn slot trống');
                const nextProfiles = profiles.map((p: any) => (
                  p.id === replacementProfileId ? { ...p, isAssigned: true, assignedOrderId: resolvedOrderId, assignedAt: new Date().toISOString() } : p
                ));
                await sb.from('inventory').update({ profiles: nextProfiles, status: 'SOLD' }).eq('id', invRow.id);
              }
            } else {
              await sb.from('inventory').update({ status: 'SOLD', linked_order_id: resolvedOrderId }).eq('id', invRow.id);
            }
          }
        }

        // Update order to point to the replacement inventory + profile and refresh order_info
        if (resolvedReplacementInventoryId) {
          try {
            await sb
              .from('orders')
              .update({
                inventory_item_id: resolvedReplacementInventoryId,
                inventory_profile_ids: (replacementProfileId ? [replacementProfileId] : null),
                order_info: (autoInfo ?? null)
              })
              .eq('id', resolvedOrderId);
          } catch {}
        }

        // Auto-relink original inventory if warranty completed without replacement
        // Only relink if there's no current replacement
        if (form.status === 'DONE' && !resolvedReplacementInventoryId) {
          try {
            // For classic inventory: find items that were marked NEEDS_UPDATE for this order
            // We need to find items that were previously linked to this order and are now NEEDS_UPDATE
            const { data: classicLinked } = await sb
              .from('inventory')
              .select('id, status, previous_linked_order_id')
              .eq('status', 'NEEDS_UPDATE')
              .eq('previous_linked_order_id', resolvedOrderId)
              .is('linked_order_id', null);
            
            // For classic items: set status back to SOLD and relink, clear previous_linked_order_id
            const classicIds = (classicLinked || []).map((r: any) => r.id);
            if (classicIds.length) {
              await sb
                .from('inventory')
                .update({ status: 'SOLD', linked_order_id: resolvedOrderId, previous_linked_order_id: null })
                .in('id', classicIds);
            }
            
            // For account-based: find profiles with needsUpdate for this order and reassign
            const { data: accountItems } = await sb
              .from('inventory')
              .select('*')
              .eq('is_account_based', true);
              
            for (const it of (accountItems || [])) {
              const profiles = Array.isArray(it.profiles) ? it.profiles : [];
              const hasNeedsUpdate = profiles.some((p: any) => p.needsUpdate);
              if (!hasNeedsUpdate) continue;
              
              const nextProfiles = profiles.map((p: any) => (
                p.needsUpdate
                  ? { ...p, isAssigned: true, assignedOrderId: resolvedOrderId, assignedAt: new Date().toISOString(), needsUpdate: false }
                  : p
              ));
              
              await sb.from('inventory').update({ profiles: nextProfiles }).eq('id', it.id);
              
              // Update status to SOLD if all slots are now assigned
              const allAssigned = nextProfiles.every((p: any) => p.isAssigned);
              if (allAssigned) {
                await sb.from('inventory').update({ status: 'SOLD' }).eq('id', it.id);
              }
            }
          } catch (err) {
            console.error('Error relinking inventory:', err);
          }
        }
				try {
					const sb2 = getSupabase();
					if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Tạo đơn bảo hành', details: `warrantyCode=${form.code}; orderId=${resolvedOrderId}; status=${form.status}` });
				} catch {}
				notify('Tạo đơn bảo hành thành công', 'success');
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Có lỗi xảy ra khi lưu bảo hành';
			notify(errorMessage, 'error');
			return;
		}
    onSuccess();
    onClose();
  };

  return (
    <div className="modal">
      <div className="modal-content" style={{ maxWidth: '560px' }}>
        <div className="modal-header">
			<h3 className="modal-title">{warranty ? 'Sửa đơn bảo hành' : 'Tạo đơn bảo hành'}</h3>
          <button type="button" className="close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Mã bảo hành *</label>
            <input className="form-control" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Tự tạo như BH001" readOnly disabled aria-disabled title={'Mã tự động tạo - không chỉnh sửa'} style={{ opacity: 0.6 } as React.CSSProperties} />
          </div>
          <div className="mb-3">
			<label className="form-label">Ngày tạo</label>
			<input className="form-control" value={(warranty ? new Date(warranty.createdAt) : new Date()).toLocaleDateString('vi-VN')} disabled />
          </div>
          <div className="mb-3">
            <label className="form-label">Chọn đơn hàng *</label>
            <input
              type="text"
              className="form-control mb-2"
              placeholder="Tìm theo mã/khách/sản phẩm/gói..."
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
            />
            <select className="form-control" value={form.orderId} onChange={e => setForm({ ...form, orderId: e.target.value })} required>
              <option value="">-- Chọn đơn hàng --</option>
              {filteredOrders.map(o => (
                <option key={o.id} value={o.id}>{getOrderLabel(o)}</option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label">Lý do bảo hành *</label>
            <textarea className="form-control" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} required />
          </div>
          <div className="mb-3">
            <label className="form-label">Trạng thái</label>
            <select className="form-control" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}>
              {WARRANTY_STATUSES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label">Sản phẩm thay thế (tùy chọn)</label>
            <input
              type="text"
              className="form-control mb-2"
              placeholder="Tìm kho theo mã/thông tin/sản phẩm/gói..."
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
            />
            <select className="form-control" value={form.replacementInventoryId || ''} onChange={e => { setForm({ ...form, replacementInventoryId: e.target.value || undefined }); setReplacementProfileId(''); }}>
              <option value="">-- Chọn sản phẩm từ kho hàng --</option>
              {filteredInventory.map(item => (
                <option key={item.id} value={item.id}>#{item.code} | {getInventoryLabel(item)}</option>
              ))}
            </select>
            <small className="form-text text-muted">Chọn sản phẩm từ kho hàng để thay thế sản phẩm cũ</small>
            {!!form.replacementInventoryId && (() => {
              const item = inventoryItems.find(i => i.id === form.replacementInventoryId);
              if (!item) return null;
              if (item.isAccountBased) {
  return (
                  <div className="mt-2">
                    <label className="form-label"><strong>Chọn slot thay thế</strong></label>
                    <select
                      className="form-control"
                      value={replacementProfileId}
                      onChange={(e) => setReplacementProfileId(e.target.value)}
                    >
                      <option value="">-- Chọn slot --</option>
                      {(item.profiles || []).filter(p => !p.isAssigned && !(p as any).needsUpdate).map(p => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                    <div className="small text-muted mt-1">Thông tin đơn mới sẽ tự động lấy từ cấu hình kho và slot.</div>
                  </div>
                );
              }
              return null;
            })()}
          </div>
          
          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
			<button type="submit" className="btn btn-primary">Lưu</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const WarrantyList: React.FC = () => {
  const { state } = useAuth();
  const { notify } = useToast();
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [showForm, setShowForm] = useState(false);
	const [editingWarranty, setEditingWarranty] = useState<Warranty | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = async () => {
    const sb = getSupabase();
    if (!sb) {
      setWarranties(Database.getWarranties());
      setCustomers(Database.getCustomers());
      setOrders(Database.getOrders());
      setPackages(Database.getPackages());
      setProducts(Database.getProducts());
      setInventoryItems(Database.getInventory());
      return;
    }
    const [wRes, cRes, pRes, prRes, iRes, oRes] = await Promise.all([
      sb.from('warranties').select('*'),
      sb.from('customers').select('*'),
      sb.from('packages').select('*'),
      sb.from('products').select('*'),
      sb.from('inventory').select('*'),
      sb.from('orders').select('*')
    ]);
    const allCustomers = (cRes.data || []).map((r: any) => ({
      ...r,
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
    })) as Customer[];
    const allProducts = (prRes.data || []).map((r: any) => ({
      ...r,
      sharedInventoryPool: !!r.shared_inventory_pool,
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
    })) as Product[];
    const allPackages = (pRes.data || []).map((r: any) => ({
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
    })) as ProductPackage[];
    const allInventory = (iRes.data || []).map((r: any) => ({
      id: r.id,
      code: r.code,
      productId: r.product_id,
      packageId: r.package_id,
      purchaseDate: r.purchase_date ? new Date(r.purchase_date) : new Date(),
      expiryDate: r.expiry_date ? new Date(r.expiry_date) : undefined,
      sourceNote: r.source_note || '',
      purchasePrice: r.purchase_price,
      productInfo: r.product_info || '',
      notes: r.notes || '',
      status: r.status,
      isAccountBased: !!r.is_account_based,
      accountColumns: r.account_columns || [],
      accountData: r.account_data || {},
      totalSlots: r.total_slots || 0,
      profiles: Array.isArray(r.profiles) ? r.profiles : [],
      linkedOrderId: r.linked_order_id || undefined,
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
    })) as InventoryItem[];
    const allOrders = (oRes.data || []).map((r: any) => ({
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
    })) as Order[];
    const allWarranties = (wRes.data || []).map((r: any) => ({
      id: r.id,
      code: r.code,
      orderId: r.order_id,
      reason: r.reason,
      status: r.status,
      replacementInventoryId: r.replacement_inventory_id || undefined,
      newOrderInfo: r.new_order_info || undefined,
      createdBy: r.created_by || 'system',
      customerId: r.customer_id || undefined,
      productId: r.product_id || undefined,
      packageId: r.package_id || undefined,
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
    })) as Warranty[];
    setCustomers(allCustomers);
    setProducts(allProducts);
    setPackages(allPackages);
    setInventoryItems(allInventory);
    setOrders(allOrders);
    setWarranties(allWarranties);
  };

  useEffect(() => { load(); }, []);

  // Listen for view warranty events from notifications
  useEffect(() => {
    const handleViewWarranty = (e: any) => {
      const warrantyId = e.detail;
      const found = warranties.find(w => w.id === warrantyId);
      if (found) {
        setEditingWarranty(found);
        setShowForm(true);
      }
    };

    window.addEventListener('app:viewWarranty', handleViewWarranty as any);
    return () => {
      window.removeEventListener('app:viewWarranty', handleViewWarranty as any);
    };
  }, [warranties]);

  // Realtime subscribe to warranties
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const ch = sb
      .channel('realtime:warranties')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warranties' }, () => {
        load();
      })
      .subscribe();
    return () => { try { ch.unsubscribe(); } catch {} };
  }, []);

  // Initialize from URL/localStorage
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q') || '';
      const status = params.get('status') || '';
      const p = parseInt(params.get('page') || '1', 10);
      const l = parseInt((params.get('limit') || localStorage.getItem('warrantyList.limit') || '10'), 10);
      const from = params.get('from') || '';
      const to = params.get('to') || '';
      setSearchTerm(q);
      setDebouncedSearchTerm(q);
      setSearchStatus(status);
      setDateFrom(from);
      setDateTo(to);
      setPage(!Number.isNaN(p) && p > 0 ? p : 1);
      if (!Number.isNaN(l) && l > 0) setLimit(l);
    } catch {}
  }, []);

  // Debounce unified search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Reset page on filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchTerm, searchStatus]);

  // Persist limit
  useEffect(() => {
    try { localStorage.setItem('warrantyList.limit', String(limit)); } catch {}
  }, [limit]);

  // Sync URL
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (debouncedSearchTerm) params.set('q', debouncedSearchTerm); else params.delete('q');
      if (searchStatus) params.set('status', searchStatus); else params.delete('status');
      if (dateFrom) params.set('from', dateFrom); else params.delete('from');
      if (dateTo) params.set('to', dateTo); else params.delete('to');
      params.set('page', String(page));
      params.set('limit', String(limit));
      const s = params.toString();
      const url = `${window.location.pathname}${s ? `?${s}` : ''}`;
      window.history.replaceState(null, '', url);
    } catch {}
  }, [debouncedSearchTerm, searchStatus, page, limit, dateFrom, dateTo]);

  const getCustomerName = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    const customer = customers.find(c => c.id === (order?.customerId || ''));
    return customer?.name || 'Không xác định';
  };

  const getProductText = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    const pkg = packages.find(p => p.id === (order?.packageId || ''));
    const prod = products.find(p => p.id === (pkg?.productId || ''));
    return `${prod?.name || ''} / ${pkg?.name || ''}`;
  };

  const getReplacementProductText = (inventoryId?: string) => {
    if (!inventoryId) return '-';
    const item = inventoryItems.find(i => i.id === inventoryId);
    if (!item) return '-';
    const product = products.find(p => p.id === item.productId)?.name || '';
    const pkg = packages.find(p => p.id === item.packageId)?.name || '';
    return `${product} / ${pkg}`;
  };

  const filteredWarranties = useMemo(() => {
    const q = debouncedSearchTerm.trim().toLowerCase();
    return warranties.filter(w => {
      const codeMatch = !q || (w.code || '').toLowerCase().includes(q);
      const customerName = getCustomerName(w.orderId).toLowerCase();
      const order = orders.find(o => o.id === w.orderId);
      const pkg = order ? packages.find(p => p.id === order.packageId) : undefined;
      const product = pkg ? products.find(p => p.id === pkg.productId) : undefined;
      const nameMatch = !q || customerName.includes(q) || (pkg?.name || '').toLowerCase().includes(q) || (product?.name || '').toLowerCase().includes(q);
      const matchesStatus = !searchStatus || w.status === searchStatus;
      // date filter by warranty createdAt
      const createdTs = new Date(w.createdAt).getTime();
      const fromTs = dateFrom ? new Date(dateFrom).getTime() : 0;
      const toTs = dateTo ? new Date(dateTo).getTime() : Number.POSITIVE_INFINITY;
      const inRange = createdTs >= fromTs && createdTs <= toTs;
      return (codeMatch || nameMatch) && matchesStatus && inRange;
    });
  }, [warranties, debouncedSearchTerm, searchStatus, orders, customers, packages, products, dateFrom, dateTo]);

  const total = filteredWarranties.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;
  const pageItems = filteredWarranties.slice(start, start + limit);

  const exportWarrantiesXlsx = (items: Warranty[], filename: string) => {
    const rows = items.map((w, idx) => ({
      code: w.code || `BH${idx + 1}`,
      createdAt: new Date(w.createdAt).toLocaleDateString('vi-VN'),
      customer: getCustomerName(w.orderId),
      productPackage: getProductText(w.orderId),
      reason: (w.reason || ''),
      status: WARRANTY_STATUSES.find(s => s.value === w.status)?.label || w.status,
      replacement: getReplacementProductText(w.replacementInventoryId)
    }));
    exportToXlsx(rows, [
      { header: 'Mã BH', key: 'code', width: 12 },
      { header: 'Ngày tạo', key: 'createdAt', width: 14 },
      { header: 'Khách hàng', key: 'customer', width: 22 },
      { header: 'Sản phẩm/Gói', key: 'productPackage', width: 28 },
      { header: 'Lý do', key: 'reason', width: 50 },
      { header: 'Trạng thái', key: 'status', width: 14 },
      { header: 'Sản phẩm thay thế', key: 'replacement', width: 26 },
    ], filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, 'Bảo hành');
  };

  const toggleSelectAll = (checked: boolean, ids: string[]) => setSelectedIds(checked ? ids : []);
  const toggleSelect = (id: string, checked: boolean) => setSelectedIds(prev => checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id));
  const bulkDelete = () => {
    if (selectedIds.length === 0) return;
    setConfirmState({
      message: `Xóa ${selectedIds.length} đơn bảo hành đã chọn?`,
      onConfirm: () => {
        selectedIds.forEach(id => Database.deleteWarranty(id));
        (async () => {
          try {
            const sb2 = getSupabase();
            if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Xóa hàng loạt bảo hành', details: `ids=${selectedIds.join(',')}` });
          } catch {}
        })();
        setSelectedIds([]);
        load();
        notify('Đã xóa đơn bảo hành đã chọn', 'success');
      }
    });
  };

  const resetFilters = () => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setSearchStatus('');
    setPage(1);
  };
  const bulkSetStatus = (status: string) => {
    if (selectedIds.length === 0) return;
    (async () => {
      const sb = getSupabase();
      if (!sb) return notify('Không thể cập nhật trạng thái', 'error');
      const { error } = await sb.from('warranties').update({ status }).in('id', selectedIds);
      if (error) return notify('Không thể cập nhật trạng thái', 'error');
      try {
        const sb2 = getSupabase();
        if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Cập nhật trạng thái bảo hành hàng loạt', details: `status=${status}; ids=${selectedIds.join(',')}` });
      } catch {}
      load();
      notify('Đã cập nhật trạng thái', 'success');
    })();
  };

const [confirmState, setConfirmState] = useState<null | { message: string; onConfirm: () => void }>(null);

const handleDelete = (id: string) => {
		setConfirmState({
			message: 'Xóa đơn bảo hành này?',
            onConfirm: () => {
				(async () => {
                    const sb = getSupabase();
                    if (!sb) return notify('Không thể xóa bảo hành', 'error');
					const w = warranties.find(x => x.id === id);
					const { error } = await sb.from('warranties').delete().eq('id', id);
					if (!error) {
						// Update local storage immediately
						const currentWarranties = Database.getWarranties();
						Database.setWarranties(currentWarranties.filter(w => w.id !== id));
						
						// Force refresh form if it's open
						if (showForm && !editingWarranty) {
							setShowForm(false);
							setTimeout(() => {
								setShowForm(true);
							}, 100); // Add small delay to ensure local storage is updated
						}
						
                        try {
                            const sb2 = getSupabase();
                            if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Xóa đơn bảo hành', details: `warrantyId=${id}; orderId=${w?.orderId || ''}; status=${w?.status || ''}` });
                        } catch {}
						notify('Đã xóa đơn bảo hành', 'success');
						load();
					} else {
						notify('Không thể xóa bảo hành', 'error');
					}
				})();
			}
		});
	};

	return (
    <div className="card">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h2 className="card-title">Đơn bảo hành</h2>
        <div className="d-flex gap-2">
          <button className="btn btn-light" onClick={() => {
            const filename = generateExportFilename('BaoHanh', {
              debouncedSearchTerm,
              searchStatus,
              dateFrom,
              dateTo
            }, 'TrangHienTai');
            exportWarrantiesXlsx(pageItems, filename);
          }}>Xuất Excel (trang hiện tại)</button>
          <button className="btn btn-light" onClick={() => {
            const filename = generateExportFilename('BaoHanh', {
              debouncedSearchTerm,
              searchStatus,
              dateFrom,
              dateTo
            }, 'KetQuaLoc');
            exportWarrantiesXlsx(filteredWarranties, filename);
          }}>Xuất Excel (kết quả đã lọc)</button>
          {selectedIds.length > 0 && (
            <>
              <button className="btn btn-danger" onClick={bulkDelete}>Xóa đã chọn ({selectedIds.length})</button>
              <div className="dropdown">
                <button className="btn btn-secondary dropdown-toggle" data-bs-toggle="dropdown">Trạng thái</button>
                <div className="dropdown-menu show" style={{ position: 'absolute' }}>
                  {WARRANTY_STATUSES.map(s => (
                    <button key={s.value} className="dropdown-item" onClick={() => bulkSetStatus(s.value)}>{s.label}</button>
                  ))}
                </div>
              </div>
            </>
          )}
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>Tạo đơn bảo hành</button>
        </div>
      </div>
      
      <div className="mb-3">
        <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <div>
            <input
              type="text"
              className="form-control"
              placeholder="Nhập mã/khách hàng/sản phẩm/gói..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <select
              className="form-control"
              value={searchStatus}
              onChange={(e) => setSearchStatus(e.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              {WARRANTY_STATUSES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <DateRangeInput
              label="Khoảng ngày tạo"
              from={dateFrom}
              to={dateTo}
              onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
            />
          </div>
          <div>
            <button className="btn btn-light w-100" onClick={resetFilters}>Reset bộ lọc</button>
          </div>
        </div>
      </div>
      {/* Mobile cards */}
      <div className="warranty-mobile">
        {pageItems.length === 0 ? (
          <div className="text-center py-4">
            <p>{warranties.length === 0 ? 'Chưa có đơn bảo hành' : 'Không tìm thấy đơn bảo hành phù hợp'}</p>
          </div>
        ) : (
          pageItems
            .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
            .map((w, index) => (
            <div key={w.id} className="warranty-card">
              <div className="warranty-card-header">
                <div className="d-flex align-items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(w.id)}
                    onChange={(e) => toggleSelect(w.id, e.target.checked)}
                  />
                  <div className="warranty-card-title">{w.code || `BH${index + 1}`}</div>
                </div>
                <div className="warranty-card-subtitle">{new Date(w.createdAt).toLocaleDateString('vi-VN')}</div>
              </div>

              <div className="warranty-card-row">
                <div className="warranty-card-label">Khách hàng</div>
                <div className="warranty-card-value">{getCustomerName(w.orderId)}</div>
              </div>
              <div className="warranty-card-row">
                <div className="warranty-card-label">Sản phẩm</div>
                <div className="warranty-card-value">{getProductText(w.orderId)}</div>
              </div>
              <div className="warranty-card-row">
                <div className="warranty-card-label">Trạng thái</div>
                <div className="warranty-card-value">
                  <span className={`status-badge ${w.status === 'DONE' ? 'status-completed' : 'status-processing'}`}>
                    {WARRANTY_STATUSES.find(s => s.value === w.status)?.label}
                  </span>
                </div>
              </div>
              <div className="warranty-card-row">
                <div className="warranty-card-label">Sản phẩm thay</div>
                <div className="warranty-card-value">{getReplacementProductText(w.replacementInventoryId)}</div>
              </div>
              
              {w.reason && (
                <div className="warranty-card-description">
                  <strong>Lý do:</strong> {w.reason}
                </div>
              )}
              
              {w.newOrderInfo && (
                <div className="warranty-card-description">
                  <strong>Thông tin đơn mới:</strong> {w.newOrderInfo}
                </div>
              )}

              <div className="warranty-card-actions">
                <button className="btn btn-secondary" onClick={() => setEditingWarranty(w)}>Sửa</button>
                <button className="btn btn-danger" onClick={() => handleDelete(w.id)}>Xóa</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="table-responsive warranty-table">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 36, minWidth: 36, maxWidth: 36 }}>
                <input
                  type="checkbox"
                  checked={pageItems.length > 0 && pageItems.every(w => selectedIds.includes(w.id))}
                  onChange={(e) => toggleSelectAll(e.target.checked, pageItems.map(w => w.id))}
                />
              </th>
              <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Mã bảo hành</th>
              <th style={{ width: '80px', minWidth: '80px', maxWidth: '100px' }}>Ngày tạo</th>
              <th style={{ width: '120px', minWidth: '120px', maxWidth: '150px' }}>Khách hàng</th>
              <th style={{ width: '120px', minWidth: '120px', maxWidth: '150px' }}>Sản phẩm/Gói</th>
              <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Lý do</th>
              <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Trạng thái</th>
              <th style={{ width: '120px', minWidth: '120px', maxWidth: '150px' }}>Sản phẩm thay thế</th>
              <th style={{ width: '120px', minWidth: '120px', maxWidth: '150px' }}>Thông tin đơn mới</th>
              <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
							<tr><td colSpan={9} className="text-center">
                {warranties.length === 0 ? 'Chưa có đơn bảo hành' : 'Không tìm thấy đơn bảo hành phù hợp'}
              </td></tr>
            ) : (
              pageItems
                .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
                .map((w, index) => (
                <tr key={w.id}>
                  <td>
                    <input type="checkbox" checked={selectedIds.includes(w.id)} onChange={(e) => toggleSelect(w.id, e.target.checked)} />
                  </td>
                  <td>{w.code || `BH${index + 1}`}</td>
                  <td>{new Date(w.createdAt).toLocaleDateString('vi-VN')}</td>
                  <td>{getCustomerName(w.orderId)}</td>
                  <td>{getProductText(w.orderId)}</td>
                  <td>
                    <div className="line-clamp-3" title={w.reason} style={{ maxWidth: 420 }}>{w.reason}</div>
                  </td>
                  <td>
                    <span className={`status-badge ${w.status === 'DONE' ? 'status-completed' : 'status-processing'}`}>
                      {WARRANTY_STATUSES.find(s => s.value === w.status)?.label}
                    </span>
                  </td>
                  <td>{getReplacementProductText(w.replacementInventoryId)}</td>
                  <td style={{ maxWidth: 260 }}>
                    <div className="line-clamp-3" title={w.newOrderInfo || ''}>{w.newOrderInfo || '-'}</div>
                  </td>
									<td>
										<div className="d-flex gap-2">
											<button className="btn btn-secondary" onClick={() => setEditingWarranty(w)}>Sửa</button>
											<button className="btn btn-danger" onClick={() => handleDelete(w.id)}>Xóa</button>
										</div>
									</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
			<WarrantyForm onClose={() => setShowForm(false)} onSuccess={load} />
		)}
		{editingWarranty && (
			<WarrantyForm
				warranty={editingWarranty}
				onClose={() => setEditingWarranty(null)}
				onSuccess={() => { setEditingWarranty(null); load(); }}
			/>
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
    </div>
  );
};

export default WarrantyList;


