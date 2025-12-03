import React, { useEffect, useMemo, useState } from 'react';
import { InventoryFormData, Product, ProductPackage, InventoryAccountColumn, INVENTORY_PAYMENT_STATUSES_FULL, InventoryItem, InventoryPaymentStatus, InventoryRenewal } from '../../types';
import { Database } from '../../utils/database';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getSupabase } from '../../utils/supabaseClient';

interface WarehouseFormProps {
  item?: any;
  onClose: () => void;
  onSuccess: () => void;
}

const WarehouseForm: React.FC<WarehouseFormProps> = ({ item, onClose, onSuccess }) => {
  const { state } = useAuth();
  const { notify } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  // Transient months for shared pool products; not stored in DB
  const [poolMonths, setPoolMonths] = useState<number>(1);
  const [formData, setFormData] = useState<InventoryFormData>({
    code: '',
    productId: '',
    packageId: '',
    purchaseDate: new Date(),
    sourceNote: '',
    purchasePrice: undefined,
    productInfo: '',
    notes: '',
    paymentStatus: 'UNPAID',
    isAccountBased: false,
    accountColumns: [],
    accountData: {},
    totalSlots: undefined
  });
  const [renewals, setRenewals] = useState<InventoryRenewal[]>([]);
  const [renewalPaymentStatuses, setRenewalPaymentStatuses] = useState<Record<string, InventoryPaymentStatus>>({});
  const [loadingRenewals, setLoadingRenewals] = useState(false);
  const isLockedProduct = !!item && ((item.linkedOrderId && String(item.linkedOrderId).length > 0) || item.status === 'SOLD' || item.status === 'RESERVED');
  // Search states (debounced)
  const [productSearch, setProductSearch] = useState('');
  const [debouncedProductSearch, setDebouncedProductSearch] = useState('');
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const typedItem = item as InventoryItem | undefined;
  const countAssignedSlots = (inv?: InventoryItem | null) => {
    if (!inv?.isAccountBased || !Array.isArray(inv.profiles)) return 0;
    return inv.profiles.filter(slot => slot && (slot.isAssigned || !!slot.assignedOrderId)).length;
  };
  const getDeleteBlockedReason = (inv?: InventoryItem | null) => {
    if (!inv) return '';
    if (inv.linkedOrderId) return 'Kho đang liên kết với đơn hàng';
    if (inv.status !== 'AVAILABLE') return 'Chỉ xóa được kho ở trạng thái Sẵn có';
    if (countAssignedSlots(inv) > 0) return 'Kho tài khoản vẫn còn slot được gán';
    return '';
  };
  const deleteBlockedReason = typedItem ? getDeleteBlockedReason(typedItem) : '';
  const canDeleteInventory = !!typedItem && !deleteBlockedReason;

  useEffect(() => {
    (async () => {
      try {
        const sb = getSupabase();
        if (!sb) {
          setProducts(Database.getProducts());
          setPackages(Database.getPackages());
          return;
        }
        const [prodRes, pkgRes] = await Promise.all([
          sb.from('products').select('*').order('created_at', { ascending: true }),
          sb.from('packages').select('*').order('created_at', { ascending: true })
        ]);
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
        setProducts(prods);
        setPackages(pkgs);
      } catch {
        // Fallback to local cache
        setProducts(Database.getProducts());
        setPackages(Database.getPackages());
      }
    })();
  }, []);

  useEffect(() => {
    if (!item) return;
    // Prefill for edit
    setSelectedProduct(item.productId);
    // If shared pool, try infer months from existing expiry/purchase
    try {
      if ((item as any).poolWarrantyMonths) {
        setPoolMonths(Math.max(1, Number((item as any).poolWarrantyMonths)));
      } else if (item.purchaseDate && item.expiryDate) {
        const start = new Date(item.purchaseDate);
        const end = new Date(item.expiryDate);
        const months = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
        setPoolMonths(months || 1);
      }
    } catch {}
    setFormData({
      code: item.code || '',
      productId: item.productId,
      packageId: item.packageId,
      purchaseDate: new Date(item.purchaseDate),
      sourceNote: item.sourceNote || '',
      purchasePrice: item.purchasePrice,
      productInfo: item.productInfo || '',
      notes: item.notes || '',
      paymentStatus: item.paymentStatus || 'UNPAID',
      isAccountBased: !!item.isAccountBased,
      accountColumns: item.accountColumns || [],
      accountData: item.accountData || {},
      totalSlots: item.totalSlots
    });
  }, [item]);

  useEffect(() => {
    if (!item) {
      setRenewals([]);
      setRenewalPaymentStatuses({});
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingRenewals(true);
      try {
        const sb = getSupabase();
        let rows: any[] = [];
        if (sb) {
          const { data } = await sb
            .from('inventory_renewals')
            .select('*')
            .eq('inventory_id', item.id)
            .order('created_at', { ascending: true });
          rows = data || [];
        } else {
          rows = Database.getInventoryRenewals().filter(r => r.inventoryId === item.id);
        }
        if (cancelled) return;
        const mapped = rows.map((r: any) => ({
          id: r.id,
          inventoryId: r.inventory_id || r.inventoryId,
          months: Math.max(0, Number(r.months || 0)),
          amount: Number(r.amount) || 0,
          previousExpiryDate: r.previous_expiry_date
            ? new Date(r.previous_expiry_date)
            : new Date(r.previousExpiryDate),
          newExpiryDate: r.new_expiry_date ? new Date(r.new_expiry_date) : new Date(r.newExpiryDate),
          note: r.note || undefined,
          paymentStatus: (r.payment_status || r.paymentStatus || 'UNPAID') as InventoryPaymentStatus,
          createdAt: r.created_at ? new Date(r.created_at) : new Date(r.createdAt || new Date()),
          createdBy: r.created_by || r.createdBy || 'system'
        })) as InventoryRenewal[];
        if (cancelled) return;
        setRenewals(mapped);
        setRenewalPaymentStatuses(
          mapped.reduce((acc, renewal) => {
            acc[renewal.id] = (renewal.paymentStatus || 'UNPAID') as InventoryPaymentStatus;
            return acc;
          }, {} as Record<string, InventoryPaymentStatus>)
        );
      } catch {
        if (cancelled) return;
        const local = Database.getInventoryRenewals().filter(r => r.inventoryId === item.id);
        setRenewals(local);
        setRenewalPaymentStatuses(
          local.reduce((acc, renewal) => {
            acc[renewal.id] = (renewal.paymentStatus || 'UNPAID') as InventoryPaymentStatus;
            return acc;
          }, {} as Record<string, InventoryPaymentStatus>)
        );
      } finally {
        if (!cancelled) setLoadingRenewals(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item]);

  // Ensure selected product/package remain visible after async products/packages load
  useEffect(() => {
    if (!item) return;
    // If editing and current selectedProduct mismatches item after data load, resync
    if (item.productId && selectedProduct !== item.productId) {
      setSelectedProduct(item.productId);
    }
    // Ensure formData.productId matches selected product
    setFormData(prev => (
      item.productId && prev.productId !== item.productId
        ? { ...prev, productId: item.productId }
        : prev
    ));
    // Ensure packageId remains set if it's not in filtered list yet (will be handled by fallback option)
  }, [products, packages, item]);

  // Prefill code for new inventory item
  useEffect(() => {
    if (!item) {
      // Always generate fresh code for new inventory item (from Supabase)
      (async () => {
        try {
          const sb = getSupabase();
          if (!sb) return;
          const { data } = await sb.from('inventory').select('code').order('created_at', { ascending: false }).limit(2000);
          const codes = (data || []).map((r: any) => String(r.code || '')) as string[];
          const nextCode = Database.generateNextCodeFromList(codes, 'KHO', 3);
          setFormData({
            code: nextCode,
            productId: '',
            packageId: '',
            purchaseDate: new Date(),
            sourceNote: '',
            purchasePrice: 0,
            productInfo: '',
            notes: '',
            paymentStatus: 'UNPAID',
            isAccountBased: false,
            accountColumns: [],
            accountData: {},
            totalSlots: 5
          });
        } catch {
          // Fallback to local storage method
          const nextCode = Database.generateNextInventoryCode();
          setFormData({
            code: nextCode,
            productId: '',
            packageId: '',
            purchaseDate: new Date(),
            sourceNote: '',
            purchasePrice: 0,
            productInfo: '',
            notes: '',
            paymentStatus: 'UNPAID',
            isAccountBased: false,
            accountColumns: [],
            accountData: {},
            totalSlots: 5
          });
        }
      })();
    }
  }, [item]);

  // Force refresh code when form opens for new inventory item (after deletion)
  useEffect(() => {
    if (!item) {
      (async () => {
        try {
          const sb = getSupabase();
          if (!sb) return;
          const { data } = await sb.from('inventory').select('code').order('created_at', { ascending: false }).limit(2000);
          const codes = (data || []).map((r: any) => String(r.code || '')) as string[];
          const nextCode = Database.generateNextCodeFromList(codes, 'KHO', 3);
          setFormData(prev => ({
            ...prev,
            code: nextCode
          }));
        } catch {
          // Fallback to local storage method
          const nextCode = Database.generateNextInventoryCode();
          setFormData(prev => ({
            ...prev,
            code: nextCode
          }));
        }
      })();
    }
  }, []);

  const filteredPackages = useMemo(() => {
    if (!selectedProduct) return packages;
    return packages.filter(p => p.productId === selectedProduct);
  }, [packages, selectedProduct]);

  const currentProduct = useMemo(() => products.find(p => p.id === selectedProduct), [products, selectedProduct]);

  // Auto-pick a package for shared pool products to satisfy required fields and expiry calc
  useEffect(() => {
    if (!selectedProduct) return;
    const prod = products.find(p => p.id === selectedProduct);
    if (prod?.sharedInventoryPool) {
      const firstPkg = packages.find(pk => pk.productId === selectedProduct);
      setFormData(prev => ({ ...prev, packageId: firstPkg ? firstPkg.id : '' }));
      // Reset to 1 month by default for shared pool
    if (!item) setPoolMonths(1);
    }
  }, [selectedProduct, products, packages]);

  const selectedPkg = useMemo(() => packages.find(p => p.id === formData.packageId), [packages, formData.packageId]);

  // Ensure account-based inventory always has a positive slot count
  useEffect(() => {
    if (!selectedPkg) return;
    if (selectedPkg.isAccountBased) {
      setFormData(prev => {
        if (prev.totalSlots && prev.totalSlots > 0) return prev;
        const fallback = Math.max(
          1,
          Number(prev.totalSlots ?? item?.totalSlots ?? selectedPkg.defaultSlots ?? 1)
        );
        return { ...prev, totalSlots: fallback };
      });
    } else {
      setFormData(prev => (prev.totalSlots ? { ...prev, totalSlots: undefined } : prev));
    }
  }, [selectedPkg, item]);
  const pkgColumns = useMemo<InventoryAccountColumn[]>(() => {
    // Always use columns from selected package, even if empty (to reflect deletions)
    // Only fallback to item columns if no package is selected
    if (selectedPkg) {
      return selectedPkg.accountColumns || [];
    }
    // Fallback to item columns only when no package is selected (shouldn't happen in normal flow)
    return item?.accountColumns || [];
  }, [selectedPkg, item]);

  // All columns from package (for warehouse form)
  const allColumns = useMemo<InventoryAccountColumn[]>(() => {
    return pkgColumns;
  }, [pkgColumns]);

  // Display all columns
  const displayColumns = useMemo<InventoryAccountColumn[]>(() => {
    return pkgColumns;
  }, [pkgColumns]);

  // Debounce search inputs (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedProductSearch(productSearch.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [productSearch]);

  const filteredProducts = useMemo(() => {
    const q = debouncedProductSearch;
    if (!q) return products;
    return products.filter(p => (
      (p.name || '').toLowerCase().includes(q) ||
      (p.code || '').toLowerCase().includes(q)
    ));
  }, [products, debouncedProductSearch]);

  useEffect(() => {
    if (!debouncedProductSearch) return;
    if (filteredProducts.length !== 1) return;
    const match = filteredProducts[0];
    setSelectedProduct(prev => (prev === match.id ? prev : match.id));
    setFormData(prev => {
      if (prev.productId === match.id) return prev;
      return { ...prev, productId: match.id, packageId: '' };
    });
  }, [debouncedProductSearch, filteredProducts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Enhanced validation
    const newErrors: { [key: string]: string } = {};
    const ensuredCode = (formData.code || '').trim() || Database.generateNextInventoryCode();
    
    if (!ensuredCode.trim()) {
      newErrors.code = 'Mã kho hàng là bắt buộc';
    }
    
    if (!selectedProduct) {
      newErrors.productId = 'Vui lòng chọn sản phẩm';
    }
    
    // Package is required unless product uses shared inventory pool
    if (!currentProduct?.sharedInventoryPool && !formData.packageId) {
      newErrors.packageId = 'Vui lòng chọn gói sản phẩm';
    }
    
    if (!formData.purchaseDate || isNaN(formData.purchaseDate.getTime())) {
      newErrors.purchaseDate = 'Vui lòng chọn ngày nhập kho hợp lệ';
    }
    
    if (!formData.sourceNote || !formData.sourceNote.trim()) {
      newErrors.sourceNote = 'Nhập từ nguồn là bắt buộc';
    }
    
    if (!formData.productInfo || !formData.productInfo.trim()) {
      newErrors.productInfo = 'Nhập thông tin sản phẩm';
    }
    
    if (formData.purchasePrice == null || isNaN(formData.purchasePrice) || formData.purchasePrice < 0) {
      newErrors.purchasePrice = 'Giá mua không được âm';
    }
    
    // Validate required fields for columns that should be displayed in orders
    displayColumns.forEach((col: InventoryAccountColumn) => {
      const val = (formData.accountData || {})[col.id] || '';
      if (!String(val).trim()) {
        newErrors[`account_${col.id}`] = `Nhập "${col.title}"`;
      }
    });
    
    // Validate account-based inventory configuration
    if (selectedPkg?.isAccountBased) {
      if (!formData.totalSlots || formData.totalSlots < 1) {
        newErrors.totalSlots = 'Số slot phải lớn hơn 0';
      }
    }
    
    if (Object.keys(newErrors).length) {
      const errorMessages = Object.values(newErrors).join(', ');
      notify(`Vui lòng kiểm tra: ${errorMessages}`, 'warning', 4000);
      return;
    }

    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase not configured');
      if (item) {
        // Edit mode → update inventory row
        // Recalculate expiry = purchase date + total months (original warranty + all renewal months)
        const purchaseDate = new Date(formData.purchaseDate);
        const baseMonths = currentProduct?.sharedInventoryPool ? Math.max(1, Number(poolMonths || 1)) : (selectedPkg ? selectedPkg.warrantyPeriod : 0);
        
        // Load renewals for this inventory item
        let totalMonths = baseMonths;
        try {
          const { data: renewals } = await sb.from('inventory_renewals').select('months').eq('inventory_id', item.id);
          if (renewals && Array.isArray(renewals) && renewals.length > 0) {
            const renewalMonths = renewals.reduce((sum: number, r: any) => {
              const months = typeof r.months === 'number' ? r.months : 0;
              return sum + Math.max(0, months);
            }, 0);
            totalMonths = baseMonths + renewalMonths;
          }
        } catch {
          // If error loading renewals, just use base months
        }
        
        const result = new Date(purchaseDate);
        result.setMonth(result.getMonth() + totalMonths);
        const recomputedExpiryIso = result.toISOString();

        const { error } = await sb
          .from('inventory')
          .update({
            code: formData.code,
            product_id: selectedProduct,
            package_id: currentProduct?.sharedInventoryPool ? null : formData.packageId,
            purchase_date: formData.purchaseDate.toISOString().split('T')[0],
            expiry_date: recomputedExpiryIso,
            source_note: formData.sourceNote,
            purchase_price: formData.purchasePrice,
            product_info: formData.productInfo,
            notes: formData.notes,
            payment_status: formData.paymentStatus || 'UNPAID',
            account_data: formData.accountData,
            pool_warranty_months: currentProduct?.sharedInventoryPool ? Math.max(1, Number(poolMonths || 1)) : null
          })
          .eq('id', item.id);
          
        if (error) {
          // Error updating inventory - ignore
          throw new Error(error.message || 'Không thể cập nhật kho hàng');
        }
        let renewalStatusChanges: Array<{ id: string; previous: InventoryPaymentStatus; next: InventoryPaymentStatus }> = [];
        if (renewals.length > 0) {
          renewalStatusChanges = renewals
            .map(renewal => {
              const previous = (renewal.paymentStatus || 'UNPAID') as InventoryPaymentStatus;
              const next = (renewalPaymentStatuses[renewal.id] || 'UNPAID') as InventoryPaymentStatus;
              return { id: renewal.id, previous, next };
            })
            .filter(change => change.previous !== change.next);
          for (const change of renewalStatusChanges) {
            const { error: renewalUpdateError } = await sb
              .from('inventory_renewals')
              .update({ payment_status: change.next })
              .eq('id', change.id);
            if (renewalUpdateError) {
              throw new Error(renewalUpdateError.message || 'Không thể cập nhật trạng thái thanh toán gia hạn');
            }
            try {
              Database.updateInventoryRenewal(change.id, { paymentStatus: change.next } as any);
            } catch {}
          }
          if (renewalStatusChanges.length > 0) {
            setRenewals(prev => prev.map(r => {
              const change = renewalStatusChanges.find(c => c.id === r.id);
              return change ? { ...r, paymentStatus: change.next } : r;
            }));
          }
        }
        // Update local inventory and propagate to linked orders
        try {
          const current = Database.getInventory();
          const next = current.map((it) => it.id === item.id
            ? {
                ...it,
                code: formData.code,
                productId: selectedProduct,
                packageId: formData.packageId,
                purchaseDate: new Date(formData.purchaseDate),
                // Recalculate expiry based on purchase date + total months (original + renewals)
                expiryDate: (() => {
                  const localPurchaseDate = new Date(formData.purchaseDate);
                  const localResult = new Date(localPurchaseDate);
                  localResult.setMonth(localResult.getMonth() + totalMonths);
                  return localResult;
                })(),
                sourceNote: formData.sourceNote,
                purchasePrice: formData.purchasePrice,
                productInfo: formData.productInfo,
                notes: formData.notes,
                paymentStatus: formData.paymentStatus || 'UNPAID',
                accountData: formData.accountData,
                poolWarrantyMonths: currentProduct?.sharedInventoryPool ? Math.max(1, Number(poolMonths || 1)) : undefined,
                updatedAt: new Date()
              }
            : it);
          Database.setInventory(next as any);
          Database.refreshOrdersForInventory(item.id);
        } catch {}
        try {
          const sb2 = getSupabase();
          if (sb2) {
            // Capture detailed changes for warehouse edit
            const changes: string[] = [];
            
            // Track field changes with before/after values
            if (item.code !== formData.code) {
              changes.push(`code=${item.code}->${formData.code}`);
            }
            if (item.productId !== selectedProduct) {
              const oldProduct = products.find(p => p.id === item.productId);
              const newProduct = products.find(p => p.id === selectedProduct);
              changes.push(`productId=${oldProduct?.name || item.productId}->${newProduct?.name || selectedProduct}`);
            }
            if (item.packageId !== formData.packageId) {
              const oldPackage = packages.find(p => p.id === item.packageId);
              const newPackage = packages.find(p => p.id === formData.packageId);
              changes.push(`packageId=${oldPackage?.name || item.packageId || '-'}->${newPackage?.name || formData.packageId || '-'}`);
            }
            if (item.purchaseDate && new Date(item.purchaseDate).toISOString().split('T')[0] !== formData.purchaseDate.toISOString().split('T')[0]) {
              changes.push(`purchaseDate=${new Date(item.purchaseDate).toLocaleDateString('vi-VN')}->${formData.purchaseDate.toLocaleDateString('vi-VN')}`);
            }
            if (item.sourceNote !== formData.sourceNote) {
              changes.push(`sourceNote=${item.sourceNote || '-'}->${formData.sourceNote || '-'}`);
            }
            if (item.purchasePrice !== formData.purchasePrice) {
              changes.push(`purchasePrice=${item.purchasePrice || '-'}->${formData.purchasePrice || '-'}`);
            }
            if (item.productInfo !== formData.productInfo) {
              changes.push(`productInfo=${item.productInfo || '-'}->${formData.productInfo || '-'}`);
            }
            if (item.notes !== formData.notes) {
              changes.push(`notes=${item.notes || '-'}->${formData.notes || '-'}`);
            }
            if (item.paymentStatus !== formData.paymentStatus) {
              changes.push(`paymentStatus=${item.paymentStatus || '-'}->${formData.paymentStatus || '-'}`);
            }
            renewalStatusChanges.forEach(change => {
              changes.push(`renewalPaymentStatus[${change.id.slice(-6)}]=${change.previous || '-'}->${change.next || '-'}`);
            });
            
            // Track pool warranty months changes for shared inventory
            if (currentProduct?.sharedInventoryPool) {
              const oldMonths = (item as any).poolWarrantyMonths || (item as any).pool_warranty_months;
              const newMonths = Math.max(1, Number(poolMonths || 1));
              if (oldMonths !== newMonths) {
                changes.push(`poolWarrantyMonths=${oldMonths || '-'}->${newMonths}`);
              }
            }
            
            const details = changes.length > 0 
              ? `inventoryId=${item.id}; code=${formData.code}; ${changes.join('; ')}`
              : `inventoryId=${item.id}; code=${formData.code}`;
              
        await sb2.from('activity_logs').insert({
          employee_id: state.user?.id || null,
          action: 'Sửa kho',
          details
        });
          }
        } catch {}
        notify('Cập nhật kho hàng thành công', 'success');
        onSuccess();
      } else {
        // Create inventory row
        // Calculate expiry date for DB to avoid NULL constraints and keep consistent
        const expiryDateForDb = (() => {
          const purchaseDate = new Date(formData.purchaseDate);
          const months = currentProduct?.sharedInventoryPool ? Math.max(1, Number(poolMonths || 1)) : (selectedPkg ? selectedPkg.warrantyPeriod : 0);
          const d = new Date(purchaseDate);
          d.setMonth(d.getMonth() + months);
          return d.toISOString();
        })();

        const { error: insertError } = await sb
          .from('inventory')
          .insert({
            code: ensuredCode,
            product_id: selectedProduct,
            package_id: currentProduct?.sharedInventoryPool ? null : formData.packageId,
            purchase_date: formData.purchaseDate.toISOString().split('T')[0],
            expiry_date: expiryDateForDb,
            source_note: formData.sourceNote,
            purchase_price: formData.purchasePrice,
            product_info: formData.productInfo,
            notes: formData.notes,
            payment_status: formData.paymentStatus || 'UNPAID',
            // profiles/slots will be generated backend or managed separately
            account_columns: selectedPkg?.accountColumns || null,
            account_data: formData.accountData,
            is_account_based: !!selectedPkg?.isAccountBased,
            total_slots: selectedPkg?.isAccountBased ? Math.max(1, Number(selectedPkg?.defaultSlots || 5)) : null,
            pool_warranty_months: currentProduct?.sharedInventoryPool ? Math.max(1, Number(poolMonths || 1)) : null
            
          });
          
        if (insertError) {
          // Error creating inventory - ignore
          throw new Error(insertError.message || 'Không thể tạo kho hàng');
        }
        
        // Update local storage immediately to avoid code conflicts
        const purchaseDate = new Date(formData.purchaseDate);
        const expiryDate = (() => {
          const date = new Date(purchaseDate);
          const months = currentProduct?.sharedInventoryPool ? Math.max(1, Number(poolMonths || 1)) : (selectedPkg ? selectedPkg.warrantyPeriod : 0);
          date.setMonth(date.getMonth() + months);
          return date;
        })();
        
        const newInventoryItem = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          code: ensuredCode,
          productId: formData.productId,
          packageId: formData.packageId,
          purchaseDate,
          expiryDate,
          sourceNote: formData.sourceNote,
          purchasePrice: formData.purchasePrice,
          productInfo: formData.productInfo,
          notes: formData.notes,
          paymentStatus: formData.paymentStatus || 'UNPAID',
          status: 'AVAILABLE' as const,
          isAccountBased: !!selectedPkg?.isAccountBased,
          accountColumns: selectedPkg?.accountColumns,
          accountData: formData.accountData,
          totalSlots: selectedPkg?.isAccountBased ? Math.max(1, Number(selectedPkg?.defaultSlots || 5)) : undefined,
          profiles: selectedPkg?.isAccountBased ? Array.from({ length: Math.max(1, Number(selectedPkg?.defaultSlots || 5)) }, (_, idx) => ({ id: `slot-${idx + 1}`, label: `Slot ${idx + 1}`, isAssigned: false })) : undefined,
          poolWarrantyMonths: currentProduct?.sharedInventoryPool ? Math.max(1, Number(poolMonths || 1)) : undefined,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        const currentInventory = Database.getInventory();
        Database.setInventory([...currentInventory, newInventoryItem]);
        
        try {
          const sb2 = getSupabase();
          if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Nhập kho', details: `productId=${selectedProduct}; packageId=${formData.packageId}; inventoryCode=${ensuredCode}; price=${formData.purchasePrice ?? '-'}; source=${formData.sourceNote || '-'}; notes=${(formData.notes || '-').toString().slice(0,80)}` });
        } catch {}
        notify('Nhập kho thành công', 'success');
        onSuccess();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Có lỗi xảy ra khi nhập kho';
      notify(errorMessage, 'error');
    }
  };

  return (
    <>
    <div className="modal">
      <div className="modal-content" style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{item ? 'Sửa kho' : 'Nhập kho'}</h3>
          <button type="button" className="close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Mã kho hàng *</label>
            <input
              type="text"
              className="form-control"
              value={formData.code}
              onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
              placeholder="Tự tạo như KHO001"
              readOnly
              disabled
              aria-disabled
              title={'Mã tự động tạo - không chỉnh sửa'}
              style={{ opacity: 0.6 } as React.CSSProperties}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Sản phẩm</label>
            <input
              type="text"
              className="form-control mb-2"
              placeholder="Tìm sản phẩm theo tên/mã..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              disabled={isLockedProduct}
            />
            <select
              className="form-control"
              value={selectedProduct}
              onChange={(e) => {
                setSelectedProduct(e.target.value);
                setFormData(prev => ({ ...prev, productId: e.target.value, packageId: '' }));
              }}
              disabled={isLockedProduct}
            >
              <option value="">Chọn sản phẩm</option>
              {/* Fallback option to show current selection before products load */}
              {selectedProduct && !products.some(p => p.id === selectedProduct) && (
                <option value={selectedProduct}>
                  Đang tải sản phẩm...
                </option>
              )}
              {filteredProducts.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {isLockedProduct && <div className="small text-muted mt-1">Đang liên kết đơn hàng - không thể đổi sản phẩm</div>}
          </div>

          <div className="form-group">
            <label className="form-label">Gói sản phẩm</label>
            {currentProduct?.sharedInventoryPool ? (
              <input className="form-control" value="Pool chung" disabled />
            ) : (
              <select
                className="form-control"
                value={formData.packageId}
                onChange={(e) => {
                  const nextPackageId = e.target.value;
                  const nextPackage = packages.find(pkg => pkg.id === nextPackageId);
                  setFormData(prev => ({
                    ...prev,
                    packageId: nextPackageId,
                    totalSlots: nextPackage?.isAccountBased
                      ? Math.max(
                          1,
                          Number(
                            nextPackage?.defaultSlots ??
                              prev.totalSlots ??
                              item?.totalSlots ??
                              1
                          )
                        )
                      : undefined
                  }));
                }}
                disabled={!selectedProduct || isLockedProduct}
              >
                <option value="">Chọn gói</option>
                {/* Fallback option to show current package before packages load/filter */}
                {formData.packageId && !filteredPackages.some(pk => pk.id === formData.packageId) && (
                  <option value={formData.packageId}>Đang tải gói...</option>
                )}
                {filteredPackages.map(pkg => (
                  <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
                ))}
              </select>
            )}
            {isLockedProduct && <div className="small text-muted mt-1">Đang liên kết đơn hàng - không thể đổi gói</div>}
          </div>

          <div className="form-group">
            <label className="form-label">Ngày nhập</label>
            <input
              type="date"
              className="form-control"
              value={formData.purchaseDate && !isNaN(formData.purchaseDate.getTime()) ? formData.purchaseDate.toISOString().split('T')[0] : ''}
              onChange={(e) => {
                const dateValue = e.target.value;
                if (dateValue) {
                  const newDate = new Date(dateValue);
                  if (!isNaN(newDate.getTime())) {
                    // When changing purchase date, reset expiry logic by recomputing months baseline (handled on submit)
                    setFormData(prev => ({ ...prev, purchaseDate: newDate }));
                  }
                }
              }}
            />
          </div>
        {currentProduct?.sharedInventoryPool && (
          <div className="form-group">
            <label className="form-label">Thời hạn (tháng)</label>
            <input
              type="number"
              className="form-control"
              value={poolMonths || ''}
              onChange={(e) => setPoolMonths(Math.max(1, parseInt(e.target.value || '1', 10)))}
              min={1}
            />
          </div>
        )}

          <div className="form-group">
            <label className="form-label">
              Nhập từ nguồn <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className="form-control"
              value={formData.sourceNote || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, sourceNote: e.target.value }))}
              placeholder="vd: Bạn hàng, key khuyến mãi, ..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Giá mua <span className="text-danger">*</span></label>
            <input
              type="text"
              className="form-control"
              value={
                (formData.purchasePrice ?? '') === ''
                  ? ''
                  : new Intl.NumberFormat('vi-VN').format(Number(formData.purchasePrice)) + ' đ'
              }
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                const num = raw ? Number(raw) : NaN;
                setFormData(prev => ({ ...prev, purchasePrice: isNaN(num) ? undefined : num }));
              }}
              placeholder="0 đ"
              inputMode="numeric"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Thanh toán nhập kho ban đầu</label>
            <div className="card" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <div className="card-body" style={{ padding: '12px' }}>
                <div style={{ marginBottom: '6px' }}>
                  <strong style={{ fontSize: '13px' }}>📥 Nhập kho</strong>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {formData.purchaseDate ? new Date(formData.purchaseDate).toLocaleDateString('vi-VN') : 'N/A'}
                    {(() => {
                      const months = currentProduct?.sharedInventoryPool
                        ? Math.max(1, Number(poolMonths || 1))
                        : (selectedPkg?.warrantyPeriod || 0);
                      return months ? ` · ${months} tháng` : '';
                    })()}
                  </div>
                </div>
                <select
                  className="form-control form-control-sm"
                  value={formData.paymentStatus || 'UNPAID'}
                  onChange={(e) => setFormData(prev => ({ ...prev, paymentStatus: e.target.value as InventoryPaymentStatus }))}
                >
                  {INVENTORY_PAYMENT_STATUSES_FULL.map(status => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {item && (
            <div className="form-group">
              <label className="form-label">Thanh toán các lần gia hạn kho</label>
              <div className="card" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <div className="card-body" style={{ padding: '12px' }}>
                  {loadingRenewals && (
                    <div className="text-muted small">Đang tải lịch sử gia hạn...</div>
                  )}
                  {!loadingRenewals && renewals.length === 0 && (
                    <div className="text-muted small">Chưa có lần gia hạn nào</div>
                  )}
                  {!loadingRenewals && renewals.length > 0 && renewals.map((renewal, index) => (
                    <div
                      key={renewal.id}
                      style={{
                        marginBottom: index < renewals.length - 1 ? '12px' : '0',
                        paddingBottom: index < renewals.length - 1 ? '12px' : '0',
                        borderBottom: index < renewals.length - 1 ? '1px solid var(--border-color)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div>
                          <strong style={{ fontSize: '13px' }}>Gia hạn lần {index + 1}</strong>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {(renewal.createdAt ? new Date(renewal.createdAt) : new Date()).toLocaleDateString('vi-VN')} · +{renewal.months} tháng
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                        {new Date(renewal.previousExpiryDate).toLocaleDateString('vi-VN')} → <span style={{ color: '#28a745', fontWeight: 500 }}>{new Date(renewal.newExpiryDate).toLocaleDateString('vi-VN')}</span>
                      </div>
                      <select
                        className="form-control form-control-sm"
                        value={renewalPaymentStatuses[renewal.id] || 'UNPAID'}
                        onChange={(e) => {
                          const value = e.target.value as InventoryPaymentStatus;
                          setRenewalPaymentStatuses(prev => ({ ...prev, [renewal.id]: value }));
                        }}
                      >
                        {INVENTORY_PAYMENT_STATUSES_FULL.map(status => (
                          <option key={status.value} value={status.value}>{status.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        {/* Shared pool: allow entering months transiently to compute expiry (not persisted) */}

          <div className="form-group">
            <label className="form-label">Thông tin sản phẩm <span className="text-danger">*</span></label>
            <textarea
              className="form-control"
              value={formData.productInfo || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, productInfo: e.target.value }))}
              placeholder="Serial/Key/Tài khoản..."
              rows={3}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Ghi chú (nội bộ)</label>
            <textarea
              className="form-control"
              value={formData.notes || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Ghi chú cho sản phẩm trong kho"
              rows={2}
            />
          </div>

          {/* All account columns from package */}
          {allColumns.length > 0 && (
            <div className="card mt-3">
              <div className="card-header">
                <h5 className="mb-0">Thông tin tài khoản</h5>
              </div>
              <div className="card-body">
                {allColumns.map((col: InventoryAccountColumn) => {
                  const isRequired = false;
                  return (
                    <div key={col.id} className="form-group">
                      <label className="form-label">
                        {col.title} 
                        {isRequired && <span className="text-danger"> *</span>}
                        {!isRequired && <span className="text-muted small"></span>}
                      </label>
                      <textarea
                        className="form-control"
                        value={(formData.accountData || {})[col.id] || ''}
                        onChange={(e) =>
                          setFormData(prev => ({
                            ...prev,
                            accountData: { ...(prev.accountData || {}), [col.id]: e.target.value }
                          }))
                        }
                        placeholder={col.title}
                        rows={col.title.toLowerCase().includes('hướng dẫn') ? 4 : 2}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
            {typedItem && (
              canDeleteInventory ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setConfirmDeleteVisible(true)}
                >
                  Xóa
                </button>
              ) : (
                <span className="text-muted small" title={deleteBlockedReason || undefined}>
                  Không thể xóa: {deleteBlockedReason || 'Kho chưa sẵn sàng'}
                </span>
              )
            )}
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
              <button type="submit" className="btn btn-primary">{item ? 'Cập nhật' : 'Lưu'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
    {confirmDeleteVisible && typedItem && canDeleteInventory && (
      <div className="modal" role="dialog" aria-modal>
        <div className="modal-content" style={{ maxWidth: 420 }}>
          <div className="modal-header">
            <h3 className="modal-title">Xác nhận</h3>
            <button className="close" onClick={() => setConfirmDeleteVisible(false)}>×</button>
          </div>
          <div className="mb-4" style={{ color: 'var(--text-primary)' }}>Xóa mục này khỏi kho?</div>
          <div className="d-flex justify-content-end gap-2">
            <button className="btn btn-secondary" onClick={() => setConfirmDeleteVisible(false)}>Hủy</button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                try {
                  const sb = getSupabase();
                  if (!sb) { notify('Không thể xóa kho', 'error'); return; }
                  const snapshot = Database.getInventory().find((i: InventoryItem) => i.id === typedItem.id) || null;
                  const { data: latest } = await sb
                    .from('inventory')
                    .select('id, status, linked_order_id, is_account_based, profiles')
                    .eq('id', typedItem.id)
                    .maybeSingle();
                  const normalized: InventoryItem = {
                    ...(snapshot || typedItem),
                    status: latest?.status ?? (snapshot?.status ?? typedItem.status),
                    linkedOrderId: latest?.linked_order_id ?? (snapshot?.linkedOrderId ?? typedItem.linkedOrderId),
                    isAccountBased: Boolean(latest?.is_account_based ?? snapshot?.isAccountBased ?? typedItem.isAccountBased),
                    profiles: Array.isArray(latest?.profiles) ? latest?.profiles : (snapshot?.profiles || typedItem.profiles)
                  } as InventoryItem;
                  const latestReason = getDeleteBlockedReason(normalized);
                  if (latestReason) {
                    notify(latestReason, 'error');
                    setConfirmDeleteVisible(false);
                    onSuccess();
                    return;
                  }
                  const { error } = await sb.from('inventory').delete().eq('id', item.id);
                  if (error) { notify('Không thể xóa kho', 'error'); return; }
                  const currentInventory = Database.getInventory();
                  Database.setInventory(currentInventory.filter((i: any) => i.id !== item.id));
                  try {
                    const sb2 = getSupabase();
                    if (sb2) await sb2.from('activity_logs').insert({ employee_id: state.user?.id || null, action: 'Xóa khỏi kho', details: `inventoryId=${item.id}; inventoryCode=${item.code || ''}; productId=${snapshot?.productId || ''}; packageId=${snapshot?.packageId || ''}; productInfo=${snapshot?.productInfo || ''}` });
                  } catch {}
                  notify('Đã xóa khỏi kho', 'success');
                  setConfirmDeleteVisible(false);
                  onClose();
                  onSuccess();
                } catch {
                  notify('Không thể xóa mục này khỏi kho', 'error');
                }
              }}
            >
              Xác nhận
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default WarehouseForm;


