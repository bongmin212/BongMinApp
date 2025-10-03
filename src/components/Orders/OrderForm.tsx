import React, { useState, useEffect } from 'react';
import { Order, Customer, ProductPackage, Product, OrderFormData, ORDER_STATUSES, PAYMENT_STATUSES, InventoryItem, OrderStatus } from '../../types';
import { Database } from '../../utils/database';
import { getSupabase } from '../../utils/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface OrderFormProps {
  order?: Order | null;
  onClose: () => void;
  onSuccess: () => void;
}

const OrderForm: React.FC<OrderFormProps> = ({ order, onClose, onSuccess }) => {
  const { state } = useAuth();
  const { notify } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [formData, setFormData] = useState<OrderFormData>({
    code: '',
    purchaseDate: new Date(),
    packageId: '',
    customerId: '',
    status: 'PROCESSING',
    paymentStatus: 'UNPAID',
    orderInfo: '',
    notes: '',
    useCustomPrice: false,
    customPrice: 0,
    customFieldValues: {}
  });
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [availableInventory, setAvailableInventory] = useState<InventoryItem[]>([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>('');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [inventoryError, setInventoryError] = useState<string>('');
  const [newCustomerData, setNewCustomerData] = useState<{
    code: string;
    name: string;
    type: 'CTV' | 'RETAIL';
    phone: string;
    email: string;
  }>({
    code: '',
    name: '',
    type: 'RETAIL',
    phone: '',
    email: ''
  });
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [confirmState, setConfirmState] = useState<null | { message: string; onConfirm: () => void }>(null);

  useEffect(() => {
    loadData();
    
    if (order) {
      // Check if inventory is still linked to this order
      let invLinked = '';
      if (order.inventoryItemId) {
        const inv = Database.getInventory().find(i => i.id === order.inventoryItemId);
        if (inv) {
          // Accept classic link
          if (inv.linkedOrderId === order.id) {
            invLinked = order.inventoryItemId;
          } else if (inv.isAccountBased && (inv.profiles || []).some(p => p.assignedOrderId === order.id)) {
            // Accept account-based profile assignment
            invLinked = order.inventoryItemId;
          }
        }
      }
      // Fallback 1: classic link by linkedOrderId
      if (!invLinked) {
        const invByOrder = Database.getInventory().find(i => i.linkedOrderId === order.id);
        if (invByOrder) {
          invLinked = invByOrder.id;
        }
      }
      // Fallback 2: account-based item where a profile is assigned to this order
      if (!invLinked) {
        const invWithProfile = Database.getInventory().find(i => i.isAccountBased && (i.profiles || []).some(p => p.assignedOrderId === order.id));
        if (invWithProfile) {
          invLinked = invWithProfile.id;
        }
      }
      
      setFormData({
        code: order.code,
        purchaseDate: new Date(order.purchaseDate),
        packageId: order.packageId,
        customerId: order.customerId,
        status: order.status,
        paymentStatus: (order as any).paymentStatus || 'UNPAID',
        orderInfo: (order as any).orderInfo || '',
        notes: order.notes || '',
        useCustomPrice: order.useCustomPrice || false,
        customPrice: order.customPrice || 0,
        customFieldValues: (order as any).customFieldValues || {}
      });
      setSelectedInventoryId(invLinked);
      if ((order as any).inventoryProfileId) {
        setSelectedProfileId((order as any).inventoryProfileId as any);
      }
    } else {
      // Prefill auto code for new order (from Supabase)
      (async () => {
        try {
          const sb = getSupabase();
          if (!sb) return;
          const { data } = await sb.from('orders').select('code').order('created_at', { ascending: false }).limit(2000);
          const codes = (data || []).map((r: any) => String(r.code || '')) as string[];
          const generateNextCodeFromList = (list: string[], prefix: string, padLength: number = 4): string => {
            let maxNum = 0;
            let detectedPad = padLength;
            list.forEach(code => {
              const m = String(code || '').match(/^([A-Za-z]+)(\d+)$/);
              if (m && m[1].toUpperCase() === prefix.toUpperCase()) {
                const numStr = m[2];
                const num = parseInt(numStr, 10);
                if (!isNaN(num)) {
                  if (num > maxNum) maxNum = num;
                  detectedPad = Math.max(detectedPad, numStr.length);
                }
              }
            });
            const nextNum = maxNum + 1;
            const width = Math.max(padLength, detectedPad);
            return `${prefix}${String(nextNum).padStart(width, '0')}`;
          };
          const nextCode = generateNextCodeFromList(codes, 'DH', 4);
          setFormData(prev => ({ ...prev, code: nextCode }));
        } catch {}
      })();
    }
  }, [order]);

  const loadData = async () => {
    const sb = getSupabase();
    if (!sb) return;
    const [customersRes, packagesRes, productsRes] = await Promise.all([
      sb.from('customers').select('*').order('created_at', { ascending: true }),
      sb.from('packages').select('*').order('created_at', { ascending: true }),
      sb.from('products').select('*').order('created_at', { ascending: true })
    ]);
    const allCustomers = (customersRes.data || []).map((r: any) => ({
      ...r,
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
    })) as Customer[];
    const allPackages = (packagesRes.data || []).map((r: any) => ({
      ...r,
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
    })) as ProductPackage[];
    const allProducts = (productsRes.data || []).map((r: any) => ({
      ...r,
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
    })) as Product[];
    setCustomers(allCustomers);
    setPackages(allPackages);
    setProducts(allProducts);
  };

  useEffect(() => {
    const loadAvailableInventory = async () => {
      const sb = getSupabase();
      if (!sb || !formData.packageId) {
        setAvailableInventory([]);
        return;
      }
      const pkg = packages.find(p => p.id === formData.packageId);
      const prod = pkg ? products.find(pr => pr.id === pkg.productId) : undefined;
      let query = sb.from('inventory').select('*');
      if (prod?.sharedInventoryPool) {
        query = query.eq('product_id', prod.id);
      } else {
        query = query.eq('package_id', formData.packageId);
      }
      const { data } = await query.order('created_at', { ascending: true });
      let items = (data || []).map((i: any) => ({
        ...i,
        purchaseDate: i.purchase_date ? new Date(i.purchase_date) : new Date(),
        expiryDate: i.expiry_date ? new Date(i.expiry_date) : undefined,
        createdAt: i.created_at ? new Date(i.created_at) : new Date(),
        updatedAt: i.updated_at ? new Date(i.updated_at) : new Date(),
        isAccountBased: i.is_account_based,
        accountColumns: i.account_columns,
        accountData: i.account_data,
        totalSlots: i.total_slots,
        profiles: i.profiles
      })) as InventoryItem[];
      // Filter availability
      items = items.filter((i: any) => {
        if (i.isAccountBased) {
          const total = i.totalSlots || 0;
          const assigned = (i.profiles || []).filter((p: any) => p.isAssigned).length;
          return total > assigned;
        }
        return i.status === 'AVAILABLE';
      });

      // Include linked inventory for editing
      let merged: InventoryItem[] = items;
      if (order?.inventoryItemId) {
        const { data: linked } = await sb.from('inventory').select('*').eq('id', order.inventoryItemId).single();
        if (linked) {
          const linkedMapped = {
            ...linked,
            purchaseDate: linked.purchase_date ? new Date(linked.purchase_date) : new Date(),
            expiryDate: linked.expiry_date ? new Date(linked.expiry_date) : undefined,
            createdAt: linked.created_at ? new Date(linked.created_at) : new Date(),
            updatedAt: linked.updated_at ? new Date(linked.updated_at) : new Date(),
            isAccountBased: linked.is_account_based,
            accountColumns: linked.account_columns,
            accountData: linked.account_data,
            totalSlots: linked.total_slots,
            profiles: linked.profiles
          } as any;
          merged = [linkedMapped as InventoryItem, ...items.filter(i => i.id !== linkedMapped.id)];
        }
      } else if (order) {
        const { data: byOrder } = await sb.from('inventory').select('*').eq('linked_order_id', order.id).limit(1);
        if (byOrder && byOrder[0]) {
          const l = byOrder[0];
          const mapped = {
            ...l,
            purchaseDate: l.purchase_date ? new Date(l.purchase_date) : new Date(),
            expiryDate: l.expiry_date ? new Date(l.expiry_date) : undefined,
            createdAt: l.created_at ? new Date(l.created_at) : new Date(),
            updatedAt: l.updated_at ? new Date(l.updated_at) : new Date(),
            isAccountBased: l.is_account_based,
            accountColumns: l.account_columns,
            accountData: l.account_data,
            totalSlots: l.total_slots,
            profiles: l.profiles
          } as any;
          merged = [mapped as InventoryItem, ...items.filter(i => i.id !== mapped.id)];
        }
      }
      setAvailableInventory(merged);

      // Keep selectedInventoryId if editing with existing link; otherwise reset when package changes
      if (!(order && order.inventoryItemId && order.packageId === formData.packageId)) {
        let validInventoryId = '';
        if (order?.inventoryItemId) {
          const exists = merged.some(i => i.id === order.inventoryItemId);
          if (exists) validInventoryId = order.inventoryItemId;
        }
        setSelectedInventoryId(prev => {
          if (prev && merged.some(i => i.id === prev)) return prev;
          return validInventoryId;
        });
      }
    };
    loadAvailableInventory();
  }, [formData.packageId, order, packages, products]);

  // Realtime: refresh available inventory when inventory changes
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const ch = sb
      .channel('realtime:inventory-for-form')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        // trigger refresh by updating dependency
        setFormData(prev => ({ ...prev }));
      })
      .subscribe();
    return () => { try { ch.unsubscribe(); } catch {} };
  }, []);

  // Auto-enforce status rules based on inventory selection
  useEffect(() => {
    const hasInventorySelected = !!selectedInventoryId;
    setFormData(prev => {
      const enforcedStatus = hasInventorySelected ? 'COMPLETED' : 'PROCESSING';
      return prev.status === enforcedStatus ? prev : { ...prev, status: enforcedStatus };
    });
  }, [selectedInventoryId]);

  // Auto-pick first available slot for account-based inventory when none selected
  useEffect(() => {
    if (!selectedInventoryId) return;
    const inv = availableInventory.find(i => i.id === selectedInventoryId);
    const pkg = packages.find(p => p.id === formData.packageId);
    if (!(inv?.isAccountBased || pkg?.isAccountBased)) return;
    const options = (inv?.profiles || []).filter(p => !p.isAssigned || p.assignedOrderId === (order?.id || ''));
    if (!options || options.length === 0) {
      setSelectedProfileId('');
      return;
    }
    setSelectedProfileId(prev => options.some(p => p.id === prev) ? prev : options[0].id);
  }, [selectedInventoryId, availableInventory, packages, formData.packageId, order]);

  // Ensure selected product is correct on edit so package select isn't disabled
  useEffect(() => {
    if (order && packages.length) {
      const pkg = packages.find(p => p.id === (order?.packageId || ''));
      if (pkg) {
        setSelectedProduct(pkg.productId);
      }
    }
  }, [order, packages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Ensure code exists even if effect hasn't populated yet
    const ensuredCode = (formData.code || '').trim() || Database.generateNextOrderCode('DH', 4);
    if (!(formData.code || '').trim()) {
      setFormData(prev => ({ ...prev, code: ensuredCode }));
    }

    // Validation
    const newErrors: {[key: string]: string} = {};
    // Inventory selection required ONLY when creating new orders and inventory exists
    const hasAvailableInventory = (availableInventory || []).length > 0;
    if (!order && hasAvailableInventory && !selectedInventoryId) {
      newErrors["inventory"] = 'Vui lòng chọn hàng trong kho (bắt buộc)';
    }
    if (!ensuredCode.trim()) {
      newErrors.code = 'Mã đơn hàng là bắt buộc';
    }
    if (!formData.packageId) {
      newErrors.packageId = 'Vui lòng chọn gói sản phẩm';
    }
    if (!formData.customerId) {
      newErrors.customerId = 'Vui lòng chọn khách hàng';
    }
    if (formData.useCustomPrice && (formData.customPrice === undefined || formData.customPrice <= 0)) {
      newErrors.customPrice = 'Vui lòng nhập giá tùy chỉnh hợp lệ';
    }

    const selectedPackage = packages.find(p => p.id === formData.packageId);
    if (selectedPackage && selectedPackage.customFields && selectedPackage.customFields.length) {
      selectedPackage.customFields.forEach(cf => {
        const val = (formData.customFieldValues || {})[cf.id] || '';
        if (!String(val).trim()) {
          newErrors[`cf_${cf.id}`] = `Vui lòng nhập "${cf.title}"`;
        }
      });
    }
    
    // If selected inventory is account-based, force selecting a profile/slot
    if (selectedInventoryId) {
      const inv = Database.getInventory().find(i => i.id === selectedInventoryId);
      const pkg = packages.find(p => p.id === formData.packageId);
      if ((inv?.isAccountBased || pkg?.isAccountBased) && !selectedProfileId) {
        newErrors["inventoryProfileId"] = 'Vui lòng chọn slot để cấp';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const selectedPackage = packages.find(p => p.id === formData.packageId);
      if (!selectedPackage) {
        notify('Gói sản phẩm không tồn tại', 'error');
        return;
      }

      // Calculate expiry date
      const purchaseDate = new Date(formData.purchaseDate);
      const expiryDate = new Date(purchaseDate);
      expiryDate.setMonth(expiryDate.getMonth() + selectedPackage.warrantyPeriod);

      const customFieldValues = (() => {
        const values = formData.customFieldValues || {};
        // Only keep values for fields currently defined on package
        if (!selectedPackage.customFields) return Object.keys(values).length ? values : undefined;
        const picked: Record<string, string> = {};
        selectedPackage.customFields.forEach(cf => {
          if (values[cf.id] !== undefined) picked[cf.id] = values[cf.id];
        });
        return Object.keys(picked).length ? picked : undefined;
      })();

      const pickedInventory = selectedInventoryId ? (availableInventory.find(i => i.id === selectedInventoryId) || Database.getInventory().find(i => i.id === selectedInventoryId)) : undefined;
      const pkgConfig = packages.find(p => p.id === formData.packageId);
      // Auto-import info from warehouse
      const autoInfo = (() => {
        if (!pickedInventory) return '';
        if (pickedInventory.isAccountBased || pkgConfig?.isAccountBased) {
          // Rebuild using latest package columns to avoid drift
          return Database.buildOrderInfoFromAccount({ ...pickedInventory, packageId: formData.packageId } as any, selectedProfileId || undefined);
        }
        return pickedInventory.productInfo || '';
      })();

      const orderData = {
        ...formData,
        code: ensuredCode,
        expiryDate,
        createdBy: state.user?.id || '',
        inventoryItemId: selectedInventoryId || undefined,
        inventoryProfileId: (pickedInventory?.isAccountBased || pkgConfig?.isAccountBased) ? (selectedProfileId || undefined) : undefined,
        useCustomPrice: formData.useCustomPrice || false,
        customPrice: formData.useCustomPrice ? formData.customPrice : undefined,
        customFieldValues,
        orderInfo: (autoInfo || '').trim(),
        status: (selectedInventoryId ? 'COMPLETED' : 'PROCESSING') as OrderStatus
      };

      if (order) {
        // Update existing order
        // Build change details: old -> new for each field
        const prevSnapshot = {
          code: order.code || '',
          purchaseDate: new Date(order.purchaseDate).toISOString().split('T')[0],
          packageId: order.packageId,
          customerId: order.customerId,
          status: order.status,
          paymentStatus: (order as any).paymentStatus || 'UNPAID',
          orderInfo: (order as any).orderInfo || '',
          notes: order.notes || '',
          expiryDate: new Date(order.expiryDate).toISOString().split('T')[0],
          inventoryItemId: order.inventoryItemId || '',
          useCustomPrice: order.useCustomPrice || false,
          customPrice: order.customPrice || 0,
          customFieldValues: JSON.stringify((order as any).customFieldValues || {})
        } as const;

        const nextSnapshot = {
          code: orderData.code || '',
          purchaseDate: new Date(orderData.purchaseDate).toISOString().split('T')[0],
          packageId: orderData.packageId,
          customerId: orderData.customerId,
          status: orderData.status,
          paymentStatus: orderData.paymentStatus,
          orderInfo: orderData.orderInfo || '',
          notes: orderData.notes || '',
          expiryDate: new Date(orderData.expiryDate).toISOString().split('T')[0],
          inventoryItemId: orderData.inventoryItemId || '',
          useCustomPrice: orderData.useCustomPrice || false,
          customPrice: orderData.customPrice || 0,
          customFieldValues: JSON.stringify(orderData.customFieldValues || {})
        } as const;

        const changedEntries: string[] = [];
        (Object.keys(prevSnapshot) as Array<keyof typeof prevSnapshot>).forEach((key) => {
          const beforeVal = String(prevSnapshot[key] ?? '');
          const afterVal = String(nextSnapshot[key] ?? '');
          if (beforeVal !== afterVal) {
            changedEntries.push(`${key}=${beforeVal}->${afterVal}`);
          }
        });

        try {
          const sb = getSupabase();
          if (!sb) throw new Error('Supabase not configured');
          const { error } = await sb
            .from('orders')
            .update({
              code: orderData.code,
              purchase_date: orderData.purchaseDate,
              package_id: orderData.packageId,
              customer_id: orderData.customerId,
              status: orderData.status,
              payment_status: orderData.paymentStatus,
              order_info: orderData.orderInfo,
              notes: orderData.notes,
              expiry_date: orderData.expiryDate,
              inventory_item_id: orderData.inventoryItemId,
              use_custom_price: orderData.useCustomPrice,
              custom_price: orderData.customPrice,
              custom_field_values: orderData.customFieldValues
            })
            .eq('id', order.id);
          if (!error) {
            // Update inventory link/profile if changed
            const prevInventoryId = order.inventoryItemId;
            const nextInventoryId = selectedInventoryId || undefined;

            // Release previous links in Supabase
            try {
              // Release classic link
              const { data: linkedItems } = await sb
                .from('inventory')
                .select('*')
                .eq('linked_order_id', order.id);
              if (linkedItems && linkedItems.length) {
                const ids = linkedItems.map((it: any) => it.id);
                await sb.from('inventory').update({ status: 'AVAILABLE', linked_order_id: null }).in('id', ids);
              }
              // Release account-based profiles on the previous inventory item if any
              if (order.inventoryItemId) {
                const { data: prevInv } = await sb.from('inventory').select('*').eq('id', order.inventoryItemId).single();
                if (prevInv && prevInv.is_account_based) {
                  const profiles = Array.isArray(prevInv.profiles) ? prevInv.profiles : [];
                  const nextProfiles = profiles.map((p: any) => p.assignedOrderId === order.id ? { ...p, isAssigned: false, assignedOrderId: null, assignedAt: null, expiryAt: null } : p);
                  await sb.from('inventory').update({ profiles: nextProfiles }).eq('id', order.inventoryItemId);
                }
              }
            } catch {}

            if (nextInventoryId) {
              const { data: inv } = await sb.from('inventory').select('*').eq('id', nextInventoryId).single();
              if (inv && inv.is_account_based) {
                if (!selectedProfileId) {
                  notify('Vui lòng chọn slot để cấp', 'warning');
                } else {
                  const profiles = Array.isArray(inv.profiles) ? inv.profiles : [];
                  const nextProfiles = profiles.map((p: any) => p.id === selectedProfileId
                    ? { ...p, isAssigned: true, assignedOrderId: order.id, assignedAt: new Date().toISOString(), expiryAt: new Date(orderData.expiryDate).toISOString() }
                    : p);
                  await sb.from('inventory').update({ profiles: nextProfiles }).eq('id', nextInventoryId);
                }
              } else {
                await sb.from('inventory').update({ status: 'SOLD', linked_order_id: order.id }).eq('id', nextInventoryId);
              }
            }
            const base = [`orderId=${order.id}; orderCode=${order.code}`];
            const detail = [...base, ...changedEntries].join('; ');
            try {
              const sb2 = getSupabase();
              if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Cập nhật đơn hàng', details: detail });
            } catch {}
            notify('Cập nhật đơn hàng thành công', 'success');
            onSuccess();
          } else {
            notify('Không thể cập nhật đơn hàng', 'error');
          }
        } catch (updateError) {
          const errorMessage = updateError instanceof Error ? updateError.message : 'Có lỗi xảy ra khi cập nhật đơn hàng';
          notify(errorMessage, 'error');
        }
      } else {
        // Create new order via Supabase
        const sb = getSupabase();
        if (!sb) throw new Error('Supabase not configured');
        const { data: createData, error: createErr } = await sb
          .from('orders')
          .insert({
            code: orderData.code,
            purchase_date: orderData.purchaseDate,
            package_id: orderData.packageId,
            customer_id: orderData.customerId,
            status: orderData.status,
            payment_status: orderData.paymentStatus,
            order_info: orderData.orderInfo,
            notes: orderData.notes,
            expiry_date: orderData.expiryDate,
            inventory_item_id: orderData.inventoryItemId,
            use_custom_price: orderData.useCustomPrice,
            custom_price: orderData.customPrice,
            custom_field_values: orderData.customFieldValues
          })
          .select('*')
          .single();
        if (createErr || !createData) throw new Error(createErr?.message || 'Tạo đơn thất bại');
        const created = {
          ...createData,
          id: createData.id,
          code: createData.code,
          createdAt: new Date(createData.created_at),
          updatedAt: new Date(createData.updated_at)
        } as Order;
        if (selectedInventoryId) {
          try {
            const sb2 = getSupabase();
            if (sb2) {
              const { data: inv } = await sb2.from('inventory').select('*').eq('id', selectedInventoryId).single();
              if (inv && inv.is_account_based) {
                if (!selectedProfileId) {
                  notify('Vui lòng chọn profile để cấp', 'warning');
                } else {
                  const profiles = Array.isArray(inv.profiles) ? inv.profiles : [];
                  const nextProfiles = profiles.map((p: any) => p.id === selectedProfileId
                    ? { ...p, isAssigned: true, assignedOrderId: created.id, assignedAt: new Date().toISOString(), expiryAt: new Date(orderData.expiryDate).toISOString() }
                    : p);
                  await sb2.from('inventory').update({ profiles: nextProfiles }).eq('id', selectedInventoryId);
                }
              } else {
                await sb2.from('inventory').update({ status: 'SOLD', linked_order_id: created.id }).eq('id', selectedInventoryId);
              }
            }
          } catch {}
        }
        try {
          const sb2 = getSupabase();
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Tạo đơn hàng', details: `orderId=${created.id}; orderCode=${created.code}; packageId=${orderData.packageId}; customerId=${orderData.customerId}; inventoryId=${selectedInventoryId || '-'}; profileId=${selectedProfileId || '-'}` });
        } catch {}
        notify('Tạo đơn hàng thành công', 'success');
        onSuccess();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Có lỗi xảy ra khi lưu đơn hàng';
      notify(errorMessage, 'error');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleCustomFieldChange = (fieldId: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      customFieldValues: { ...(prev.customFieldValues || {}), [fieldId]: value }
    }));
    const errorKey = `cf_${fieldId}`;
    if (errors[errorKey]) {
      setErrors(prev => ({ ...prev, [errorKey]: '' }));
    }
  };

  const handleProductChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const productId = e.target.value;
    setSelectedProduct(productId);
    setFormData(prev => ({
      ...prev,
      packageId: '' // Reset package selection
    }));
  };

  const handleCreateNewCustomer = () => {
    if (!newCustomerData.code.trim()) {
      notify('Vui lòng nhập mã khách hàng', 'warning');
      return;
    }
    if (!newCustomerData.name.trim()) {
      notify('Vui lòng nhập tên khách hàng', 'warning');
      return;
    }

    try {
      const newCustomer = Database.saveCustomer(newCustomerData);
      setCustomers(prev => [...prev, newCustomer]);
      setFormData(prev => ({
        ...prev,
        customerId: newCustomer.id
      }));
      setShowNewCustomerForm(false);
      setNewCustomerData({
        code: '',
        name: '',
        type: 'RETAIL',
        phone: '',
        email: ''
      });
      notify('Tạo khách hàng mới thành công', 'success');
    } catch (error) {
      notify('Có lỗi xảy ra khi tạo khách hàng mới', 'error');
    }
  };

  const getFilteredPackages = () => {
    if (!selectedProduct) return packages;
    return packages.filter(p => p.productId === selectedProduct);
  };

  const getSelectedPackage = () => {
    return packages.find(p => p.id === formData.packageId);
  };

  const getSelectedCustomer = () => {
    return customers.find(c => c.id === formData.customerId);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price);
  };

  return (
    <>
    <div className="modal">
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            {order ? 'Sửa đơn hàng' : 'Tạo đơn hàng mới'}
          </h3>
          <button
            type="button"
            className="close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">
              Mã đơn hàng <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              name="code"
              className={`form-control ${errors.code ? 'is-invalid' : ''}`}
              value={formData.code}
              onChange={handleChange}
              placeholder="Tự tạo như DH0001"
              readOnly
              disabled
              aria-disabled
              title={'Mã tự động tạo - không chỉnh sửa'}
              style={{ opacity: 0.6 } as React.CSSProperties}
            />
            {errors.code && (
              <div className="text-danger small mt-1">{errors.code}</div>
            )}
            {!order && !errors.code && (
              <div className="text-muted small mt-1">Mã đơn hàng được tạo tự động và không thể chỉnh sửa.</div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">
              Ngày mua <span className="text-danger">*</span>
            </label>
            <input
              type="date"
              name="purchaseDate"
              className={`form-control ${errors.purchaseDate ? 'is-invalid' : ''}`}
              value={formData.purchaseDate.toISOString().split('T')[0]}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                purchaseDate: new Date(e.target.value)
              }))}
            />
            {errors.purchaseDate && (
              <div className="text-danger small mt-1">{errors.purchaseDate}</div>
            )}
            {(() => {
              const pkg = getSelectedPackage();
              if (!pkg) return null;
              const preview = new Date(formData.purchaseDate);
              preview.setMonth(preview.getMonth() + pkg.warrantyPeriod);
              return (
                <div className="text-muted small mt-1">
                  Hết hạn (dự kiến): {preview.toLocaleDateString('vi-VN')}
                </div>
              );
            })()}
          </div>

          <div className="form-group">
            <label className="form-label">
              Sản phẩm <span className="text-danger">*</span>
            </label>
            <select
              name="product"
              className="form-control"
              value={selectedProduct}
              onChange={handleProductChange}
            >
              <option value="">Chọn sản phẩm</option>
              {products.map(product => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">
              Gói sản phẩm <span className="text-danger">*</span>
            </label>
            <select
              name="packageId"
              className={`form-control ${errors.packageId ? 'is-invalid' : ''}`}
              value={formData.packageId}
              onChange={handleChange}
              disabled={!selectedProduct}
            >
              <option value="">Chọn gói sản phẩm</option>
              {getFilteredPackages().map(pkg => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name} - {formatPrice(pkg.retailPrice)}
                </option>
              ))}
            </select>
            {errors.packageId && (
              <div className="text-danger small mt-1">{errors.packageId}</div>
            )}
          </div>

          {getSelectedPackage() && (
            <div className="alert alert-info">
              <strong>Thông tin gói:</strong>
              <div>Thời hạn: {getSelectedPackage()?.warrantyPeriod === 24 ? 'Vĩnh viễn (2 năm)' : `${getSelectedPackage()?.warrantyPeriod} tháng`}</div>
              <div>Giá CTV: {formatPrice(getSelectedPackage()?.ctvPrice || 0)}</div>
              <div>Giá khách lẻ: {formatPrice(getSelectedPackage()?.retailPrice || 0)}</div>
            </div>
          )}

          {(() => {
            const pkg = getSelectedPackage();
            if (!pkg || !pkg.customFields || pkg.customFields.length === 0) return null;
            return (
              <div className="card mb-3">
                <div className="card-header">
                  <h5>Trường tùy chỉnh</h5>
                </div>
                <div className="card-body">
                  {pkg.customFields.map(cf => (
                    <div key={cf.id} className="form-group">
                      <label className="form-label">
                        {cf.title} <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        className={`form-control ${errors[`cf_${cf.id}`] ? 'is-invalid' : ''}`}
                        value={(formData.customFieldValues || {})[cf.id] || ''}
                        onChange={(e) => handleCustomFieldChange(cf.id, e.target.value)}
                        placeholder={cf.placeholder || `Nhập ${cf.title.toLowerCase()}`}
                      />
                      {errors[`cf_${cf.id}`] && (
                        <div className="text-danger small mt-1">{errors[`cf_${cf.id}`]}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {!!availableInventory.length && (
            <div className="card mb-3">
              <div className="card-header">
                <h5>Kho hàng sẵn có cho gói này ({availableInventory.length})</h5>
              </div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Chọn hàng trong kho (không bắt buộc)</label>
                  <select
                    className="form-control"
                    value={selectedInventoryId}
                    onChange={(e) => setSelectedInventoryId(e.target.value)}
                  >
                    <option value="">Không chọn</option>
                    {availableInventory.map(item => (
                      <option key={item.id} value={item.id}>
                        #{item.code} | Nhập: {new Date(item.purchaseDate).toISOString().split('T')[0]} | HSD: {new Date(item.expiryDate).toISOString().split('T')[0]}
                      </option>
                    ))}
                  </select>
                  <div className="small text-muted mt-1">Nếu chọn, đơn sẽ sử dụng hàng trong kho và tự đánh dấu là đã bán.</div>
                  {!!selectedInventoryId && (() => {
                    const item = availableInventory.find(i => i.id === selectedInventoryId) || Database.getInventory().find(i => i.id === selectedInventoryId);
                    if (!item) return null;
                    return (
                      <div className="mt-2 p-2 border rounded bg-light">
                        {item.productInfo && <div><strong>Thông tin SP:</strong> {item.productInfo}</div>}
                        {item.sourceNote && <div><strong>Nguồn nhập:</strong> {item.sourceNote}</div>}
                        {typeof item.purchasePrice === 'number' && (
                          <div><strong>Giá nhập:</strong> {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.purchasePrice)}</div>
                        )}
                        <div><strong>Trạng thái:</strong> {item.status}</div>
                        {item.isAccountBased && (
                          <div className="mt-2">
                            <label className="form-label">Chọn slot để cấp</label>
                            <select
                              className="form-control"
                              value={selectedProfileId}
                              onChange={(e) => setSelectedProfileId(e.target.value)}
                              required
                            >
                              {(item.profiles || []).filter(p => !p.isAssigned || p.assignedOrderId === (order?.id || '')).map(p => (
                                <option key={p.id} value={p.id}>{p.label} {p.isAssigned ? '(đang cấp cho đơn này)' : ''}</option>
                              ))}
                            </select>
                            <div className="small text-muted mt-1">Tự động import các cột đã tick vào Thông tin đơn hàng và đánh dấu slot.</div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">
              Khách hàng <span className="text-danger">*</span>
            </label>
            <div className="d-flex gap-2">
              <select
                name="customerId"
                className={`form-control ${errors.customerId ? 'is-invalid' : ''}`}
                value={formData.customerId}
                onChange={handleChange}
              >
                <option value="">Chọn khách hàng</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} ({customer.type === 'CTV' ? 'CTV' : 'Khách lẻ'})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewCustomerForm(!showNewCustomerForm)}
                className="btn btn-secondary"
              >
                Tạo mới
              </button>
            </div>
            {errors.customerId && (
              <div className="text-danger small mt-1">{errors.customerId}</div>
            )}
          </div>

          {(() => {
            // Enforce inventory selection message only for new orders
            const hasAvailable = (availableInventory || []).length > 0;
            if (!order) {
              return (
                <div className="alert alert-warning">
                  {hasAvailable
                    ? 'Vui lòng chọn hàng trong kho để hoàn tất (bắt buộc). Nếu không chọn, đơn sẽ ở trạng thái Đang xử lý.'
                    : 'Hiện chưa có hàng trong kho cho gói này. Đơn sẽ ở trạng thái Đang xử lý.'}
                </div>
              );
            }
            return null;
          })()}

          {showNewCustomerForm && (
            <div className="card mb-3">
              <div className="card-header">
                <h5>Tạo khách hàng mới</h5>
              </div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-6">
                    <div className="form-group">
                      <label className="form-label">Mã khách hàng</label>
                      <input
                        type="text"
                        className="form-control"
                        value={newCustomerData.code}
                        onChange={(e) => setNewCustomerData(prev => ({
                          ...prev,
                          code: e.target.value
                        }))}
                        placeholder="Nhập mã khách hàng (ví dụ: KH001)"
                      />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label className="form-label">Tên khách hàng</label>
                      <input
                        type="text"
                        className="form-control"
                        value={newCustomerData.name}
                        onChange={(e) => setNewCustomerData(prev => ({
                          ...prev,
                          name: e.target.value
                        }))}
                        placeholder="Nhập tên khách hàng"
                      />
                    </div>
                  </div>
                </div>
                <div className="row">
                  <div className="col-md-6">
                    <div className="form-group">
                      <label className="form-label">Loại khách</label>
                      <select
                        className="form-control"
                        value={newCustomerData.type}
                        onChange={(e) => setNewCustomerData(prev => ({
                          ...prev,
                          type: e.target.value as 'CTV' | 'RETAIL'
                        }))}
                      >
                        <option value="RETAIL">Khách lẻ</option>
                        <option value="CTV">Cộng tác viên</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="row">
                  <div className="col-md-6">
                    <div className="form-group">
                      <label className="form-label">SĐT</label>
                      <input
                        type="tel"
                        className="form-control"
                        value={newCustomerData.phone}
                        onChange={(e) => setNewCustomerData(prev => ({
                          ...prev,
                          phone: e.target.value
                        }))}
                        placeholder="Nhập số điện thoại"
                      />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label className="form-label">Email</label>
                      <input
                        type="email"
                        className="form-control"
                        value={newCustomerData.email}
                        onChange={(e) => setNewCustomerData(prev => ({
                          ...prev,
                          email: e.target.value
                        }))}
                        placeholder="Nhập email"
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCreateNewCustomer}
                  className="btn btn-success"
                >
                  Tạo khách hàng
                </button>
              </div>
            </div>
          )}

          {getSelectedCustomer() && getSelectedPackage() && (
            <div className="form-group">
              <div className="d-flex align-items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  id="useCustomPrice"
                  checked={formData.useCustomPrice || false}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    useCustomPrice: e.target.checked,
                    customPrice: e.target.checked ? (prev.customPrice || 0) : 0
                  }))}
                />
                <label htmlFor="useCustomPrice" className="mb-0 ms-2 flex-grow-0">
                  Giá tùy chỉnh
                </label>
              </div>
              
              {formData.useCustomPrice ? (
                <>
                  <div className="form-group">
                    <label className="form-label">Giá bán tùy chỉnh (₫)</label>
                    <input
                      type="number"
                      className={`form-control ${errors.customPrice ? 'is-invalid' : ''}`}
                      value={formData.customPrice || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        customPrice: parseFloat(e.target.value) || 0
                      }))}
                      placeholder="Nhập giá tùy chỉnh"
                      min="0"
                      step="1000"
                    />
                    {errors.customPrice && (
                      <div className="text-danger small mt-1">{errors.customPrice}</div>
                    )}
                  </div>
                  <div className="alert alert-success">
                    <strong>Giá bán:</strong> {formatPrice(formData.customPrice || 0)}
                  </div>
                </>
              ) : (
                <div className="alert alert-success">
                  <strong>Giá bán:</strong> {formatPrice(
                    getSelectedCustomer()?.type === 'CTV' 
                      ? getSelectedPackage()?.ctvPrice || 0
                      : getSelectedPackage()?.retailPrice || 0
                  )}
                </div>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Trạng thái đơn hàng</label>
            <select
              name="status"
              className="form-control"
              value={formData.status}
              onChange={(e) => {
                const val = e.target.value as any;
                // Only allow cancelling manually
                if (val === 'CANCELLED') {
                  setFormData(prev => ({ ...prev, status: 'CANCELLED' }));
                }
              }}
            >
              <option value={formData.status}>{ORDER_STATUSES.find(s => s.value === formData.status)?.label || formData.status}</option>
              <option value="CANCELLED">Đã hủy</option>
            </select>
            <small className="text-muted">Trạng thái tự động: Hoàn thành khi đã chọn kho, Đang xử lý nếu chưa chọn.</small>
          </div>

          <div className="form-group">
            <label className="form-label">Thanh toán</label>
            <select
              name="paymentStatus"
              className="form-control"
              value={formData.paymentStatus}
              onChange={handleChange}
            >
              {PAYMENT_STATUSES.map(s => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Thông tin đơn hàng</label>
            <textarea
              name="orderInfo"
              className="form-control"
              value={(() => {
                const item = selectedInventoryId ? (availableInventory.find(i => i.id === selectedInventoryId) || Database.getInventory().find(i => i.id === selectedInventoryId)) : undefined;
                if (!item) return '';
                if (item.isAccountBased) {
                  // Build using the currently selected package columns to avoid drift
                  const itemForOrder = { ...item, packageId: formData.packageId } as InventoryItem;
                  return Database.buildOrderInfoFromAccount(itemForOrder, selectedProfileId || undefined);
                }
                return item.productInfo || '';
              })()}
              readOnly
              disabled
              placeholder="Ví dụ: mã kích hoạt/serial/tài khoản bàn giao..."
              rows={3}
            />
            <div className="small text-muted mt-1">Thông tin này được tự động lấy từ kho hàng.</div>
          </div>

          <div className="form-group">
            <label className="form-label">Ghi chú</label>
            <textarea
              name="notes"
              className="form-control"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Nhập ghi chú thêm"
              rows={3}
            />
          </div>

          <div className="d-flex justify-content-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Hủy
            </button>
            {order && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  const invLinked = Database.getInventory().find(i => i.linkedOrderId === order.id);
                  const isExpired = new Date(order.expiryDate) < new Date();
                  const msg = isExpired && invLinked
                    ? 'Đơn đã hết hạn và có slot liên kết. Vui lòng xác nhận bạn đã xóa slot/tài khoản khỏi dịch vụ trước khi xóa đơn.'
                    : 'Bạn có chắc chắn muốn xóa đơn hàng này?';
                  setConfirmState({
                    message: msg,
                    onConfirm: async () => {
                      // Resolve inventory to release (classic or account-based)
                      const inv = (() => {
                        if (order.inventoryItemId) {
                          const found = Database.getInventory().find(i => i.id === order.inventoryItemId);
                          if (found) {
                            if (found.linkedOrderId === order.id) return found;
                            if (found.isAccountBased && (found.profiles || []).some(p => p.assignedOrderId === order.id)) return found;
                          }
                        }
                        const byLinked = Database.getInventory().find(i => i.linkedOrderId === order.id);
                        if (byLinked) return byLinked;
                        return Database.getInventory().find(i => i.isAccountBased && (i.profiles || []).some(p => p.assignedOrderId === order.id));
                      })();

                      if (inv) {
                        if (inv.isAccountBased) {
                          const assignedProfile = (inv.profiles || []).find(p => p.assignedOrderId === order.id);
                          if (assignedProfile) {
                            Database.releaseProfile(inv.id, assignedProfile.id);
                          }
                          // Also detach classic link if any
                          if (inv.linkedOrderId === order.id) {
                            Database.releaseInventoryItem(inv.id);
                          }
                        } else {
                          Database.releaseInventoryItem(inv.id);
                        }
                        try {
                          const sb2 = getSupabase();
                          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Gỡ liên kết kho khỏi đơn', details: `orderId=${order.id}; inventoryId=${inv.id}` });
                        } catch {}
                      }
                      const success = Database.deleteOrder(order.id);
                      if (success) {
                        try {
                          const sb2 = getSupabase();
                          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Xóa đơn hàng', details: `orderId=${order.id}` });
                        } catch {}
                        onClose();
                        onSuccess();
                      } else {
                        notify('Không thể xóa đơn hàng', 'error');
                      }
                    }
                  });
                }}
              >
                Xóa đơn hàng
              </button>
            )}
            <button
              type="submit"
              className="btn btn-primary"
            >
              {order ? 'Cập nhật' : 'Tạo đơn hàng'}
            </button>
          </div>
        </form>
      </div>
    </div>
    {confirmState && (
      <div
        className="modal"
        role="dialog"
        aria-modal
        style={{ zIndex: 10000, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 } as React.CSSProperties}
      >
        <div className="modal-content" style={{ maxWidth: 420, zIndex: 10001 }}>
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
    </>
  );
};

export default OrderForm;

