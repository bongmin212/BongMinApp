import React, { useState, useEffect } from 'react';
import { Order, Customer, ProductPackage, Product, OrderFormData, ORDER_STATUSES, PAYMENT_STATUSES, InventoryItem, OrderStatus, CUSTOMER_TYPES, CUSTOMER_SOURCES, CustomerSource } from '../../types';
import { Database } from '../../utils/database';
import { getSupabase } from '../../utils/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

// Debug logging helper: disabled in production builds
const debugLog = (...args: any[]) => {
  if (process.env.NODE_ENV !== 'production') console.log(...args);
};

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
    customFieldValues: {},
    useCustomExpiry: false,
    customExpiryDate: undefined
  });
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [availableInventory, setAvailableInventory] = useState<InventoryItem[]>([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>('');
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [inventoryError, setInventoryError] = useState<string>('');
  // Search states (debounced)
  const [productSearch, setProductSearch] = useState('');
  const [debouncedProductSearch, setDebouncedProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [debouncedInventorySearch, setDebouncedInventorySearch] = useState('');
  const [newCustomerData, setNewCustomerData] = useState<{
    code: string;
    name: string;
    type: 'CTV' | 'RETAIL';
    phone: string;
    email: string;
    source?: string;
    sourceDetail: string;
    notes: string;
  }>({
    code: '',
    name: '',
    type: 'RETAIL',
    phone: '',
    email: '',
    source: undefined,
    sourceDetail: '',
    notes: ''
  });
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [confirmState, setConfirmState] = useState<null | { message: string; onConfirm: () => void }>(null);

  useEffect(() => {
    loadData();
    
    if (order) {
      (async () => {
        // Check if inventory is still linked to this order
        let invLinked = '';
        try {
          const sb = getSupabase();
          if (sb && order.inventoryItemId) {
            const { data: inv } = await sb.from('inventory').select('*').eq('id', order.inventoryItemId).single();
            if (inv) {
              if (inv.linked_order_id === order.id) {
                invLinked = order.inventoryItemId;
              } else if (inv.is_account_based && (inv.profiles || []).some((p: any) => p.assignedOrderId === order.id)) {
                invLinked = order.inventoryItemId;
              }
            }
          }
          if (!invLinked && sb) {
            const { data: invByOrder } = await sb.from('inventory').select('id').eq('linked_order_id', order.id).maybeSingle();
            if (invByOrder?.id) invLinked = invByOrder.id as any;
          }
          if (!invLinked && sb) {
            const { data: invList } = await sb.from('inventory').select('*').eq('is_account_based', true);
            const found = (invList || []).find((i: any) => Array.isArray(i.profiles) && i.profiles.some((p: any) => p.assignedOrderId === order.id));
            if (found) invLinked = found.id as any;
          }
        } catch {}

        setSelectedInventoryId(invLinked);
      })();
      
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
        customFieldValues: (order as any).customFieldValues || {},
        useCustomExpiry: false,
        customExpiryDate: order.expiryDate ? new Date(order.expiryDate) : undefined
      });
      if ((order as any).inventoryProfileIds && Array.isArray((order as any).inventoryProfileIds)) {
        setSelectedProfileIds((order as any).inventoryProfileIds);
      } else if ((order as any).inventoryProfileId) {
        // Backward compatibility
        setSelectedProfileIds([(order as any).inventoryProfileId]);
      }
    } else {
      // Prefill auto code for new order (from Supabase)
      (async () => {
        try {
          const sb = getSupabase();
          if (!sb) return;
          const { data } = await sb.from('orders').select('code').order('created_at', { ascending: false }).limit(2000);
          const codes = (data || []).map((r: any) => String(r.code || '')) as string[];
          const nextCode = Database.generateNextCodeFromList(codes, 'DH', 4);
          setFormData(prev => ({ ...prev, code: nextCode }));
        } catch {}
      })();
    }
  }, [order]);

  // Force refresh code when form opens for new order
  useEffect(() => {
    if (!order) {
      (async () => {
        try {
          const sb = getSupabase();
          if (!sb) return;
          const { data } = await sb.from('orders').select('code').order('created_at', { ascending: false }).limit(2000);
          const codes = (data || []).map((r: any) => String(r.code || '')) as string[];
          const nextCode = Database.generateNextCodeFromList(codes, 'DH', 4);
          setFormData(prev => ({
            ...prev,
            code: nextCode,
            purchaseDate: new Date(),
            packageId: '',
            customerId: '',
            status: 'PROCESSING',
            paymentStatus: 'UNPAID',
            orderInfo: '',
            notes: '',
            useCustomPrice: false,
            customPrice: 0,
            customFieldValues: {},
            inventoryProfileId: '',
            useCustomExpiry: false,
            customExpiryDate: undefined
          }));
        } catch {
          // Fallback to local storage method
          const nextCode = Database.generateNextOrderCode('DH', 4);
          setFormData(prev => ({
            ...prev,
            code: nextCode,
            purchaseDate: new Date(),
            packageId: '',
            customerId: '',
            status: 'PROCESSING',
            paymentStatus: 'UNPAID',
            orderInfo: '',
            notes: '',
            useCustomPrice: false,
            customPrice: 0,
            customFieldValues: {},
            inventoryProfileId: '',
            useCustomExpiry: false,
            customExpiryDate: undefined
          }));
        }
      })();
    }
  }, []);

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
    const allProducts = (productsRes.data || []).map((r: any) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description || '',
      sharedInventoryPool: !!r.shared_inventory_pool,
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
      let items = (data || []).map((i: any) => {
        const item = {
          ...i,
          productId: i.product_id,
          packageId: i.package_id,
          productInfo: i.product_info,
          purchaseDate: i.purchase_date ? new Date(i.purchase_date) : new Date(),
          expiryDate: i.expiry_date ? new Date(i.expiry_date) : undefined,
          purchasePrice: i.purchase_price,
          sourceNote: i.source_note,
          createdAt: i.created_at ? new Date(i.created_at) : new Date(),
          updatedAt: i.updated_at ? new Date(i.updated_at) : new Date(),
          isAccountBased: i.is_account_based,
          accountColumns: i.account_columns,
          accountData: i.account_data,
          totalSlots: i.total_slots,
          profiles: i.profiles,
          poolWarrantyMonths: i.pool_warranty_months
        } as InventoryItem;
        
        // Generate missing profiles for account-based inventory
        if (item.isAccountBased && (!item.profiles || item.profiles.length === 0) && item.totalSlots && item.totalSlots > 0) {
          item.profiles = Array.from({ length: item.totalSlots }, (_, idx) => ({
            id: `slot-${idx + 1}`,
            label: `Slot ${idx + 1}`,
            isAssigned: false
          }));
        }
        
        return item;
      }) as InventoryItem[];
      // Filter availability: for account-based, allow items with at least one free, non-needsUpdate slot; for classic, AVAILABLE and not linked
      items = items.filter((i: any) => {
        if (i.isAccountBased) {
          const profiles = Array.isArray(i.profiles) ? i.profiles : [];
          const hasFree = profiles.some((p: any) => !p.isAssigned && !(p as any).needsUpdate);
          return hasFree;
        }
        return i.status === 'AVAILABLE' && !i.linked_order_id;
      });

      // Include linked inventory for editing
      let merged: InventoryItem[] = items;
      if (order?.inventoryItemId) {
        const { data: linked } = await sb.from('inventory').select('*').eq('id', order.inventoryItemId).single();
        if (linked) {
            const linkedMapped = {
            ...linked,
            productId: linked.product_id,
            packageId: linked.package_id,
            productInfo: linked.product_info,
            purchaseDate: linked.purchase_date ? new Date(linked.purchase_date) : new Date(),
            expiryDate: linked.expiry_date ? new Date(linked.expiry_date) : undefined,
            purchasePrice: linked.purchase_price,
            sourceNote: linked.source_note,
            createdAt: linked.created_at ? new Date(linked.created_at) : new Date(),
            updatedAt: linked.updated_at ? new Date(linked.updated_at) : new Date(),
            isAccountBased: linked.is_account_based,
            accountColumns: linked.account_columns,
            accountData: linked.account_data,
            totalSlots: linked.total_slots,
            profiles: linked.profiles,
            poolWarrantyMonths: linked.pool_warranty_months
          } as any;
          
          // Generate missing profiles for account-based inventory
          if (linkedMapped.isAccountBased && (!linkedMapped.profiles || linkedMapped.profiles.length === 0) && linkedMapped.totalSlots && linkedMapped.totalSlots > 0) {
            linkedMapped.profiles = Array.from({ length: linkedMapped.totalSlots }, (_, idx) => ({
              id: `slot-${idx + 1}`,
              label: `Slot ${idx + 1}`,
              isAssigned: false
            }));
          }
          merged = [linkedMapped as InventoryItem, ...items.filter(i => i.id !== linkedMapped.id)];
        }
      } else if (order) {
        const { data: byOrder } = await sb.from('inventory').select('*').eq('linked_order_id', order.id).limit(1);
        if (byOrder && byOrder[0]) {
          const l = byOrder[0];
          const mapped = {
            ...l,
            productId: l.product_id,
            packageId: l.package_id,
            productInfo: l.product_info,
            purchaseDate: l.purchase_date ? new Date(l.purchase_date) : new Date(),
            expiryDate: l.expiry_date ? new Date(l.expiry_date) : undefined,
            purchasePrice: l.purchase_price,
            sourceNote: l.source_note,
            createdAt: l.created_at ? new Date(l.created_at) : new Date(),
            updatedAt: l.updated_at ? new Date(l.updated_at) : new Date(),
            isAccountBased: l.is_account_based,
            accountColumns: l.account_columns,
            accountData: l.account_data,
            totalSlots: l.total_slots,
            profiles: l.profiles,
            poolWarrantyMonths: l.pool_warranty_months
          } as any;
          
          // Generate missing profiles for account-based inventory
          if (mapped.isAccountBased && (!mapped.profiles || mapped.profiles.length === 0) && mapped.totalSlots && mapped.totalSlots > 0) {
            mapped.profiles = Array.from({ length: mapped.totalSlots }, (_, idx) => ({
              id: `slot-${idx + 1}`,
              label: `Slot ${idx + 1}`,
              isAssigned: false
            }));
          }
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

  // Auto-pick slot for account-based inventory
  // For new orders: do NOT auto-select; require explicit user choice
  // For editing: preserve the slots already assigned to this order if present
  useEffect(() => {
    if (!selectedInventoryId) return;
    const inv = availableInventory.find(i => i.id === selectedInventoryId);
    const pkg = packages.find(p => p.id === formData.packageId);
    if (!(inv?.isAccountBased || pkg?.isAccountBased)) return;
    const profiles = Array.isArray(inv?.profiles) ? (inv as any).profiles : [];
    const allowed = profiles.filter((p: any) => !p.isAssigned || p.assignedOrderId === (order?.id || ''));
    if (!allowed.length) {
      setSelectedProfileIds([]);
      return;
    }
    // New order: don't auto-pick slots
    if (!order) {
      setSelectedProfileIds(prev => prev.filter(id => allowed.some((p: any) => p.id === id)));
      return;
    }
    // Editing existing order: keep current/assigned slots
    const existingIds = (order as any)?.inventoryProfileIds || [];
    const existingId = (order as any)?.inventoryProfileId; // backward compatibility
    const validExistingIds = existingIds.filter((id: string) => allowed.some((p: any) => p.id === id));
    const validExistingId = existingId && allowed.some((p: any) => p.id === existingId) ? [existingId] : [];
    setSelectedProfileIds(validExistingIds.length > 0 ? validExistingIds : validExistingId);
  }, [selectedInventoryId, availableInventory, packages, formData.packageId, order]);

  // Reset custom fields and selected slot when package changes (new order flow)
  useEffect(() => {
    // Only apply on creating new orders
    if (!order) {
      setFormData(prev => ({
        ...prev,
        customFieldValues: {}
      }));
      setSelectedProfileIds([]);
    }
  }, [formData.packageId, order]);

  // Ensure selected product is correct on edit so package select isn't disabled
  useEffect(() => {
    if (order && packages.length) {
      const pkg = packages.find(p => p.id === (order?.packageId || ''));
      if (pkg) {
        setSelectedProduct(pkg.productId);
      }
    }
  }, [order, packages]);

  // Debounce search inputs (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedProductSearch(productSearch.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [productSearch]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedCustomerSearch(customerSearch.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [customerSearch]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedInventorySearch(inventorySearch.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [inventorySearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Ensure code exists even if effect hasn't populated yet
    const ensuredCode = (formData.code || '').trim() || Database.generateNextOrderCode('DH', 4);
    if (!(formData.code || '').trim()) {
      setFormData(prev => ({ ...prev, code: ensuredCode }));
    }

    // Validation
    const newErrors: {[key: string]: string} = {};
    // Inventory selection optional: allow creating orders without linking inventory
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
    if (formData.useCustomExpiry) {
      const d = formData.customExpiryDate instanceof Date ? formData.customExpiryDate : (formData.customExpiryDate ? new Date(formData.customExpiryDate as any) : undefined);
      if (!d || isNaN(d.getTime())) {
        newErrors.customExpiryDate = 'Vui lòng chọn ngày hết hạn hợp lệ';
      }
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
      const inv = availableInventory.find(i => i.id === selectedInventoryId);
      const pkg = packages.find(p => p.id === formData.packageId);
      if ((inv?.isAccountBased || pkg?.isAccountBased) && selectedProfileIds.length === 0) {
        newErrors["inventoryProfileId"] = 'Vui lòng chọn ít nhất 1 slot để cấp';
      }
      // Enforce exclusive linking: prevent selecting an inventory item that already has any assignment/link other than this order
      if (inv) {
        if (inv.isAccountBased) {
          // Only validate chosen slots availability; ignore other occupied slots
          if (selectedProfileIds.length > 0) {
            const invalidSlots = selectedProfileIds.filter(profileId => {
              const chosen = (inv.profiles || []).find(p => p.id === profileId);
              return !chosen || (chosen as any).needsUpdate || (chosen as any).isAssigned && (chosen as any).assignedOrderId !== (order?.id || '');
            });
            if (invalidSlots.length > 0) {
              newErrors["inventoryProfileId"] = 'Một số slot không hợp lệ, vui lòng chọn slot trống';
            }
          }
        } else {
          if ((inv as any).linkedOrderId && (inv as any).linkedOrderId !== (order?.id || '')) {
            newErrors["inventory"] = 'Kho này đang liên kết đơn khác';
          }
        }
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

      // Calculate expiry date (allow override by custom expiry)
      const purchaseDate = new Date(formData.purchaseDate);
      let expiryDate = new Date(purchaseDate);
      
      if (formData.useCustomExpiry && formData.customExpiryDate) {
        expiryDate = new Date(formData.customExpiryDate);
      } else {
        // Always use selected package warranty period, even for shared pools
        expiryDate.setMonth(expiryDate.getMonth() + selectedPackage.warrantyPeriod);
      }

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

      const pickedInventory = selectedInventoryId ? availableInventory.find(i => i.id === selectedInventoryId) : undefined;
      const pkgConfig = packages.find(p => p.id === formData.packageId);
      // Auto-import info from warehouse
      const autoInfo = (() => {
        if (!pickedInventory) return '';
        if (pickedInventory.isAccountBased || pkgConfig?.isAccountBased) {
          // Rebuild using latest package columns to avoid drift
          return Database.buildOrderInfoFromAccount({ ...pickedInventory, packageId: formData.packageId } as any, selectedProfileIds.length > 0 ? selectedProfileIds : undefined);
        }
        return pickedInventory.productInfo || '';
      })();

      const orderData = {
        ...formData,
        code: ensuredCode,
        expiryDate,
        createdBy: state.user?.id || '',
        inventoryItemId: selectedInventoryId || undefined,
        inventoryProfileIds: (pickedInventory?.isAccountBased || pkgConfig?.isAccountBased) 
          ? (selectedProfileIds.length > 0 ? selectedProfileIds : undefined) 
          : undefined,
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
          purchaseDate: order.purchaseDate instanceof Date && !isNaN(order.purchaseDate.getTime()) ? order.purchaseDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          packageId: order.packageId,
          customerId: order.customerId,
          status: order.status,
          paymentStatus: (order as any).paymentStatus || 'UNPAID',
          orderInfo: (order as any).orderInfo || '',
          notes: order.notes || '',
          expiryDate: order.expiryDate instanceof Date && !isNaN(order.expiryDate.getTime()) ? order.expiryDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          inventoryItemId: order.inventoryItemId || '',
          useCustomPrice: order.useCustomPrice || false,
          customPrice: order.customPrice || 0,
          customFieldValues: JSON.stringify((order as any).customFieldValues || {})
        } as const;

        const nextSnapshot = {
          code: orderData.code || '',
          purchaseDate: orderData.purchaseDate instanceof Date && !isNaN(orderData.purchaseDate.getTime()) ? orderData.purchaseDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          packageId: orderData.packageId,
          customerId: orderData.customerId,
          status: orderData.status,
          paymentStatus: orderData.paymentStatus,
          orderInfo: orderData.orderInfo || '',
          notes: orderData.notes || '',
          expiryDate: orderData.expiryDate instanceof Date && !isNaN(orderData.expiryDate.getTime()) ? orderData.expiryDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
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
            // Use friendly field names
            const fieldLabels: Record<string, string> = {
              code: 'Mã đơn hàng',
              purchaseDate: 'Ngày mua',
              packageId: 'Gói sản phẩm',
              customerId: 'Khách hàng',
              status: 'Trạng thái',
              paymentStatus: 'Thanh toán',
              orderInfo: 'Thông tin đơn',
              notes: 'Ghi chú',
              expiryDate: 'Ngày hết hạn',
              inventoryItemId: 'Liên kết kho',
              useCustomPrice: 'Sử dụng giá tùy chỉnh',
              customPrice: 'Giá tùy chỉnh',
              customFieldValues: 'Giá trị trường tùy chỉnh'
            };
            const label = fieldLabels[key] || key;
            changedEntries.push(`${key}=${beforeVal}->${afterVal}`);
          }
        });

        try {
          const sb = getSupabase();
          if (!sb) throw new Error('Supabase not configured');
          const updateData = {
            code: orderData.code,
            purchase_date: orderData.purchaseDate instanceof Date ? orderData.purchaseDate.toISOString() : orderData.purchaseDate,
            package_id: orderData.packageId,
            customer_id: orderData.customerId,
            status: orderData.status,
            payment_status: orderData.paymentStatus,
            order_info: orderData.orderInfo || null,
            notes: orderData.notes || null,
            expiry_date: orderData.expiryDate instanceof Date ? orderData.expiryDate.toISOString() : orderData.expiryDate,
            inventory_item_id: orderData.inventoryItemId || null,
            inventory_profile_ids: orderData.inventoryProfileIds || null,
            use_custom_price: orderData.useCustomPrice || false,
            custom_price: orderData.customPrice || null,
            custom_field_values: orderData.customFieldValues || null
          };
          debugLog('=== ORDER UPDATE DEBUG ===');
          debugLog('Order ID:', order.id);
          debugLog('Update data:', updateData);
          debugLog('inventory_profile_id being sent:', orderData.inventoryProfileId);
          
          const { data: updateResult, error } = await sb
            .from('orders')
            .update(updateData)
            .eq('id', order.id)
            .select('*')
            .single();
          
          debugLog('Update result:', updateResult);
          debugLog('Update result inventory_profile_id:', updateResult?.inventory_profile_id);
          debugLog('Update error:', error);
          
          if (error) {
            console.error('Supabase update error:', error);
            console.error('Error details:', JSON.stringify(error, null, 2));
            notify(`Lỗi cập nhật: ${error.message}`, 'error');
            return;
          }
          
          if (updateResult) {
            // Convert Supabase response to our Order format and update local storage
            const updatedOrder: Order = {
              id: updateResult.id,
              code: updateResult.code,
              purchaseDate: updateResult.purchase_date ? new Date(updateResult.purchase_date) : new Date(),
              expiryDate: updateResult.expiry_date ? new Date(updateResult.expiry_date) : new Date(),
              packageId: updateResult.package_id,
              customerId: updateResult.customer_id,
              status: updateResult.status,
              paymentStatus: updateResult.payment_status,
              orderInfo: updateResult.order_info,
              notes: updateResult.notes,
              inventoryItemId: updateResult.inventory_item_id,
              inventoryProfileIds: updateResult.inventory_profile_ids || undefined,
              inventoryProfileId: updateResult.inventory_profile_id || undefined, // Backward compatibility
              cogs: updateResult.cogs,
              useCustomPrice: updateResult.use_custom_price,
              customPrice: updateResult.custom_price,
              customFieldValues: updateResult.custom_field_values,
              createdBy: updateResult.created_by || state.user?.id || 'system',
              createdAt: updateResult.created_at ? new Date(updateResult.created_at) : new Date(),
              updatedAt: updateResult.updated_at ? new Date(updateResult.updated_at) : new Date()
            };
            
            // Update local storage
            const currentOrders = Database.getOrders();
            const orderIndex = currentOrders.findIndex(o => o.id === order.id);
            if (orderIndex !== -1) {
              currentOrders[orderIndex] = updatedOrder;
              Database.setOrders(currentOrders);
            }
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
              debugLog('=== INVENTORY UPDATE DEBUG ===');
              debugLog('nextInventoryId:', nextInventoryId);
              debugLog('selectedProfileIds:', selectedProfileIds);
              
              const { data: inv } = await sb.from('inventory').select('*').eq('id', nextInventoryId).single();
              debugLog('Found inventory item:', inv);
              
              if (inv && inv.is_account_based) {
                if (selectedProfileIds.length === 0) {
                  notify('Vui lòng chọn slot để cấp', 'warning');
                } else {
                  let profiles = Array.isArray(inv.profiles) ? inv.profiles : [];
                  debugLog('Current profiles:', profiles);
                  
                  // If profiles array is empty, generate default profiles
                  if (profiles.length === 0 && inv.total_slots && inv.total_slots > 0) {
                    debugLog('Generating default profiles for inventory item');
                    profiles = Array.from({ length: inv.total_slots }, (_, idx) => ({
                      id: `slot-${idx + 1}`,
                      label: `Slot ${idx + 1}`,
                      isAssigned: false
                    }));
                  }
                  
                  const nextProfiles = profiles.map((p: any) => 
                    selectedProfileIds.includes(p.id)
                      ? { ...p, isAssigned: true, assignedOrderId: order.id, assignedAt: new Date().toISOString(), expiryAt: new Date(orderData.expiryDate).toISOString() }
                      : p);
                  debugLog('Updated profiles:', nextProfiles);
                  
                  const { error: updateError } = await sb.from('inventory').update({ profiles: nextProfiles }).eq('id', nextInventoryId);
                  if (updateError) {
                    console.error('Error updating inventory profiles:', updateError);
                  } else {
                    debugLog('Successfully updated inventory profiles');
                  }
                }
              } else {
                debugLog('Updating classic inventory link');
                const { error: updateError } = await sb.from('inventory').update({ status: 'SOLD', linked_order_id: order.id }).eq('id', nextInventoryId);
                if (updateError) {
                  console.error('Error updating inventory link:', updateError);
                } else {
                  debugLog('Successfully updated inventory link');
                }
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
          }
        } catch (updateError) {
          const errorMessage = updateError instanceof Error ? updateError.message : 'Có lỗi xảy ra khi cập nhật đơn hàng';
          notify(errorMessage, 'error');
        }
      } else {
        // Create new order via Supabase
        const sb = getSupabase();
        if (!sb) throw new Error('Supabase not configured');
        // Debug logging
        debugLog('=== ORDER CREATION DEBUG ===');
        debugLog('packageId:', orderData.packageId, 'Type:', typeof orderData.packageId);
        debugLog('customerId:', orderData.customerId, 'Type:', typeof orderData.customerId);
        debugLog('inventoryItemId:', orderData.inventoryItemId, 'Type:', typeof orderData.inventoryItemId);
        debugLog('inventoryProfileId:', orderData.inventoryProfileId, 'Type:', typeof orderData.inventoryProfileId);
        debugLog('selectedInventoryId:', selectedInventoryId, 'Type:', typeof selectedInventoryId);
        debugLog('selectedProfileIds:', selectedProfileIds, 'Type:', typeof selectedProfileIds);
        debugLog('inventory_profile_id being sent:', orderData.inventoryProfileId);
        
        const insertData = {
          code: orderData.code,
          purchase_date: orderData.purchaseDate instanceof Date ? orderData.purchaseDate.toISOString() : orderData.purchaseDate,
          package_id: orderData.packageId,
          customer_id: orderData.customerId,
          status: orderData.status,
          payment_status: orderData.paymentStatus,
          order_info: orderData.orderInfo || null,
          notes: orderData.notes || null,
          expiry_date: orderData.expiryDate instanceof Date ? orderData.expiryDate.toISOString() : orderData.expiryDate,
          inventory_item_id: orderData.inventoryItemId || null,
          inventory_profile_ids: orderData.inventoryProfileIds || null,
          use_custom_price: orderData.useCustomPrice || false,
          custom_price: orderData.customPrice || null,
          custom_field_values: orderData.customFieldValues || null,
          created_by: state.user?.id || 'system'
        };
        debugLog('Insert data:', insertData);
        
        const { data: createData, error: createErr } = await sb
          .from('orders')
          .insert(insertData)
          .select('*')
          .single();
        if (createErr || !createData) {
          console.error('Supabase create error:', createErr);
          console.error('Error details:', JSON.stringify(createErr, null, 2));
          throw new Error(createErr?.message || 'Tạo đơn thất bại');
        }
        
        // Convert Supabase response to our Order format
        const created: Order = {
          id: createData.id,
          code: createData.code,
          purchaseDate: createData.purchase_date ? new Date(createData.purchase_date) : new Date(),
          expiryDate: createData.expiry_date ? new Date(createData.expiry_date) : new Date(),
          packageId: createData.package_id,
          customerId: createData.customer_id,
          status: createData.status,
          paymentStatus: createData.payment_status,
          orderInfo: createData.order_info,
          notes: createData.notes,
          inventoryItemId: createData.inventory_item_id,
          inventoryProfileIds: createData.inventory_profile_ids || undefined,
          inventoryProfileId: createData.inventory_profile_id || undefined, // Backward compatibility
          cogs: createData.cogs,
          useCustomPrice: createData.use_custom_price,
          customPrice: createData.custom_price,
          customFieldValues: createData.custom_field_values,
          createdBy: createData.created_by || state.user?.id || 'system',
          createdAt: createData.created_at ? new Date(createData.created_at) : new Date(),
          updatedAt: createData.updated_at ? new Date(createData.updated_at) : new Date()
        };
        
        // Update local storage immediately to avoid code conflicts
        const currentOrders = Database.getOrders();
        Database.setOrders([...currentOrders, created]);
        if (selectedInventoryId) {
          try {
            const sb2 = getSupabase();
            if (sb2) {
              debugLog('=== CREATE ORDER INVENTORY UPDATE DEBUG ===');
              debugLog('selectedInventoryId:', selectedInventoryId);
              debugLog('selectedProfileIds:', selectedProfileIds);
              debugLog('created order id:', created.id);
              
              const { data: inv } = await sb2.from('inventory').select('*').eq('id', selectedInventoryId).single();
              debugLog('Found inventory item:', inv);
              
              if (inv && inv.is_account_based) {
                if (selectedProfileIds.length === 0) {
                  notify('Vui lòng chọn profile để cấp', 'warning');
                } else {
                  let profiles = Array.isArray(inv.profiles) ? inv.profiles : [];
                  debugLog('Current profiles:', profiles);
                  
                  // If profiles array is empty, generate default profiles
                  if (profiles.length === 0 && inv.total_slots && inv.total_slots > 0) {
                    debugLog('Generating default profiles for inventory item');
                    profiles = Array.from({ length: inv.total_slots }, (_, idx) => ({
                      id: `slot-${idx + 1}`,
                      label: `Slot ${idx + 1}`,
                      isAssigned: false
                    }));
                  }
                  
                  const nextProfiles = profiles.map((p: any) => 
                    selectedProfileIds.includes(p.id)
                      ? { ...p, isAssigned: true, assignedOrderId: created.id, assignedAt: new Date().toISOString(), expiryAt: new Date(orderData.expiryDate).toISOString() }
                      : p);
                  debugLog('Updated profiles:', nextProfiles);
                  
                  const { error: updateError } = await sb2.from('inventory').update({ profiles: nextProfiles }).eq('id', selectedInventoryId);
                  if (updateError) {
                    console.error('Error updating inventory profiles:', updateError);
                  } else {
                    debugLog('Successfully updated inventory profiles');
                  }
                }
              } else {
                debugLog('Updating classic inventory link');
                const { error: updateError } = await sb2.from('inventory').update({ status: 'SOLD', linked_order_id: created.id }).eq('id', selectedInventoryId);
                if (updateError) {
                  console.error('Error updating inventory link:', updateError);
                } else {
                  debugLog('Successfully updated inventory link');
                }
              }
            }
          } catch (error) {
            console.error('Error in inventory update:', error);
          }
        }
        try {
          const sb2 = getSupabase();
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || 'system', action: 'Tạo đơn hàng', details: `orderId=${created.id}; orderCode=${created.code}; packageId=${orderData.packageId}; customerId=${orderData.customerId}; inventoryId=${selectedInventoryId || '-'}; profileIds=${selectedProfileIds.join(',') || '-'}` });
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

  const handleCreateNewCustomer = async () => {
    if (!newCustomerData.name.trim()) {
      notify('Vui lòng nhập tên khách hàng', 'warning');
      return;
    }

    // Auto-generate customer code
    const nextCode = Database.generateNextCustomerCode();
    
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase not configured');
      
      const { data: createdCustomer, error: insertError } = await sb
        .from('customers')
        .insert({
          code: nextCode,
          name: newCustomerData.name,
          type: newCustomerData.type,
          phone: newCustomerData.phone,
          email: newCustomerData.email,
          source: newCustomerData.source,
          source_detail: newCustomerData.sourceDetail,
          notes: newCustomerData.notes
        })
        .select('*')
        .single();
      
      if (insertError || !createdCustomer) throw new Error(insertError?.message || 'Không thể tạo khách hàng');
      
      // Update local storage immediately with the real UUID from Supabase
      const newCustomer: Customer = {
        id: createdCustomer.id,
        code: createdCustomer.code,
        name: createdCustomer.name,
        type: createdCustomer.type,
        phone: createdCustomer.phone,
        email: createdCustomer.email,
        source: createdCustomer.source as CustomerSource | undefined,
        sourceDetail: createdCustomer.source_detail || '',
        notes: createdCustomer.notes,
        createdAt: createdCustomer.created_at ? new Date(createdCustomer.created_at) : new Date(),
        updatedAt: createdCustomer.updated_at ? new Date(createdCustomer.updated_at) : new Date()
      };
      
      const currentCustomers = Database.getCustomers();
      Database.setCustomers([...currentCustomers, newCustomer]);
      
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
        email: '',
        source: undefined,
        sourceDetail: '',
        notes: ''
      });
      
      try {
        const sb2 = getSupabase();
        if (sb2) await sb2.from('activity_logs').insert({ 
          employee_id: state.user?.id || 'system', 
          action: 'Tạo khách hàng', 
          details: `customerCode=${nextCode}; name=${newCustomerData.name}` 
        });
      } catch {}
      
      notify('Tạo khách hàng mới thành công', 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Có lỗi xảy ra khi tạo khách hàng mới';
      notify(errorMessage, 'error');
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

  const getFilteredProducts = () => {
    const q = debouncedProductSearch;
    if (!q) return products;
    return products.filter(p => (
      (p.name || '').toLowerCase().includes(q) ||
      (p.code || '').toLowerCase().includes(q)
    ));
  };

  const getFilteredCustomers = () => {
    const q = debouncedCustomerSearch;
    if (!q) return customers;
    return customers.filter(c => {
      const name = (c.name || '').toLowerCase();
      const phone = String(c.phone || '').toLowerCase();
      const email = String(c.email || '').toLowerCase();
      const code = String(c.code || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || email.includes(q) || code.includes(q);
    });
  };

  const getFilteredInventory = () => {
    const q = debouncedInventorySearch;
    if (!q) return availableInventory;
    return availableInventory.filter(item => {
      const code = String(item.code || '').toLowerCase();
      const info = String(item.productInfo || '').toLowerCase();
      const productName = (products.find(p => p.id === item.productId)?.name || '').toLowerCase();
      const packageName = (packages.find(p => p.id === item.packageId)?.name || '').toLowerCase();
      return code.includes(q) || info.includes(q) || productName.includes(q) || packageName.includes(q);
    });
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
      <div className="modal-content" style={{ maxWidth: '600px', overflowX: 'hidden' }}>
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
              value={formData.purchaseDate instanceof Date && !isNaN(formData.purchaseDate.getTime()) ? formData.purchaseDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                purchaseDate: new Date(e.target.value)
              }))}
            />
            {errors.purchaseDate && (
              <div className="text-danger small mt-1">{errors.purchaseDate}</div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">
              Sản phẩm <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className="form-control mb-2"
              placeholder="Tìm sản phẩm theo tên/mã..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
            <select
              name="product"
              className="form-control"
              value={selectedProduct}
              onChange={handleProductChange}
            >
              <option value="">Chọn sản phẩm</option>
              {getFilteredProducts().map(product => (
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
              {getFilteredPackages()
                .slice()
                .sort((a, b) => {
                  const wa = Number(a.warrantyPeriod || 0);
                  const wb = Number(b.warrantyPeriod || 0);
                  if (wa !== wb) return wa - wb;
                  return (a.name || '').localeCompare(b.name || '');
                })
                .map(pkg => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name} ({pkg.warrantyPeriod === 24 ? 'Vĩnh viễn' : `${pkg.warrantyPeriod} tháng`}) - {formatPrice(pkg.retailPrice)}
                </option>
              ))}
            </select>
            {errors.packageId && (
              <div className="text-danger small mt-1">{errors.packageId}</div>
            )}
          </div>

          {getSelectedPackage() && (
            <div className="form-group">
              <div className="d-flex align-items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="useCustomExpiry"
                  checked={!!formData.useCustomExpiry}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    useCustomExpiry: e.target.checked,
                    customExpiryDate: e.target.checked ? (prev.customExpiryDate || prev.purchaseDate) : undefined
                  }))}
                />
                <label htmlFor="useCustomExpiry" className="mb-0 ms-2">Hạn tùy chỉnh</label>
              </div>
              {formData.useCustomExpiry && (
                <div className="mt-2">
                  <input
                    type="date"
                    className={`form-control ${errors.customExpiryDate ? 'is-invalid' : ''}`}
                    value={(formData.customExpiryDate instanceof Date && !isNaN(formData.customExpiryDate.getTime()))
                      ? formData.customExpiryDate.toISOString().split('T')[0]
                      : ''}
                    onChange={(e) => {
                      setFormData(prev => ({
                        ...prev,
                        customExpiryDate: e.target.value ? new Date(e.target.value) : undefined
                      }));
                      if (errors.customExpiryDate) {
                        setErrors(prev => ({ ...prev, customExpiryDate: '' }));
                      }
                    }}
                  />
                  {errors.customExpiryDate && (
                    <div className="text-danger small mt-1">{errors.customExpiryDate}</div>
                  )}
                </div>
              )}
              {(() => {
                const pkg = getSelectedPackage();
                if (!pkg) return null;
                const preview = (() => {
                  if (formData.useCustomExpiry && formData.customExpiryDate) {
                    return new Date(formData.customExpiryDate);
                  }
                  const d = new Date(formData.purchaseDate);
                  // Always use selected package warranty period
                  d.setMonth(d.getMonth() + (pkg?.warrantyPeriod || 0));
                  return d;
                })();
                return (
                  <div className="text-muted small mt-1">
                    Hết hạn (dự kiến): {preview.toLocaleDateString('vi-VN')}
                  </div>
                );
              })()}
            </div>
          )}

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
                  <input
                    type="text"
                    className="form-control mb-2"
                    placeholder="Tìm kho theo mã/thông tin/sản phẩm/gói..."
                    value={inventorySearch}
                    onChange={(e) => setInventorySearch(e.target.value)}
                  />
                  <select
                    className={`form-control ${errors["inventory"] ? 'is-invalid' : ''}`}
                    value={selectedInventoryId}
                    onChange={(e) => {
                      debugLog('Inventory selection changed to:', e.target.value);
                      setSelectedInventoryId(e.target.value);
                    }}
                  >
                    <option value="">Không chọn</option>
                    {getFilteredInventory().map(item => {
                      const product = products.find(p => p.id === item.productId);
                      const packageInfo = packages.find(p => p.id === item.packageId);
                      const productName = product?.name || 'Không xác định';
                      const packageName = packageInfo?.name || 'Không xác định';
                      const expiryDate = (() => {
                        if (item.expiryDate) {
                          return new Date(item.expiryDate).toISOString().split('T')[0];
                        }
                        // Calculate expiry date preview: if shared pool, use warehouse item's stored pool months or selected package's warranty
                        const product = products.find(p => p.id === item.productId);
                        const purchaseDate = new Date(item.purchaseDate);
                        const expiry = new Date(purchaseDate);
                        if (product?.sharedInventoryPool) {
                          const months = (item as any).poolWarrantyMonths || getSelectedPackage()?.warrantyPeriod || 1;
                          expiry.setMonth(expiry.getMonth() + months);
                        } else {
                          const packageInfo = packages.find(p => p.id === item.packageId);
                          const warrantyPeriod = packageInfo?.warrantyPeriod || 1;
                          expiry.setMonth(expiry.getMonth() + warrantyPeriod);
                        }
                        return expiry.toISOString().split('T')[0];
                      })();
                      
                      // Get product info for display - Updated to remove status and payment
                      const productInfo = item.productInfo ? item.productInfo.split('\n')[0] : '';
                      const displayProductInfo = productInfo.length > 50 ? productInfo.substring(0, 50) + '...' : productInfo;
                      
                      return (
                        <option key={item.id} value={item.id}>
                          #{item.code} | {productName} | {packageName} | {displayProductInfo} | Nhập: {item.purchaseDate ? new Date(item.purchaseDate).toISOString().split('T')[0] : 'N/A'} | HSD: {expiryDate}
                        </option>
                      );
                    })}
                  </select>
                  {errors["inventory"] && (
                    <div className="text-danger small mt-1">{errors["inventory"]}</div>
                  )}
                  <div className="small text-muted mt-1">Nếu chọn, đơn sẽ sử dụng hàng trong kho và tự đánh dấu là đã bán.</div>
                  {!!selectedInventoryId && (() => {
                    const item = availableInventory.find(i => i.id === selectedInventoryId);
                    if (!item) return null;
                    
                    const product = products.find(p => p.id === item.productId);
                    const packageInfo = packages.find(p => p.id === item.packageId);
                    const productName = product?.name || 'Không xác định';
                    const packageName = packageInfo?.name || 'Không xác định';
                    const isSharedPool = product?.sharedInventoryPool;
                    
                    // Debug logging
                    debugLog('=== INVENTORY CARD DEBUG ===');
                    debugLog('Item:', item);
                    debugLog('Product ID:', item.productId);
                    debugLog('Package ID:', item.packageId);
                    debugLog('Found product:', product);
                    debugLog('Found package:', packageInfo);
                    debugLog('Product name:', productName);
                    debugLog('Package name:', packageName);
                    debugLog('Is shared pool:', isSharedPool);
                    debugLog('Purchase price:', item.purchasePrice, 'Type:', typeof item.purchasePrice);
                    debugLog('Source note:', item.sourceNote);
                    
                    return (
                      <div className="mt-3">
                        <div className="card">
                          <div className="card-header">
                            <h6 className="mb-0">📦 Thông tin chi tiết kho hàng</h6>
                          </div>
                          <div className="card-body">
                            <div className="row">
                              <div className="col-md-6">
                                <div className="mb-2">
                                  <strong>Mã kho:</strong> <span className="badge bg-primary">{item.code}</span>
                                </div>
                                <div className="mb-2">
                                  <strong>Sản phẩm:</strong> <span className="text-primary fw-bold">{productName}</span>
                                </div>
                                <div className="mb-2">
                                  <strong>Gói/Pool:</strong> 
                                  <span className="badge bg-info ms-1">
                                    {isSharedPool ? 'Pool chung' : packageName}
                                  </span>
                                </div>
                                <div className="mb-2">
                                  <strong>Trạng thái:</strong> 
                                  <span className={`badge ms-1 ${
                                    item.status === 'AVAILABLE' ? 'bg-success' :
                                    item.status === 'SOLD' ? 'bg-danger' :
                                    item.status === 'RESERVED' ? 'bg-warning' : 'bg-secondary'
                                  }`}>
                                    {item.status === 'AVAILABLE' ? 'Có sẵn' :
                                     item.status === 'SOLD' ? 'Đã bán' :
                                     item.status === 'RESERVED' ? 'Đã giữ' : item.status}
                                  </span>
                                </div>
                                <div className="mb-2">
                                  <strong>Ngày nhập:</strong> {item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString('vi-VN') : 'N/A'}
                                </div>
                                <div className="mb-2">
                                  <strong>Hạn sử dụng:</strong> 
                                  {(() => {
                                    if (item.expiryDate) {
                                      return ' ' + new Date(item.expiryDate).toLocaleDateString('vi-VN');
                                    }
                                    // Calculate expiry date based on selection
                                    const purchaseDate = new Date(item.purchaseDate);
                                    const expiry = new Date(purchaseDate);
                                    if (isSharedPool) {
                                      const selPkg = getSelectedPackage();
                                      const months = (item as any).poolWarrantyMonths || selPkg?.warrantyPeriod || 1;
                                      expiry.setMonth(expiry.getMonth() + months);
                                    } else {
                                      const packageInfo = packages.find(p => p.id === item.packageId);
                                      const warrantyPeriod = packageInfo?.warrantyPeriod || 1;
                                      expiry.setMonth(expiry.getMonth() + warrantyPeriod);
                                    }
                                    return ' ' + expiry.toLocaleDateString('vi-VN');
                                  })()}
                                </div>
                              </div>
                              <div className="col-md-6">
                                {typeof item.purchasePrice === 'number' && (
                                  <div className="mb-2">
                                    <strong>Giá nhập:</strong> 
                                    <span className="text-success fw-bold">
                                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.purchasePrice)}
                                    </span>
                                  </div>
                                )}
                                {item.sourceNote && (
                                  <div className="mb-2">
                                    <strong>Nguồn nhập:</strong> <em>{item.sourceNote}</em>
                                  </div>
                                )}
                                {item.isAccountBased && (
                                  <div className="mb-2">
                                    <strong>Loại:</strong> <span className="badge bg-info">Tài khoản nhiều slot</span>
                                  </div>
                                )}
                                {item.notes && (
                                  <div className="mb-2">
                                    <strong>Ghi chú:</strong> <small className="text-muted">{item.notes}</small>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {item.productInfo && (
                              <div className="mt-3">
                                <strong>Thông tin sản phẩm:</strong>
                                <div className="mt-1 p-2 bg-light rounded">
                                  <pre className="mb-0 small" style={{ whiteSpace: 'pre-wrap' }}>{item.productInfo}</pre>
                                </div>
                              </div>
                            )}
                            
                            {item.isAccountBased && (
                              <div className="mt-3">
                                <label className="form-label">
                                  <strong>Chọn các slot để cấp (có thể chọn nhiều)</strong>
                                </label>
                                <div className="row">
                                  {(item.profiles || [])
                                    .filter(p => (!p.isAssigned || p.assignedOrderId === (order?.id || '')) && !(p as any).needsUpdate)
                                    .map(p => (
                                      <div key={p.id} className="col-md-6 mb-2">
                                        <div className="form-check">
                                          <input
                                            className="form-check-input"
                                            type="checkbox"
                                            id={`slot-${p.id}`}
                                            checked={selectedProfileIds.includes(p.id)}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                setSelectedProfileIds(prev => [...prev, p.id]);
                                              } else {
                                                setSelectedProfileIds(prev => prev.filter(id => id !== p.id));
                                              }
                                            }}
                                          />
                                          <label className="form-check-label" htmlFor={`slot-${p.id}`}>
                                            {p.label} {p.isAssigned ? '(đang cấp cho đơn này)' : ''}
                                          </label>
                                        </div>
                                      </div>
                                    ))}
                                </div>
                                <div className="small text-muted mt-2">
                                  Đã chọn: {selectedProfileIds.length} slot
                                </div>
                                <div className="small text-muted mt-1">
                                  Tự động import các cột đã tick vào Thông tin đơn hàng và đánh dấu slot.
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
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
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  className={`form-control mb-2 ${errors.customerId ? 'is-invalid' : ''}`}
                  placeholder="Tìm khách theo tên/SĐT/email/mã..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
                <select
                  name="customerId"
                  className={`form-control ${errors.customerId ? 'is-invalid' : ''}`}
                  value={formData.customerId}
                  onChange={handleChange}
                >
                  <option value="">Chọn khách hàng</option>
                  {getFilteredCustomers().map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.code} - {customer.name} ({customer.type === 'CTV' ? 'CTV' : 'Khách lẻ'})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  const newShowState = !showNewCustomerForm;
                  setShowNewCustomerForm(newShowState);
                  if (newShowState) {
                    // Auto-generate customer code when opening form
                    const nextCode = Database.generateNextCustomerCode();
                    setNewCustomerData(prev => ({
                      ...prev,
                      code: nextCode
                    }));
                  }
                }}
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
            // Informational message for new orders
            const hasAvailable = (availableInventory || []).length > 0;
            if (!order) {
              return (
                <div className="alert alert-info">
                  {hasAvailable
                    ? 'Có hàng trong kho sẵn để liên kết (không bắt buộc). Nếu không chọn, đơn sẽ ở trạng thái Đang xử lý.'
                    : 'Hiện chưa có hàng trong kho cho gói này. Bạn vẫn có thể tạo đơn (Đang xử lý).'}
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
                <div className="form-group">
                  <label className="form-label">
                    Mã khách hàng <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={newCustomerData.code}
                    readOnly
                    disabled
                    aria-disabled
                    title={'Mã tự động tạo - không chỉnh sửa'}
                    style={{ opacity: 0.6 } as React.CSSProperties}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Tên khách hàng <span className="text-danger">*</span>
                  </label>
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
                <div className="form-group">
                  <label className="form-label">
                    Loại khách hàng <span className="text-danger">*</span>
                  </label>
                  <select
                    className="form-control"
                    value={newCustomerData.type}
                    onChange={(e) => setNewCustomerData(prev => ({
                      ...prev,
                      type: e.target.value as 'CTV' | 'RETAIL'
                    }))}
                  >
                    {CUSTOMER_TYPES.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="row">
                  <div className="col-md-6">
                    <div className="form-group">
                      <label className="form-label">Số điện thoại</label>
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

                <div className="form-group">
                  <label className="form-label">Nguồn khách hàng</label>
                  <select
                    className="form-control"
                    value={newCustomerData.source || ''}
                    onChange={(e) => {
                      const value = e.target.value as CustomerSource | '';
                      setNewCustomerData(prev => ({
                        ...prev,
                        source: value || undefined,
                        sourceDetail: '' // Reset source detail when source changes
                      }));
                    }}
                  >
                    <option value="">Chọn nguồn khách hàng</option>
                    {CUSTOMER_SOURCES.map(source => (
                      <option key={source.value} value={source.value}>
                        {source.label}
                      </option>
                    ))}
                  </select>
                </div>

                {newCustomerData.source && (
                  <div className="form-group">
                    <label className="form-label">Chi tiết nguồn</label>
                    <input
                      type="text"
                      className="form-control"
                      value={newCustomerData.sourceDetail}
                      onChange={(e) => setNewCustomerData(prev => ({
                        ...prev,
                        sourceDetail: e.target.value
                      }))}
                      placeholder={`Nhập chi tiết về nguồn ${CUSTOMER_SOURCES.find(s => s.value === newCustomerData.source)?.label}`}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Ghi chú</label>
                  <textarea
                    className="form-control"
                    value={newCustomerData.notes}
                    onChange={(e) => setNewCustomerData(prev => ({
                      ...prev,
                      notes: e.target.value
                    }))}
                    placeholder="Nhập ghi chú thêm"
                    rows={3}
                  />
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
              className="form-control text-muted"
              value={(() => {
                const item = selectedInventoryId ? availableInventory.find(i => i.id === selectedInventoryId) : undefined;
                if (!item) return '';
                if (item.isAccountBased) {
                  // Build using the currently selected package columns to avoid drift
                  const itemForOrder = { ...item, packageId: formData.packageId } as InventoryItem;
                  return Database.buildOrderInfoFromAccount(itemForOrder, selectedProfileIds.length > 0 ? selectedProfileIds : undefined);
                }
                return item.productInfo || '';
              })()}
              readOnly
              disabled
              style={{ opacity: 0.6, background: '#f8f9fa' } as React.CSSProperties}
              title={'Thông tin được lấy tự động từ kho - không chỉnh sửa'}
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
                      // Release links in Supabase to ensure slot counts drop server-side
                      try {
                        const sb = getSupabase();
                        if (sb) {
                          // Classic link: clear linked_order_id and set AVAILABLE
                          const { data: classicLinked } = await sb
                            .from('inventory')
                            .select('id')
                            .eq('linked_order_id', order.id);
                          const classicIds = (classicLinked || []).map((r: any) => r.id);
                          if (classicIds.length) {
                            await sb
                              .from('inventory')
                              .update({ status: 'AVAILABLE', linked_order_id: null })
                              .in('id', classicIds);
                          }
                          // Account-based: clear any profiles assigned to this order
                          const { data: accountItems } = await sb
                            .from('inventory')
                            .select('*')
                            .eq('is_account_based', true);
                          const toUpdate = (accountItems || []).filter((it: any) => Array.isArray(it.profiles) && it.profiles.some((p: any) => p.assignedOrderId === order.id));
                          for (const it of toUpdate) {
                            const nextProfiles = (Array.isArray(it.profiles) ? it.profiles : []).map((p: any) => (
                              p.assignedOrderId === order.id
                                ? { ...p, isAssigned: false, assignedOrderId: null, assignedAt: null, expiryAt: null }
                                : p
                            ));
                            await sb.from('inventory').update({ profiles: nextProfiles }).eq('id', it.id);
                          }
                        }
                      } catch {}
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

