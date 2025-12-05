import React, { useState, useEffect, useMemo } from 'react';
import { Order, Customer, ProductPackage, Product, OrderFormData, ORDER_STATUSES, PAYMENT_STATUSES, InventoryItem, OrderStatus, CUSTOMER_TYPES, CUSTOMER_SOURCES, CustomerSource, INVENTORY_PAYMENT_STATUSES_FULL } from '../../types';
import { Database } from '../../utils/database';
import { getSupabase } from '../../utils/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { normalizeExpiryDate } from '../../utils/date';


interface OrderFormProps {
  order?: Order | null;
  onClose: () => void;
  onSuccess: (createdOrder?: Order) => void;
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
    notes: '',
    useCustomPrice: false,
    customPrice: 0,
    customFieldValues: {},
    useCustomExpiry: false,
    customExpiryDate: undefined
  });
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [availableInventory, setAvailableInventory] = useState<InventoryItem[]>([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>('');
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [inventoryError, setInventoryError] = useState<string>('');
  // Payment status cho các lần gia hạn: key = renewal.id, value = paymentStatus
  const [renewalPaymentStatuses, setRenewalPaymentStatuses] = useState<Record<string, string>>({});
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
          if (sb) {
            // First check by inventoryItemId if it exists
            if (order.inventoryItemId) {
              const { data: inv } = await sb.from('inventory').select('*').eq('id', order.inventoryItemId).single();
              if (inv) {
                // For classic inventory: check linked_order_id
                if (!inv.is_account_based && inv.linked_order_id === order.id) {
                  invLinked = order.inventoryItemId;
                }
                // For account-based inventory: check if any profile is assigned to this order
                else if (inv.is_account_based && Array.isArray(inv.profiles) && inv.profiles.some((p: any) => p.assignedOrderId === order.id)) {
                  invLinked = order.inventoryItemId;
                }
              }
            }
            
            // If not found by inventoryItemId, search by linked_order_id
            if (!invLinked) {
              const { data: invByOrder } = await sb.from('inventory').select('id').eq('linked_order_id', order.id).maybeSingle();
              if (invByOrder?.id) invLinked = invByOrder.id as any;
            }
            
            // If still not found, search account-based inventory by profiles
            if (!invLinked) {
              const { data: invList } = await sb.from('inventory').select('*').eq('is_account_based', true);
              const found = (invList || []).find((i: any) => Array.isArray(i.profiles) && i.profiles.some((p: any) => p.assignedOrderId === order.id));
              if (found) invLinked = found.id as any;
            }
          }
        } catch (error) {
          // Error finding linked inventory - ignore
        }

        setSelectedInventoryId(invLinked);
      })();
      
      // Determine expired status from expiryDate or existing status
      const now = new Date();
      const expiry = order.expiryDate instanceof Date ? order.expiryDate : (order.expiryDate ? new Date(order.expiryDate) : undefined as any);
      const isExpired = (expiry ? expiry < now : false) || order.status === 'EXPIRED';
      const paymentStatus = (order as any).paymentStatus || 'UNPAID';
      // For refunded orders, status must be CANCELLED
      const finalStatus = paymentStatus === 'REFUNDED' ? 'CANCELLED' : (isExpired ? 'EXPIRED' : order.status);
      setFormData({
        code: order.code,
        purchaseDate: order.purchaseDate instanceof Date ? order.purchaseDate : new Date(order.purchaseDate),
        packageId: order.packageId,
        customerId: order.customerId,
        status: finalStatus,
        paymentStatus: paymentStatus,
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
      
      // Load payment status của các lần gia hạn
      const renewals = Array.isArray((order as any).renewals) ? ((order as any).renewals || []) : [];
      const renewalPaymentStatusMap: Record<string, string> = {};
      renewals.forEach((r: any) => {
        if (r.id && r.paymentStatus) {
          renewalPaymentStatusMap[r.id] = r.paymentStatus;
        }
      });
      setRenewalPaymentStatuses(renewalPaymentStatusMap);
    } else {
      // Code will be generated client-side
      setFormData(prev => ({ ...prev, code: '' }));
    }
  }, [order]);

  // Initialize form for new order
  useEffect(() => {
    if (!order) {
      const today = new Date();
      // Generate fresh code for new order (from Supabase)
      (async () => {
        try {
          const sb = getSupabase();
          if (!sb) return;
          const { data } = await sb.from('orders').select('code').order('created_at', { ascending: false }).limit(2000);
          const codes = (data || []).map((r: any) => String(r.code || '')) as string[];
          const nextCode = Database.generateNextCodeFromList(codes, 'DH', 3);
          setFormData(prev => ({
            ...prev,
            code: nextCode,
            purchaseDate: today,
            packageId: '',
            customerId: '',
            status: 'PROCESSING',
            paymentStatus: 'UNPAID',
            notes: '',
            useCustomPrice: false,
            customPrice: 0,
            customFieldValues: {},
            useCustomExpiry: false,
            customExpiryDate: undefined
          }));
        } catch {
          // Fallback to local storage method
          const nextCode = Database.generateNextOrderCode();
          setFormData(prev => ({
            ...prev,
            code: nextCode,
            purchaseDate: today,
            packageId: '',
            customerId: '',
            status: 'PROCESSING',
            paymentStatus: 'UNPAID',
            notes: '',
            useCustomPrice: false,
            customPrice: 0,
            customFieldValues: {},
            useCustomExpiry: false,
            customExpiryDate: undefined
          }));
        }
      })();
    }
    // Note: For editing orders, form data is set in the first useEffect above
  }, []);

  // Listen for packages updates from PackageForm
  useEffect(() => {
    const handlePackagesUpdate = () => {
      loadData();
    };
    
    window.addEventListener('packagesUpdated', handlePackagesUpdate);
    return () => window.removeEventListener('packagesUpdated', handlePackagesUpdate);
  }, []);

  const loadData = async () => {
    const sb = getSupabase();
    if (!sb) return;
    
    try {
      const [customersRes, packagesRes, productsRes] = await Promise.all([
        sb.from('customers').select('*').order('created_at', { ascending: true }),
        sb.from('packages').select('*').order('created_at', { ascending: true }),
        sb.from('products').select('*').order('created_at', { ascending: true })
      ]);
    const allCustomers = (customersRes.data || []).map((r: any) => ({
      ...r,
      sourceDetail: r.source_detail || '',
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
    } catch (error) {
      notify('Lỗi khi tải dữ liệu. Vui lòng thử lại.', 'error');
      // Fallback to local storage if available
      try {
        setCustomers(Database.getCustomers());
        setPackages(Database.getPackages());
        setProducts(Database.getProducts());
      } catch (fallbackError) {
        // Fallback data loading failed - ignore
      }
    }
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
      // Filter availability: exclude expired for all types. For account-based, must have at least one free, non-needsUpdate slot.
      items = items.filter((i: any) => {
        const now = new Date();
        const expiresAt = i.expiryDate ? new Date(i.expiryDate) : undefined;
        const isExpired = (expiresAt ? expiresAt < now : false) || i.status === 'EXPIRED';
        if (isExpired) return false;
        if (i.isAccountBased) {
          const profiles = Array.isArray(i.profiles) ? i.profiles : [];
          const hasAvailable = profiles.some((p: any) => !p.isAssigned && !(p as any).needsUpdate);
          return hasAvailable;
        }
        // For classic inventory, only show items that are AVAILABLE and not linked to any order
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
    return () => { 
      try { 
        ch.unsubscribe(); 
        } catch (error) {
          // Error unsubscribing from realtime channel - ignore
        }
    };
  }, []);

  // Auto-enforce status rules based on inventory selection
  useEffect(() => {
    const hasInventorySelected = !!selectedInventoryId;
    setFormData(prev => {
      // Do not override expired status
      if (prev.status === 'EXPIRED') return prev;
      const enforcedStatus = hasInventorySelected ? 'COMPLETED' : 'PROCESSING';
      return prev.status === enforcedStatus ? prev : { ...prev, status: enforcedStatus };
    });
  }, [selectedInventoryId]);

  // Auto-pick slot for account-based inventory
  // For new orders: do NOT auto-select; require explicit user choice
  // For editing: preserve the slots already assigned to this order if present
  useEffect(() => {
    if (!selectedInventoryId) {
      setSelectedProfileIds([]);
      return;
    }
    
    const inv = availableInventory.find(i => i.id === selectedInventoryId);
    if (!inv?.isAccountBased) {
      setSelectedProfileIds([]);
      return;
    }
    
    const profiles = Array.isArray(inv?.profiles) ? (inv as any).profiles : [];
    const now = new Date();
    const expiresAt = inv.expiryDate ? normalizeExpiryDate(inv.expiryDate) : undefined;
    const inventoryExpired = expiresAt ? expiresAt.getTime() < now.getTime() : false;
    const allowed = profiles.filter((p: any) => {
      if (!p || typeof p !== 'object') return false;
      if (inventoryExpired) {
        // When expired, only keep slots already assigned to this order
        return p.isAssigned && p.assignedOrderId === (order?.id || '');
      }
      return (!p.isAssigned || p.assignedOrderId === (order?.id || '')) && !(p as any).needsUpdate;
    });
    
    if (!allowed.length) {
      setSelectedProfileIds([]);
      return;
    }
    
    // New order: don't auto-pick slots, but keep any previously selected valid slots
    if (!order) {
      setSelectedProfileIds(prev => prev.filter(id => allowed.some((p: any) => p.id === id)));
      return;
    }
    
    // Editing existing order: load assigned slots from inventory profiles
    const assignedSlots = profiles
      .filter((p: any) => p.isAssigned && p.assignedOrderId === order.id)
      .map((p: any) => p.id);
    setSelectedProfileIds(assignedSlots);
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

  // Set selected product when form data changes (for editing)
  useEffect(() => {
    if (formData.packageId && packages.length) {
      const pkg = packages.find(p => p.id === formData.packageId);
      if (pkg && pkg.productId !== selectedProduct) {
        setSelectedProduct(pkg.productId);
      }
    }
  }, [formData.packageId, packages, selectedProduct]);

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
    
    // Validation
    const newErrors: {[key: string]: string} = {};
    
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
    
    // Enhanced inventory validation
    if (selectedInventoryId) {
      const inv = availableInventory.find(i => i.id === selectedInventoryId);
      if (!inv) {
        newErrors["inventory"] = 'Kho hàng đã chọn không tồn tại';
      } else {
        const now = new Date();
        const expiresAt = inv.expiryDate ? normalizeExpiryDate(inv.expiryDate) : undefined;
        const inventoryExpired = expiresAt ? expiresAt.getTime() < now.getTime() : false;
        const isEditingLinked = !!order && order.inventoryItemId === inv.id;
        if (inventoryExpired && !isEditingLinked) {
          newErrors["inventory"] = 'Kho hàng này đã hết hạn';
        }
        if (inv.isAccountBased) {
          if (selectedProfileIds.length === 0) {
            newErrors["inventoryProfileId"] = 'Vui lòng chọn ít nhất 1 slot để cấp';
          } else {
            // Validate each selected slot
            const invalidSlots = selectedProfileIds.filter(profileId => {
              const chosen = (inv.profiles || []).find(p => p && p.id === profileId);
              if (!chosen || typeof chosen !== 'object') return true;
              if ((chosen as any).needsUpdate) return true;
              if (inventoryExpired && (chosen as any).assignedOrderId !== (order?.id || '')) return true;
              if ((chosen as any).isAssigned && (chosen as any).assignedOrderId !== (order?.id || '')) return true;
              return false;
            });
            if (invalidSlots.length > 0) {
              newErrors["inventoryProfileId"] = 'Một số slot không hợp lệ, vui lòng chọn slot trống';
            }
          }
        } else {
          // Classic inventory validation
          if (inv.status !== 'AVAILABLE' && inv.status !== 'SOLD') {
            newErrors["inventory"] = 'Kho hàng này không khả dụng';
          }
          if (inv.linkedOrderId && inv.linkedOrderId !== (order?.id || '')) {
            newErrors["inventory"] = 'Kho này đang liên kết đơn khác';
          }
        }
      }
    }

    if (Object.keys(newErrors).length > 0) {
      const errorMessages = Object.values(newErrors).join(', ');
      notify(`Vui lòng kiểm tra: ${errorMessages}`, 'warning', 4000);
      return;
    }

    try {
      const selectedPackage = packages.find(p => p.id === formData.packageId);
      if (!selectedPackage) {
        notify('Gói sản phẩm không tồn tại', 'error');
        return;
      }

      // Calculate expiry date (allow override by custom expiry). For renewed orders, prefer keeping the latest renewal expiry to avoid shortening when editing unrelated fields.
      const purchaseDate = new Date(formData.purchaseDate);
      const renewals = Array.isArray((order as any)?.renewals) ? ((order as any).renewals || []) : [];
      const latestRenewalExpiry = (() => {
        if (!renewals.length) return null;
        const sorted = renewals.slice().sort((a: any, b: any) => {
          const da = new Date(a?.newExpiryDate || a?.new_expiry_date || a?.createdAt || a?.created_at || 0).getTime();
          const db = new Date(b?.newExpiryDate || b?.new_expiry_date || b?.createdAt || b?.created_at || 0).getTime();
          return db - da;
        });
        for (const r of sorted) {
          const raw = (r as any).newExpiryDate || (r as any).new_expiry_date;
          if (raw) {
            const d = new Date(raw);
            if (!isNaN(d.getTime())) return d;
          }
        }
        const existing = order?.expiryDate ? new Date(order.expiryDate) : null;
        return existing && !isNaN(existing.getTime()) ? existing : null;
      })();
      const computedExpiry = (() => {
        if (formData.useCustomExpiry && formData.customExpiryDate) {
          return new Date(formData.customExpiryDate);
        }

        // For existing orders that have renewals, keep the stored/renewal expiry instead of recomputing from the current package (which may have changed).
        if (order && renewals.length > 0) {
          if (latestRenewalExpiry) return latestRenewalExpiry;
          const existing = order.expiryDate ? new Date(order.expiryDate) : null;
          if (existing && !isNaN(existing.getTime())) return existing;
        }

        const baseMonths = selectedPackage.warrantyPeriod;
        let totalMonths = baseMonths;
        if (renewals.length > 0) {
          // Sum all renewal months (support both number and string)
          const renewalMonths = renewals.reduce((sum: number, r: any) => {
            const monthsRaw = (r as any).months;
            const months = typeof monthsRaw === 'number' ? monthsRaw : Number(monthsRaw) || 0;
            return sum + Math.max(0, months);
          }, 0);
          totalMonths = baseMonths + renewalMonths;
        }
        const result = new Date(purchaseDate);
        result.setMonth(result.getMonth() + totalMonths);
        return result;
      })();
      let expiryDate = computedExpiry;

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

      // Compute sale price snapshot - only for new orders or when package/customer changes
      const selectedCustomer = customers.find(c => c.id === formData.customerId);
      const computedBasePrice = (() => {
        if (formData.useCustomPrice) return formData.customPrice || 0;
        if (!selectedPackage) return 0;
        const isCTV = (selectedCustomer?.type || 'RETAIL') === 'CTV';
        return isCTV ? (selectedPackage.ctvPrice || 0) : (selectedPackage.retailPrice || 0);
      })();

      // For existing orders, preserve original salePrice unless package, customer, or price settings changed
      const finalSalePrice = order ? (
        (order.packageId !== formData.packageId || 
         order.customerId !== formData.customerId || 
         order.useCustomPrice !== formData.useCustomPrice ||
         (formData.useCustomPrice && order.customPrice !== formData.customPrice))
          ? computedBasePrice
          : (order.salePrice || computedBasePrice)
      ) : computedBasePrice;

        const orderData = {
        ...formData,
        code: formData.code || Database.generateNextOrderCode(), // Use client-side generation
        expiryDate,
        createdBy: state.user?.id || '',
        inventoryItemId: selectedInventoryId || undefined,
        inventoryProfileIds: pickedInventory?.isAccountBased 
          ? (selectedProfileIds.length > 0 ? selectedProfileIds : undefined) 
          : undefined,
        useCustomPrice: formData.useCustomPrice || false,
        customPrice: formData.useCustomPrice ? formData.customPrice : undefined,
        customFieldValues,
        // For existing orders, preserve current form status (e.g., EXPIRED)
        status: (order ? formData.status : (selectedInventoryId ? 'COMPLETED' : 'PROCESSING')) as OrderStatus,
        salePrice: finalSalePrice
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
          
          // Cập nhật payment status của các lần gia hạn nếu có thay đổi
          let updatedRenewals = (order as any).renewals || [];
          if (Array.isArray(updatedRenewals) && updatedRenewals.length > 0 && Object.keys(renewalPaymentStatuses).length > 0) {
            updatedRenewals = updatedRenewals.map((r: any) => {
              if (renewalPaymentStatuses[r.id] !== undefined) {
                return {
                  ...r,
                  paymentStatus: renewalPaymentStatuses[r.id]
                };
              }
              return r;
            });
          }
          
          const updateData = {
            code: orderData.code,
            purchase_date: orderData.purchaseDate instanceof Date ? orderData.purchaseDate.toISOString() : orderData.purchaseDate,
            package_id: orderData.packageId,
            customer_id: orderData.customerId,
            status: orderData.status,
            payment_status: orderData.paymentStatus,
            notes: orderData.notes || null,
            expiry_date: orderData.expiryDate instanceof Date ? orderData.expiryDate.toISOString() : orderData.expiryDate,
            inventory_item_id: orderData.inventoryItemId || null,
            inventory_profile_ids: orderData.inventoryProfileIds || null,
            use_custom_price: orderData.useCustomPrice || false,
            custom_price: orderData.customPrice || null,
            custom_field_values: orderData.customFieldValues || null,
            sale_price: (orderData as any).salePrice || null,
            renewals: updatedRenewals.length > 0 ? updatedRenewals : null
          };
          // Order update debug
          
          const { data: updateResult, error } = await sb
            .from('orders')
            .update(updateData)
            .eq('id', order.id)
            .select('*')
            .single();
          
          // Update result debug
          
          if (error) {
            // Supabase update error - ignore
            notify(`Lỗi cập nhật: ${error.message}`, 'error');
            return;
          }
          
          if (updateResult) {
            // Convert Supabase response to our Order format and update local storage
            // Sử dụng renewals đã cập nhật từ updateData
            const finalRenewals = updatedRenewals.length > 0 ? updatedRenewals : (updateResult.renewals || []);
            const updatedOrder: Order = {
              id: updateResult.id,
              code: updateResult.code,
              purchaseDate: updateResult.purchase_date ? new Date(updateResult.purchase_date) : new Date(),
              expiryDate: updateResult.expiry_date ? new Date(updateResult.expiry_date) : new Date(),
              packageId: updateResult.package_id,
              customerId: updateResult.customer_id,
              status: updateResult.status,
              paymentStatus: updateResult.payment_status,
              notes: updateResult.notes,
              inventoryItemId: updateResult.inventory_item_id,
              inventoryProfileIds: updateResult.inventory_profile_ids || undefined,
              cogs: updateResult.cogs,
              useCustomPrice: updateResult.use_custom_price,
              customPrice: updateResult.custom_price,
              salePrice: updateResult.sale_price,
              customFieldValues: updateResult.custom_field_values,
              renewals: finalRenewals,
              createdBy: 'system',
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
            
            // Handle inventory changes with improved error handling
            const prevInventoryId = order.inventoryItemId;
            const nextInventoryId = selectedInventoryId || undefined;
            
            // Release previous inventory if changed
            if (prevInventoryId && prevInventoryId !== nextInventoryId) {
              try {
                const sb2 = getSupabase();
                if (sb2) {
                  const { data: prevInventory, error: fetchError } = await sb2.from('inventory').select('*').eq('id', prevInventoryId).single();
                  
                  if (fetchError) {
                    // Error fetching previous inventory - ignore
                    notify('Lỗi khi truy xuất thông tin kho hàng cũ', 'error');
                    return;
                  }
                  
                  if (prevInventory) {
                    if (prevInventory.is_account_based) {
                      // Release account-based slots
                      const profiles = prevInventory.profiles || [];
                      const updatedProfiles = profiles.map((profile: any) => {
                        if (profile.assignedOrderId === order.id) {
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
                      
                      const { error: updateError } = await sb2.from('inventory').update({
                        profiles: updatedProfiles,
                        status: hasFreeSlots ? 'AVAILABLE' : 'SOLD',
                        updated_at: new Date().toISOString()
                      }).eq('id', prevInventoryId);
                      
                      if (updateError) {
                        // Error releasing account-based inventory - ignore
                        notify('Lỗi khi giải phóng slot kho hàng', 'error');
                        return;
                      }
                    } else {
                      // Release classic inventory
                      const { error: updateError } = await sb2.from('inventory').update({
                        status: 'AVAILABLE',
                        linked_order_id: null,
                        updated_at: new Date().toISOString()
                      }).eq('id', prevInventoryId);
                      
                      if (updateError) {
                        // Error releasing classic inventory - ignore
                        notify('Lỗi khi giải phóng kho hàng', 'error');
                        return;
                      }
                    }
                  }
                }
              } catch (error) {
                // Failed to release previous inventory - ignore
                notify('Lỗi không mong muốn khi giải phóng kho hàng', 'error');
                return;
              }
            }
            
            // Link new inventory if selected or update existing inventory slots
            if (nextInventoryId) {
              try {
                const sb2 = getSupabase();
                if (sb2) {
                  const inventoryItem = availableInventory.find(i => i.id === nextInventoryId);
                  if (!inventoryItem) {
                    notify('Không tìm thấy kho hàng đã chọn', 'error');
                    return;
                  }
                  
                  if (inventoryItem.isAccountBased) {
                    if (selectedProfileIds.length > 0) {
                      // Account-based inventory: assign selected slots
                      const { data: currentInventory, error: fetchError } = await sb2.from('inventory').select('*').eq('id', nextInventoryId).single();
                      
                      if (fetchError) {
                        // Error fetching current inventory - ignore
                        notify('Lỗi khi truy xuất thông tin kho hàng', 'error');
                        return;
                      }
                      
                      if (currentInventory) {
                        let profiles = currentInventory.profiles || [];
                        
                        // Generate missing profiles if empty
                        if (profiles.length === 0 && currentInventory.total_slots > 0) {
                          // Generating missing profiles for inventory
                          profiles = Array.from({ length: currentInventory.total_slots }, (_, idx) => ({
                            id: `slot-${idx + 1}`,
                            label: `Slot ${idx + 1}`,
                            isAssigned: false
                          }));
                          // Generated profiles
                        }
                        
                        const updatedProfiles = profiles.map((profile: any) => {
                          // First clear any previous assignments for this order
                          if (profile.assignedOrderId === order.id) {
                            return {
                              ...profile,
                              isAssigned: false,
                              assignedOrderId: null,
                              assignedAt: null,
                              expiryAt: null
                            };
                          }
                          return profile;
                        }).map((profile: any) => {
                          // Then assign selected slots
                          if (selectedProfileIds.includes(profile.id)) {
                            return {
                              ...profile,
                              isAssigned: true,
                              assignedOrderId: order.id,
                              assignedAt: new Date().toISOString(),
                              expiryAt: orderData.expiryDate.toISOString()
                            };
                          }
                          return profile;
                        });
                        
                        // Check if there are any free slots remaining
                        const hasFreeSlots = updatedProfiles.some((p: any) => 
                          !p.isAssigned && !(p as any).needsUpdate
                        );
                        
                        // Updating inventory slots
                        
                        const { error: updateError } = await sb2.from('inventory').update({
                          profiles: updatedProfiles,
                          status: hasFreeSlots ? 'AVAILABLE' : 'SOLD',
                          updated_at: new Date().toISOString()
                        }).eq('id', nextInventoryId);
                        
                        if (updateError) {
                          // Error updating account-based inventory - ignore
                          notify('Lỗi khi cập nhật slot kho hàng', 'error');
                          return;
                        }
                        
                        // Successfully updated inventory slots
                      }
                    } else {
                      notify('Kho hàng dạng tài khoản cần chọn ít nhất 1 slot', 'error');
                      return;
                    }
                  } else {
                    // Classic inventory: mark as sold and link to order
                    const { error: updateError } = await sb2.from('inventory').update({
                      status: 'SOLD',
                      linked_order_id: order.id,
                      updated_at: new Date().toISOString()
                    }).eq('id', nextInventoryId);
                    
                    if (updateError) {
                      // Error updating classic inventory - ignore
                      notify('Lỗi khi cập nhật kho hàng', 'error');
                      return;
                    }
                  }
                }
              } catch (error) {
                // Failed to link new inventory to order - ignore
                notify('Lỗi không mong muốn khi liên kết kho hàng', 'error');
                return;
              }
            }
            
            // Refresh available inventory to reflect changes
            if (prevInventoryId !== nextInventoryId) {
              // Trigger a refresh of available inventory
              setFormData(prev => ({ ...prev }));
            }
            
            const base = [`orderId=${order.id}; orderCode=${order.code}`];
            const detail = [...base, ...changedEntries].join('; ');
            try {
              const sb2 = getSupabase();
              if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Cập nhật đơn hàng', details: detail });
            } catch {}
            notify('Cập nhật đơn hàng thành công', 'success');
            onSuccess(updatedOrder);
          }
        } catch (updateError) {
          const errorMessage = updateError instanceof Error ? updateError.message : 'Có lỗi xảy ra khi cập nhật đơn hàng';
          notify(errorMessage, 'error');
        }
      } else {
        // Create new order via Supabase
        const sb = getSupabase();
        if (!sb) throw new Error('Supabase not configured');
        
        const insertData = {
          code: orderData.code, // Use client-generated code
          purchase_date: orderData.purchaseDate instanceof Date ? orderData.purchaseDate.toISOString() : orderData.purchaseDate,
          package_id: orderData.packageId,
          customer_id: orderData.customerId,
          status: orderData.status,
          payment_status: orderData.paymentStatus,
          notes: orderData.notes || null,
          expiry_date: orderData.expiryDate instanceof Date ? orderData.expiryDate.toISOString() : orderData.expiryDate,
          inventory_item_id: orderData.inventoryItemId || null,
          inventory_profile_ids: orderData.inventoryProfileIds || null,
          use_custom_price: orderData.useCustomPrice || false,
          custom_price: orderData.customPrice || null,
          custom_field_values: orderData.customFieldValues || null,
          sale_price: (orderData as any).salePrice || null
        };
        
        const { data: createData, error: createErr } = await sb
          .from('orders')
          .insert(insertData)
          .select('*')
          .single();
        if (createErr || !createData) {
          // Supabase create error - ignore
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
          notes: createData.notes,
          inventoryItemId: createData.inventory_item_id,
          inventoryProfileIds: createData.inventory_profile_ids || undefined,
          cogs: createData.cogs,
          useCustomPrice: createData.use_custom_price,
          customPrice: createData.custom_price,
          salePrice: createData.sale_price,
          customFieldValues: createData.custom_field_values,
          createdBy: 'system',
          createdAt: createData.created_at ? new Date(createData.created_at) : new Date(),
          updatedAt: createData.updated_at ? new Date(createData.updated_at) : new Date()
        };
        
        // Update local storage immediately
        const currentOrders = Database.getOrders();
        Database.setOrders([...currentOrders, created]);
        
        // Handle inventory linking with improved error handling
        if (selectedInventoryId) {
          try {
            const sb2 = getSupabase();
            if (sb2) {
              const inventoryItem = availableInventory.find(i => i.id === selectedInventoryId);
              if (!inventoryItem) {
                notify('Không tìm thấy kho hàng đã chọn', 'error');
                return;
              }
              
              if (inventoryItem.isAccountBased) {
                if (selectedProfileIds.length > 0) {
                  // Account-based inventory: assign selected slots
                  const { data: currentInventory, error: fetchError } = await sb2.from('inventory').select('*').eq('id', selectedInventoryId).single();
                  
                  if (fetchError) {
                    // Error fetching current inventory - ignore
                    notify('Lỗi khi truy xuất thông tin kho hàng', 'error');
                    return;
                  }
                  
                  if (currentInventory) {
                    let profiles = currentInventory.profiles || [];
                    
                    // Generate missing profiles if empty
                    if (profiles.length === 0 && currentInventory.total_slots > 0) {
                      profiles = Array.from({ length: currentInventory.total_slots }, (_, idx) => ({
                        id: `slot-${idx + 1}`,
                        label: `Slot ${idx + 1}`,
                        isAssigned: false
                      }));
                    }
                    
                    const updatedProfiles = profiles.map((profile: any) => {
                      // Then assign selected slots
                      if (selectedProfileIds.includes(profile.id)) {
                        return {
                          ...profile,
                          isAssigned: true,
                          assignedOrderId: created.id,
                          assignedAt: new Date().toISOString(),
                          expiryAt: orderData.expiryDate.toISOString()
                        };
                      }
                      return profile;
                    });
                    
                    // Check if there are any free slots remaining
                    const hasFreeSlots = updatedProfiles.some((p: any) => 
                      !p.isAssigned && !(p as any).needsUpdate
                    );
                    
                    // Creating order with slots
                    
                    const { error: updateError } = await sb2.from('inventory').update({
                      profiles: updatedProfiles,
                      status: hasFreeSlots ? 'AVAILABLE' : 'SOLD',
                      updated_at: new Date().toISOString()
                    }).eq('id', selectedInventoryId);
                    
                    if (updateError) {
                      // Error updating account-based inventory - ignore
                      notify('Lỗi khi cập nhật slot kho hàng', 'error');
                      return;
                    }
                    
                    // Successfully created order with slots
                  }
                } else {
                  notify('Kho hàng dạng tài khoản cần chọn ít nhất 1 slot', 'error');
                  return;
                }
              } else {
                // Classic inventory: mark as sold and link to order
                const { error: updateError } = await sb2.from('inventory').update({
                  status: 'SOLD',
                  linked_order_id: created.id,
                  updated_at: new Date().toISOString()
                }).eq('id', selectedInventoryId);
                
                if (updateError) {
                  // Error updating classic inventory - ignore
                  notify('Lỗi khi cập nhật kho hàng', 'error');
                  return;
                }
              }
            }
          } catch (error) {
            // Failed to link inventory to order - ignore
            notify('Lỗi không mong muốn khi liên kết kho hàng', 'error');
            return;
        }
      }
      
      // Refresh available inventory to reflect changes
      if (selectedInventoryId) {
        // Trigger a refresh of available inventory
        setFormData(prev => ({ ...prev }));
      }
      
      // Inventory assignment handled client-side only
      try {
        const sb2 = getSupabase();
        if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Tạo đơn hàng', details: `orderId=${created.id}; orderCode=${created.code}; packageId=${orderData.packageId}; customerId=${orderData.customerId}; inventoryId=${selectedInventoryId || '-'}; inventoryCode=${availableInventory.find(i => i.id === selectedInventoryId)?.code || '-'}; profileIds=${selectedProfileIds.join(',') || '-'}` });
      } catch {}
      notify('Tạo đơn hàng thành công', 'success');
      onSuccess(created);
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
    
  };

  const handleCustomFieldChange = (fieldId: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      customFieldValues: { ...(prev.customFieldValues || {}), [fieldId]: value }
    }));
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

    // Code will be generated client-side
    
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase not configured');
      
        const { data: createdCustomer, error: insertError } = await sb
        .from('customers')
        .insert({
          code: newCustomerData.code, // Use client-generated code
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
            employee_id: state.user?.id || null, 
            action: 'Tạo khách hàng', 
            details: `customerCode=${createdCustomer.code}; name=${newCustomerData.name}` 
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

  const filteredProducts = useMemo(() => {
    const q = debouncedProductSearch;
    if (!q) return products;
    return products.filter(p => (
      (p.name || '').toLowerCase().includes(q) ||
      (p.code || '').toLowerCase().includes(q)
    ));
  }, [products, debouncedProductSearch]);

  const filteredCustomers = useMemo(() => {
    const q = debouncedCustomerSearch;
    if (!q) return customers;
    return customers.filter(c => {
      const name = (c.name || '').toLowerCase();
      const phone = String(c.phone || '').toLowerCase();
      const email = String(c.email || '').toLowerCase();
      const code = String(c.code || '').toLowerCase();
      const notes = String(c.notes || '').toLowerCase();
      const sourceDetail = String(c.sourceDetail || '').toLowerCase();
      const type = String(c.type || '').toLowerCase();
      const source = String(c.source || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || email.includes(q) || code.includes(q) || 
             notes.includes(q) || sourceDetail.includes(q) || type.includes(q) || source.includes(q);
    });
  }, [customers, debouncedCustomerSearch]);

  const getFilteredInventory = useMemo(() => {
    const q = debouncedInventorySearch;
    if (!q) return availableInventory;
    return availableInventory.filter(item => {
      const code = String(item.code || '').toLowerCase();
      const info = String(item.productInfo || '').toLowerCase();
      const productName = (products.find(p => p.id === item.productId)?.name || '').toLowerCase();
      const packageName = (packages.find(p => p.id === item.packageId)?.name || '').toLowerCase();
      return code.includes(q) || info.includes(q) || productName.includes(q) || packageName.includes(q);
    });
  }, [availableInventory, debouncedInventorySearch, products, packages]);

  useEffect(() => {
    if (!debouncedCustomerSearch) return;
    if (filteredCustomers.length !== 1) return;
    const match = filteredCustomers[0];
    setFormData(prev => {
      if (prev.customerId === match.id) return prev;
      return { ...prev, customerId: match.id };
    });
  }, [debouncedCustomerSearch, filteredCustomers]);

  useEffect(() => {
    if (!debouncedProductSearch) return;
    if (filteredProducts.length !== 1) return;
    const match = filteredProducts[0];
    if (selectedProduct === match.id) return;
    setSelectedProduct(match.id);
    setFormData(prev => {
      if (!prev.packageId) return prev;
      return { ...prev, packageId: '' };
    });
  }, [debouncedProductSearch, filteredProducts, selectedProduct]);

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
          {/* Mã đơn hàng - Read-only display */}
          <div className="form-group">
            <label className="form-label">
              Mã đơn hàng
            </label>
            <input
              type="text"
              className="form-control"
              value={formData.code || ''}
              readOnly
              disabled
              style={{ backgroundColor: '#f8f9fa', color: '#6c757d' }}
              placeholder="Sẽ được tạo tự động..."
            />
          </div>

          {/* Mã khách hàng - Read-only display based on selected customer */}
          <div className="form-group">
            <label className="form-label">Mã khách hàng</label>
            <input
              type="text"
              className="form-control"
              value={getSelectedCustomer()?.code || ''}
              readOnly
              disabled={!getSelectedCustomer()?.code}
              style={{ backgroundColor: '#f8f9fa', color: '#6c757d' }}
              placeholder="Chọn khách hàng để hiển thị mã"
            />
          </div>

          {/* 1. Ngày mua */}
          <div className="form-group">
            <label className="form-label">
              Ngày mua <span className="text-danger">*</span>
            </label>
            <input
              type="date"
              name="purchaseDate"
              className="form-control"
              value={formData.purchaseDate && !isNaN(formData.purchaseDate.getTime()) ? formData.purchaseDate.toISOString().split('T')[0] : ''}
              onChange={(e) => {
                const dateValue = e.target.value;
                if (dateValue) {
                  const newDate = new Date(dateValue);
                  if (!isNaN(newDate.getTime())) {
                    setFormData(prev => ({ ...prev, purchaseDate: newDate }));
                  }
                }
              }}
            />
          </div>

          {/* 2. Khách hàng */}
          <div className="form-group">
            <label className="form-label">
              Khách hàng <span className="text-danger">*</span>
            </label>
            <div className="d-flex gap-2">
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  inputMode="search"
                  className="form-control mb-2"
                  placeholder="Tìm kiếm theo tên, SĐT, email, mã, ghi chú, nguồn..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
                <select
                  name="customerId"
                  className="form-control"
                  value={formData.customerId}
                  onChange={handleChange}
                >
                  <option value="">Chọn khách hàng</option>
                  {filteredCustomers.map(customer => (
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
                  // Generate fresh code for new customer
                  (async () => {
                    try {
                      const sb = getSupabase();
                      if (!sb) return;
                      const { data } = await sb.from('customers').select('code').order('created_at', { ascending: false }).limit(2000);
                      const codes = (data || []).map((r: any) => String(r.code || '')) as string[];
                      const nextCode = Database.generateNextCodeFromList(codes, 'KH', 3);
                      setNewCustomerData(prev => ({
                        ...prev,
                        code: nextCode
                      }));
                    } catch {
                      // Fallback to local storage method
                      const nextCode = Database.generateNextCustomerCode();
                      setNewCustomerData(prev => ({
                        ...prev,
                        code: nextCode
                      }));
                    }
                  })();
                  }
                }}
                className="btn btn-secondary"
              >
                Tạo mới
              </button>
            </div>
          </div>

          {/* New customer form - positioned right after customer selection */}
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
                    value={newCustomerData.code || ''}
                    placeholder="Sẽ được tạo tự động..."
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
                        inputMode="tel"
                        pattern="[0-9]*"
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

          {/* 3. Sản phẩm */}
          <div className="form-group">
            <label className="form-label">
              Sản phẩm <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              inputMode="search"
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
              {filteredProducts.map(product => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Gói sản phẩm → kiểm tra kho */}
          <div className="form-group">
            <label className="form-label">
              Gói sản phẩm <span className="text-danger">*</span>
            </label>
            <select
              name="packageId"
              className="form-control"
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
          </div>

          {/* Package info and custom expiry settings */}
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
                    className="form-control"
                    value={(formData.customExpiryDate instanceof Date && !isNaN(formData.customExpiryDate.getTime()))
                      ? formData.customExpiryDate.toISOString().split('T')[0]
                      : ''}
                    onChange={(e) => {
                      setFormData(prev => ({
                        ...prev,
                        customExpiryDate: e.target.value ? new Date(e.target.value) : undefined
                      }));
                    }}
                  />
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

          {/* Custom fields */}
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
                        className="form-control"
                        value={(formData.customFieldValues || {})[cf.id] || ''}
                        onChange={(e) => handleCustomFieldChange(cf.id, e.target.value)}
                        placeholder={cf.placeholder || `Nhập ${cf.title.toLowerCase()}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 4. Kiểm tra kho - Inventory selection */}
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
                  inputMode="search"
                    className="form-control mb-2"
                    placeholder="Tìm kho theo mã/thông tin/sản phẩm/gói..."
                    value={inventorySearch}
                    onChange={(e) => setInventorySearch(e.target.value)}
                  />
                  <select
                    className="form-control"
                    value={selectedInventoryId}
                    onChange={(e) => {
                      // Inventory selection changed
                      setSelectedInventoryId(e.target.value);
                    }}
                  >
                    <option value="">Không chọn</option>
                    {getFilteredInventory.map((item: InventoryItem) => {
                      const product = products.find(p => p.id === item.productId);
                      const packageInfo = item.packageId ? packages.find(p => p.id === item.packageId) : null;
                      const productName = product?.name || 'Không xác định';
                      const packageName = packageInfo?.name || (product?.sharedInventoryPool ? 'Kho chung' : 'Không có gói');
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
                      const isExpired = item.expiryDate ? new Date(item.expiryDate) < new Date() : false;
                      
                      // Get product info for display - Updated to remove status and payment
                      const productInfo = item.productInfo ? item.productInfo.split('\n')[0] : '';
                      const displayProductInfo = productInfo.length > 50 ? productInfo.substring(0, 50) + '...' : productInfo;
                      const notePreview = item.notes ? item.notes.replace(/\s+/g, ' ').trim() : '';
                      const displayNote = notePreview.length > 40 ? `${notePreview.slice(0, 40)}...` : notePreview;
                      
                      return (
                        <option key={item.id} value={item.id} disabled={isExpired && item.id !== selectedInventoryId}>
                          #{item.code} | {productName} | {packageName} | {displayProductInfo} | Nhập: {item.purchaseDate ? new Date(item.purchaseDate).toISOString().split('T')[0] : 'N/A'} | HSD: {expiryDate}{displayNote ? ` | Ghi chú: ${displayNote}` : ''}
                        </option>
                      );
                    })}
                  </select>
                  <div className="small text-muted mt-1">Nếu chọn, đơn sẽ sử dụng hàng trong kho và tự đánh dấu là đã bán.</div>
                  {!!selectedInventoryId && (() => {
                    const item = availableInventory.find(i => i.id === selectedInventoryId);
                    if (!item) return null;
                    
                    const product = products.find(p => p.id === item.productId);
                    const packageInfo = item.packageId ? packages.find(p => p.id === item.packageId) : null;
                    const productName = product?.name || 'Không xác định';
                    const packageName = packageInfo?.name || (product?.sharedInventoryPool ? 'Kho chung' : 'Không có gói');
                    const isSharedPool = product?.sharedInventoryPool;
                    
                    // Debug logging
                    // Inventory card debug
                    
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
                                <div className="mb-2">
                                  <strong>Thanh toán:</strong> 
                                  <span className={`badge ${
                                    item.paymentStatus === 'PAID' ? 'bg-success' : 'bg-warning'
                                  }`}>
                                    {INVENTORY_PAYMENT_STATUSES_FULL.find(s => s.value === item.paymentStatus)?.label || 'Chưa thanh toán'}
                                  </span>
                                </div>
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
                                <div className="mb-2">
                                  <strong>Ghi chú:</strong>
                                  {item.notes ? (
                                    <div className="mt-1 p-2 bg-light rounded small" style={{ whiteSpace: 'pre-wrap' }}>
                                      {item.notes}
                                    </div>
                                  ) : (
                                    <span className="text-muted ms-1">Không có</span>
                                  )}
                                </div>
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
                            
                            {/* Account Information Section */}
                            {(() => {
                              const accountColumns = item.accountColumns || packageInfo?.accountColumns || [];
                              const accountData = item.accountData || {};
                              
                              if (accountColumns.length > 0) {
                                return (
                                  <div className="mt-3">
                                    <strong>Thông tin tài khoản:</strong>
                                    <div className="mt-2">
                                      {accountColumns.map((col: any) => {
                                        const value = accountData[col.id] || '';
                                        if (!value) return null;
                                        return (
                                          <div key={col.id} style={{ marginBottom: 8 }}>
                                            <div><strong>{col.title}:</strong></div>
                                            <pre style={{ 
                                              whiteSpace: 'pre-wrap', 
                                              margin: 0, 
                                              padding: '8px', 
                                              backgroundColor: 'var(--bg-tertiary)', 
                                              color: 'var(--text-primary)',
                                              borderRadius: '4px',
                                              fontSize: '14px',
                                              border: '1px solid var(--border-color)'
                                            }}>
                                              {value}
                                            </pre>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                            
                            {item.isAccountBased && (() => {
                              // Filter available slots
                              const now = new Date();
                              const expiresAt = item.expiryDate ? normalizeExpiryDate(item.expiryDate) : undefined;
                              const inventoryExpired = expiresAt ? expiresAt.getTime() < now.getTime() : false;
                              const availableSlots = (item.profiles || [])
                                .filter(p => {
                                  // Show slot if inventory not expired and slot is free (or assigned to this order) and not needsUpdate
                                  if (inventoryExpired) {
                                    return p.isAssigned && p.assignedOrderId === (order?.id || '');
                                  }
                                  return (!p.isAssigned || p.assignedOrderId === (order?.id || '')) && !(p as any).needsUpdate;
                                })
                                // Sort by slot number (extract number from label/id)
                                .sort((a, b) => {
                                  const aNum = parseInt((a.label?.match(/\d+/)?.[0] || a.id?.match(/\d+/)?.[0] || '0')) || 0;
                                  const bNum = parseInt((b.label?.match(/\d+/)?.[0] || b.id?.match(/\d+/)?.[0] || '0')) || 0;
                                  return aNum - bNum;
                                });
                              
                              // Show only first 5 slots
                              const visibleSlots = availableSlots.slice(0, 5);
                              const totalSlots = availableSlots.length;
                              
                              return (
                                <div className="mt-3">
                                  <label className="form-label">
                                    <strong>Chọn các slot để cấp (có thể chọn nhiều)</strong>
                                  </label>
                                  <div className="row">
                                    {visibleSlots.map(p => (
                                      <div key={p.id} className="col-md-6 mb-2">
                                        <div className="form-check">
                                          <input
                                            className="form-check-input"
                                            type="checkbox"
                                            id={`slot-${p.id}`}
                                            checked={selectedProfileIds.includes(p.id)}
                                            disabled={inventoryExpired && !(p as any).assignedOrderId}
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
                                  {totalSlots > 5 && (
                                    <div className="alert alert-info mt-2 mb-2">
                                      <small>⚡ Còn {totalSlots - 5} slot khác ngoài 5 slot đã hiển thị</small>
                                    </div>
                                  )}
                                  <div className="small text-muted mt-2">
                                    Đã chọn: {selectedProfileIds.length} slot
                                  </div>
                                  <div className="small text-muted mt-1">
                                    Tự động import các cột đã tick vào Thông tin đơn hàng và đánh dấu slot.
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Informational message for new orders */}
          {(() => {
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
            if (order && !hasAvailable) {
              return (
                <div className="alert alert-warning">
                  Kho hàng cho gói này hiện đã hết. Bạn vẫn có thể cập nhật đơn, nhưng cần nhập thêm kho hoặc chọn gói khác nếu muốn cấp hàng.
                </div>
              );
            }
            return null;
          })()}


          {/* 5. Thông tin thanh toán */}
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
                      inputMode="decimal"
                      className="form-control"
                      value={formData.customPrice || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        customPrice: parseFloat(e.target.value) || 0
                      }))}
                      placeholder="Nhập giá tùy chỉnh"
                      min="0"
                      step="1000"
                    />
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
            disabled={formData.status === 'EXPIRED' || formData.paymentStatus === 'REFUNDED'}
              onChange={(e) => {
                const val = e.target.value as any;
              // Lock when expired or refunded
              if (formData.status === 'EXPIRED' || formData.paymentStatus === 'REFUNDED') return;
                // Only allow cancelling manually
                if (val === 'CANCELLED') {
                  setFormData(prev => ({ ...prev, status: 'CANCELLED' }));
                }
              }}
            >
              <option value={formData.status}>{ORDER_STATUSES.find(s => s.value === formData.status)?.label || formData.status}</option>
            {formData.status !== 'EXPIRED' && formData.paymentStatus !== 'REFUNDED' && (
              <option value="CANCELLED">Đã hủy</option>
            )}
            </select>
          <small className="text-muted">
            {formData.status === 'EXPIRED' ? 'Đơn đã hết hạn: trạng thái bị khóa.' 
             : formData.paymentStatus === 'REFUNDED' ? 'Đơn đã hoàn tiền: trạng thái bị khóa ở "Đã hủy".'
             : 'Trạng thái tự động: Hoàn thành khi đã chọn kho, Đang xử lý nếu chưa chọn.'}
          </small>
          </div>

          {/* Payment status của lần mua ban đầu */}
          <div className="form-group">
            <label className="form-label">Thanh toán lần mua ban đầu</label>
            <div className="card" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <div className="card-body" style={{ padding: '12px' }}>
                <div style={{ marginBottom: '6px' }}>
                  <strong style={{ fontSize: '13px' }}>🛒 Mua ban đầu</strong>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {formData.purchaseDate ? new Date(formData.purchaseDate).toLocaleDateString('vi-VN') : 'N/A'}
                    {(() => {
                      const pkg = packages.find(p => p.id === formData.packageId);
                      const months = pkg?.warrantyPeriod || 0;
                      return months > 0 ? ` · ${months} tháng` : '';
                    })()}
                  </div>
                </div>
                <select
                  name="paymentStatus"
                  className="form-control form-control-sm"
                  value={formData.paymentStatus}
                  onChange={handleChange}
                >
                  {PAYMENT_STATUSES.filter(s => s.value !== 'REFUNDED').map(s => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Payment status của các lần gia hạn */}
          {order && Array.isArray((order as any).renewals) && ((order as any).renewals || []).length > 0 && (
            <div className="form-group">
              <label className="form-label">Thanh toán các lần gia hạn</label>
              <div className="card" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <div className="card-body" style={{ padding: '12px' }}>
                  {((order as any).renewals || []).map((r: any, index: number) => {
                    const renewalPaymentStatus = renewalPaymentStatuses[r.id] || r.paymentStatus || 'UNPAID';
                    const renewalDate = r.createdAt ? new Date(r.createdAt).toLocaleDateString('vi-VN') : 'N/A';
                    const renewalMonths = r.months || 0;
                    
                    return (
                      <div key={r.id} style={{ marginBottom: index < ((order as any).renewals || []).length - 1 ? '12px' : '0', paddingBottom: index < ((order as any).renewals || []).length - 1 ? '12px' : '0', borderBottom: index < ((order as any).renewals || []).length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <div>
                            <strong style={{ fontSize: '13px' }}>Gia hạn lần {index + 1}</strong>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              {renewalDate} · +{renewalMonths} tháng
                            </div>
                          </div>
                        </div>
                        <select
                          className="form-control form-control-sm"
                          value={renewalPaymentStatus}
                          onChange={(e) => {
                            setRenewalPaymentStatuses(prev => ({
                              ...prev,
                              [r.id]: e.target.value
                            }));
                          }}
                        >
                          {PAYMENT_STATUSES.filter(s => s.value !== 'REFUNDED').map(s => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 6. Ghi chú */}
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
                      // Inventory release handled client-side only
                      const success = Database.deleteOrder(order.id);
                      if (success) {
                        try {
                          const sb2 = getSupabase();
                          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Xóa đơn hàng', details: `orderId=${order.id}; orderCode=${order.code}` });
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
              {order ? 'Cập nhật đơn hàng' : 'Tạo đơn hàng'}
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

