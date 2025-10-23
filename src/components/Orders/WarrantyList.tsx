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
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
  // Check if this is view-only mode (warranty exists and is not PENDING)
  const isViewOnly = warranty && warranty.status !== 'PENDING';

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
          inventoryProfileIds: r.inventory_profile_ids || undefined,
          useCustomPrice: r.use_custom_price || false,
          customPrice: r.custom_price,
          customFieldValues: r.custom_field_values,
          purchaseDate: r.purchase_date ? new Date(r.purchase_date) : new Date(),
          expiryDate: r.expiry_date ? new Date(r.expiry_date) : new Date(),
          createdBy: 'system',
          createdAt: r.created_at ? new Date(r.created_at) : new Date(),
          updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
        })));
        setCustomers((cRes.data || []).map((r: any) => ({
          ...r,
          sourceDetail: r.source_detail || '',
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
        status: isViewOnly ? warranty.status : '' as any, // Empty for editing, actual status for viewing
        replacementInventoryId: warranty.replacementInventoryId,
        newOrderInfo: warranty.newOrderInfo
      });
      setReplacementProfileId('');
    }
  }, [warranty, isViewOnly]);

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
    // Only show completed orders for warranty creation
    const completedOrders = orders.filter(o => o.status === 'COMPLETED');
    if (!q) return completedOrders;
    return completedOrders.filter(o => {
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
    
    // Validation
    if (!form.code.trim() || !form.orderId || !form.reason.trim()) {
      notify('Vui lòng nhập mã bảo hành, chọn đơn hàng và nhập lý do.', 'warning');
      return;
    }

    // For editing warranty, require status selection
    if (warranty && !form.status) {
      notify('Vui lòng chọn trạng thái bảo hành.', 'warning');
      return;
    }

    // For REPLACED status, require replacement inventory
    if (warranty && form.status === 'REPLACED' && !form.replacementInventoryId) {
      notify('Vui lòng chọn sản phẩm thay thế khi chọn trạng thái "Đã đổi bảo hành".', 'warning');
      return;
    }

    // Show confirmation dialog
    setShowConfirmDialog(true);
  };

  const handleConfirmSubmit = async () => {
    setShowConfirmDialog(false);
    
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase not configured');

      // Resolve order ID
      let resolvedOrderId = form.orderId;
      if (!looksLikeUuid(form.orderId)) {
        const order = orders.find(o => o.id === form.orderId);
        if (!order?.code) throw new Error('Không tìm thấy đơn hàng hợp lệ');
        const { data: ro } = await sb
          .from('orders')
          .select('id')
          .eq('code', order.code)
          .maybeSingle();
        if (ro?.id) resolvedOrderId = ro.id as string;
      }

      if (warranty) {
        // EDIT WARRANTY LOGIC
        const { error } = await sb
          .from('warranties')
          .update({
            status: form.status,
            replacement_inventory_id: form.replacementInventoryId || null,
            new_order_info: form.newOrderInfo || null
          })
          .eq('id', warranty.id);
        
        if (error) throw new Error(error.message || 'Không thể cập nhật bảo hành');

        if (form.status === 'FIXED') {
          // FIXED: Re-link original inventory
          try {
            // Find and re-link classic inventory
            const { data: classicItems } = await sb
              .from('inventory')
              .select('id, status, previous_linked_order_id')
              .eq('status', 'NEEDS_UPDATE')
              .eq('previous_linked_order_id', resolvedOrderId)
              .is('linked_order_id', null);
            
            if (classicItems && classicItems.length > 0) {
              await sb
                .from('inventory')
                .update({ 
                  status: 'SOLD', 
                  linked_order_id: resolvedOrderId, 
                  previous_linked_order_id: null 
                })
                .in('id', classicItems.map(item => item.id));
            }

            // Find and re-link account-based inventory
            const { data: accountItems } = await sb
              .from('inventory')
              .select('*')
              .eq('is_account_based', true);
            
            for (const item of (accountItems || [])) {
              const profiles = Array.isArray(item.profiles) ? item.profiles : [];
              const needsUpdateProfiles = profiles.filter((p: any) => p.needsUpdate && p.previousOrderId === resolvedOrderId);
              
              if (needsUpdateProfiles.length > 0) {
                const updatedProfiles = profiles.map((p: any) => 
                  p.needsUpdate && p.previousOrderId === resolvedOrderId
                    ? { ...p, isAssigned: true, assignedOrderId: resolvedOrderId, assignedAt: new Date().toISOString(), needsUpdate: false, previousOrderId: null }
                    : p
                );
                
                await sb
                  .from('inventory')
                  .update({ profiles: updatedProfiles })
                  .eq('id', item.id);
                
                // Update item status if all profiles are assigned
                const allAssigned = updatedProfiles.every((p: any) => p.isAssigned);
                if (allAssigned) {
                  await sb
                    .from('inventory')
                    .update({ status: 'SOLD' })
                    .eq('id', item.id);
                }
              }
            }
          } catch (err) {
            console.error('Error re-linking original inventory:', err);
          }
        } else if (form.status === 'REPLACED') {
          // REPLACED: Link replacement inventory
          if (!form.replacementInventoryId) throw new Error('Phải chọn sản phẩm thay thế');

          // Resolve replacement inventory ID
          let resolvedReplacementId = form.replacementInventoryId;
          if (!looksLikeUuid(form.replacementInventoryId)) {
            const item = inventoryItems.find(i => i.id === form.replacementInventoryId);
            if (item?.code) {
              const { data: invRow } = await sb
                .from('inventory')
                .select('id')
                .eq('code', item.code)
                .maybeSingle();
              if (invRow?.id) resolvedReplacementId = invRow.id as string;
            }
          }

          // Link replacement inventory
          const { data: replacementItem } = await sb
            .from('inventory')
            .select('*')
            .eq('id', resolvedReplacementId)
            .maybeSingle();

          if (replacementItem) {
            if (replacementItem.is_account_based) {
              if (!replacementProfileId) throw new Error('Phải chọn slot cho sản phẩm account-based');
              
              const profiles = Array.isArray(replacementItem.profiles) ? replacementItem.profiles : [];
              const chosenProfile = profiles.find((p: any) => p.id === replacementProfileId);
              if (!chosenProfile || chosenProfile.isAssigned) {
                throw new Error('Slot đã được sử dụng, vui lòng chọn slot trống');
              }

              const updatedProfiles = profiles.map((p: any) => 
                p.id === replacementProfileId 
                  ? { ...p, isAssigned: true, assignedOrderId: resolvedOrderId, assignedAt: new Date().toISOString() }
                  : p
              );

              await sb
                .from('inventory')
                .update({ 
                  profiles: updatedProfiles, 
                  status: 'SOLD' 
                })
                .eq('id', resolvedReplacementId);
            } else {
              // Classic inventory
              if (replacementItem.linked_order_id && replacementItem.linked_order_id !== resolvedOrderId) {
                throw new Error('Kho này đang liên kết đơn khác');
              }
              await sb
                .from('inventory')
                .update({ 
                  status: 'SOLD', 
                  linked_order_id: resolvedOrderId 
                })
                .eq('id', resolvedReplacementId);
            }
          }

          // Update order with replacement inventory
          const autoInfo = (() => {
            if (!replacementItem) return null;
            if (replacementItem.is_account_based) {
              const itemForOrder = { ...replacementItem, packageId: replacementItem.package_id } as InventoryItem;
              return Database.buildOrderInfoFromAccount(itemForOrder, replacementProfileId ? [replacementProfileId] : undefined);
            }
            return replacementItem.product_info || null;
          })();

          await sb
            .from('orders')
            .update({
              inventory_item_id: resolvedReplacementId,
              inventory_profile_ids: replacementProfileId ? [replacementProfileId] : null,
              order_info: autoInfo
            })
            .eq('id', resolvedOrderId);
        }

        // Log activity
        try {
          await sb.from('activity_logs').insert({ 
            employee_id: 'system', 
            action: 'Cập nhật đơn bảo hành', 
            details: `warrantyId=${warranty.id}; warrantyCode=${warranty.code}; newStatus=${form.status}` 
          });
        } catch {}

        notify('Cập nhật đơn bảo hành thành công', 'success');
      } else {
        // CREATE WARRANTY LOGIC
        const { error: insertError } = await sb
          .from('warranties')
          .insert({
            code: form.code,
            order_id: resolvedOrderId,
            reason: form.reason.trim(),
            status: 'PENDING'
          });
        
        if (insertError) throw new Error(insertError.message || 'Không thể tạo đơn bảo hành');

        // Unlink original inventory from order
        try {
          // Unlink classic inventory
          const { data: classicLinked } = await sb
            .from('inventory')
            .select('id, linked_order_id')
            .eq('linked_order_id', resolvedOrderId);
          
          if (classicLinked && classicLinked.length > 0) {
            for (const item of classicLinked) {
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

          // Unlink account-based inventory
          const { data: accountItems } = await sb
            .from('inventory')
            .select('*')
            .eq('is_account_based', true);
          
          for (const item of (accountItems || [])) {
            const profiles = Array.isArray(item.profiles) ? item.profiles : [];
            const assignedProfiles = profiles.filter((p: any) => p.assignedOrderId === resolvedOrderId);
            
            if (assignedProfiles.length > 0) {
              const updatedProfiles = profiles.map((p: any) => 
                p.assignedOrderId === resolvedOrderId
                  ? { 
                      ...p, 
                      isAssigned: false, 
                      assignedOrderId: null, 
                      assignedAt: null, 
                      expiryAt: null, 
                      needsUpdate: true,
                      previousOrderId: resolvedOrderId
                    }
                  : p
              );
              
              await sb
                .from('inventory')
                .update({ profiles: updatedProfiles })
                .eq('id', item.id);
              
              // Update item status if no profiles are assigned
              const stillAssigned = updatedProfiles.some((p: any) => p.isAssigned);
              if (!stillAssigned) {
                await sb
                  .from('inventory')
                  .update({ status: 'NEEDS_UPDATE' })
                  .eq('id', item.id);
              }
            }
          }
        } catch (err) {
          console.error('Error unlinking inventory:', err);
        }

        // Log activity
        try {
          await sb.from('activity_logs').insert({ 
            employee_id: 'system', 
            action: 'Tạo đơn bảo hành', 
            details: `warrantyCode=${form.code}; orderId=${resolvedOrderId}` 
          });
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
			<h3 className="modal-title">
        {warranty ? (isViewOnly ? 'Xem đơn bảo hành' : 'Sửa đơn bảo hành') : 'Tạo đơn bảo hành'}
      </h3>
          <button type="button" className="close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Mã bảo hành *</label>
            <input 
              className="form-control" 
              value={form.code} 
              readOnly 
              disabled 
              style={{ opacity: 0.6, cursor: 'not-allowed' }} 
            />
          </div>
          <div className="mb-3">
			<label className="form-label">Ngày tạo</label>
			<input 
        className="form-control" 
        value={(warranty ? new Date(warranty.createdAt) : new Date()).toLocaleDateString('vi-VN')} 
        disabled 
        style={{ opacity: 0.6, cursor: 'not-allowed' }}
      />
          </div>
          <div className="mb-3">
            <label className="form-label">Chọn đơn hàng *</label>
            {!warranty ? (
              <>
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
              </>
            ) : (
              <input 
                className="form-control" 
                value={getOrderLabel(orders.find(o => o.id === form.orderId) || {} as Order)} 
                disabled 
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
            )}
          </div>
          <div className="mb-3">
            <label className="form-label">Lý do bảo hành *</label>
            {!warranty ? (
              <textarea className="form-control" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} required />
            ) : (
              <textarea 
                className="form-control" 
                value={form.reason} 
                disabled 
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
            )}
          </div>
          <div className="mb-3">
            <label className="form-label">Trạng thái</label>
            {!warranty ? (
              <input 
                className="form-control" 
                value="Chưa xong" 
                disabled 
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
            ) : (
              isViewOnly ? (
                <input 
                  className="form-control" 
                  value={WARRANTY_STATUSES.find(s => s.value === form.status)?.label || form.status} 
                  disabled 
                  style={{ opacity: 0.6, cursor: 'not-allowed' }}
                />
              ) : (
                <select className="form-control" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}>
                  <option value="">-- Chọn trạng thái --</option>
                  <option value="FIXED">Đã fix</option>
                  <option value="REPLACED">Đã đổi bảo hành</option>
                </select>
              )
            )}
          </div>
          
          {/* Only show replacement inventory selection when editing and status is REPLACED */}
          {warranty && form.status === 'REPLACED' && (
            <div className="mb-3">
              <label className="form-label">Sản phẩm thay thế *</label>
              {isViewOnly ? (
                <input 
                  className="form-control" 
                  value={form.replacementInventoryId ? `#${inventoryItems.find(i => i.id === form.replacementInventoryId)?.code || ''} | ${inventoryItems.find(i => i.id === form.replacementInventoryId) ? getInventoryLabel(inventoryItems.find(i => i.id === form.replacementInventoryId)!) : ''}` : '-'} 
                  disabled 
                  style={{ opacity: 0.6, cursor: 'not-allowed' }}
                />
              ) : (
                <>
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
                </>
              )}
            </div>
          )}
          
          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
            {!isViewOnly && <button type="submit" className="btn btn-primary">Lưu</button>}
          </div>
        </form>
      </div>
      
      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="modal" role="dialog" aria-modal>
          <div className="modal-content" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">Xác nhận</h3>
              <button className="close" onClick={() => setShowConfirmDialog(false)}>×</button>
            </div>
            <div className="mb-4" style={{ color: 'var(--text-primary)' }}>
              {warranty ? 'Xác nhận cập nhật đơn bảo hành?' : 'Xác nhận tạo đơn bảo hành?'}
            </div>
            <div className="d-flex justify-content-end gap-2">
              <button className="btn btn-secondary" onClick={() => setShowConfirmDialog(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleConfirmSubmit}>Xác nhận</button>
            </div>
          </div>
        </div>
      )}
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
      sourceDetail: r.source_detail || '',
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
      inventoryProfileIds: r.inventory_profile_ids || undefined,
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
      createdBy: 'system',
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
    const rows = items.map((w, idx) => {
      const linkedOrder = orders.find(o => o.id === w.orderId);
      const linkedCustomer = linkedOrder ? customers.find(c => c.id === linkedOrder.customerId) : null;
      const linkedPackage = linkedOrder ? packages.find(p => p.id === linkedOrder.packageId) : null;
      const linkedProduct = linkedPackage ? products.find(p => p.id === linkedPackage.productId) : null;
      const replacementInventory = w.replacementInventoryId ? inventoryItems.find(i => i.id === w.replacementInventoryId) : null;
      
      return {
        // Basic info
        code: w.code || `BH${idx + 1}`,
        createdAt: new Date(w.createdAt).toLocaleDateString('vi-VN'),
        updatedAt: new Date(w.updatedAt).toLocaleDateString('vi-VN'),
        
        // Order info
        orderCode: linkedOrder?.code || '',
        customerName: linkedCustomer?.name || 'Không xác định',
        customerCode: linkedCustomer?.code || '',
        customerPhone: linkedCustomer?.phone || '',
        customerEmail: linkedCustomer?.email || '',
        
        // Product info
        productName: linkedProduct?.name || 'Không xác định',
        productCode: linkedProduct?.code || '',
        packageName: linkedPackage?.name || 'Không xác định',
        packageCode: linkedPackage?.code || '',
        
        // Warranty details
        reason: w.reason || '',
        status: WARRANTY_STATUSES.find(s => s.value === w.status)?.label || w.status,
        statusValue: w.status,
        
        // Replacement info
        replacementInventoryCode: replacementInventory?.code || '',
        replacementProductName: replacementInventory ? products.find(p => p.id === replacementInventory.productId)?.name || 'Không xác định' : '',
        replacementProductInfo: replacementInventory?.productInfo || '',
        newOrderInfo: w.newOrderInfo || '',
        
        // System info
        createdBy: w.createdBy || '',
        createdAtRaw: w.createdAt.toISOString(),
        updatedAtRaw: w.updatedAt.toISOString(),
      };
    });
    
    exportToXlsx(rows, [
      // Basic info
      { header: 'Mã bảo hành', key: 'code', width: 14 },
      { header: 'Ngày tạo', key: 'createdAt', width: 14 },
      { header: 'Ngày cập nhật', key: 'updatedAt', width: 14 },
      
      // Order info
      { header: 'Mã đơn hàng', key: 'orderCode', width: 16 },
      { header: 'Tên khách hàng', key: 'customerName', width: 24 },
      { header: 'Mã khách hàng', key: 'customerCode', width: 16 },
      { header: 'SĐT khách', key: 'customerPhone', width: 16 },
      { header: 'Email khách', key: 'customerEmail', width: 20 },
      
      // Product info
      { header: 'Tên sản phẩm', key: 'productName', width: 24 },
      { header: 'Mã sản phẩm', key: 'productCode', width: 16 },
      { header: 'Tên gói', key: 'packageName', width: 20 },
      { header: 'Mã gói', key: 'packageCode', width: 16 },
      
      // Warranty details
      { header: 'Lý do bảo hành', key: 'reason', width: 50 },
      { header: 'Trạng thái', key: 'status', width: 16 },
      { header: 'Trạng thái (giá trị)', key: 'statusValue', width: 14 },
      
      // Replacement info
      { header: 'Mã kho thay thế', key: 'replacementInventoryCode', width: 16 },
      { header: 'Tên sản phẩm thay thế', key: 'replacementProductName', width: 24 },
      { header: 'Thông tin sản phẩm thay thế', key: 'replacementProductInfo', width: 30 },
      { header: 'Thông tin đơn hàng mới', key: 'newOrderInfo', width: 30 },
      
      // System info
      { header: 'Người tạo', key: 'createdBy', width: 16 },
    ], filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, 'Bảo hành');
  };

  const toggleSelectAll = (checked: boolean, ids: string[]) => {
    if (checked) {
      setSelectedIds(prev => Array.from(new Set([...prev, ...ids])));
    } else {
      setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
    }
  };
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
      <div className="card-header">
        <div className="d-flex justify-content-between align-items-center">
          <h2 className="card-title">Đơn bảo hành</h2>
          <div className="d-flex gap-2">
            <button className="btn btn-light" onClick={() => {
              const filename = generateExportFilename('BaoHanh', {
                debouncedSearchTerm,
                searchStatus,
                dateFrom,
                dateTo,
                page,
                limit
              }, 'TrangHienTai');
              exportWarrantiesXlsx(pageItems, filename);
            }}>Xuất Excel (trang hiện tại)</button>
            <button className="btn btn-light" onClick={() => {
              const filename = generateExportFilename('BaoHanh', {
                debouncedSearchTerm,
                searchStatus,
                dateFrom,
                dateTo,
                total: filteredWarranties.length
              }, 'KetQuaLoc');
              exportWarrantiesXlsx(filteredWarranties, filename);
            }}>Xuất Excel (kết quả đã lọc)</button>
            {selectedIds.length > 0 && (
              <>
                <span className="badge bg-primary">Đã chọn: {selectedIds.length}</span>
                <button className="btn btn-danger" onClick={bulkDelete}>Xóa đã chọn ({selectedIds.length})</button>
              </>
            )}
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>Tạo đơn bảo hành</button>
          </div>
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
                  <span className={`status-badge ${w.status === 'FIXED' || w.status === 'REPLACED' ? 'status-completed' : 'status-processing'}`}>
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
                <button className="btn btn-secondary" onClick={() => setEditingWarranty(w)}>
                  {w.status === 'PENDING' ? 'Sửa' : 'Xem'}
                </button>
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
                    <span className={`status-badge ${w.status === 'FIXED' || w.status === 'REPLACED' ? 'status-completed' : 'status-processing'}`}>
                      {WARRANTY_STATUSES.find(s => s.value === w.status)?.label}
                    </span>
                  </td>
                  <td>{getReplacementProductText(w.replacementInventoryId)}</td>
                  <td style={{ maxWidth: 260 }}>
                    <div className="line-clamp-3" title={w.newOrderInfo || ''}>{w.newOrderInfo || '-'}</div>
                  </td>
									<td>
										<div className="d-flex gap-2">
											<button className="btn btn-secondary" onClick={() => setEditingWarranty(w)}>
												{w.status === 'PENDING' ? 'Sửa' : 'Xem'}
											</button>
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


