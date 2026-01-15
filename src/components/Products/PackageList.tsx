import React, { useState, useEffect } from 'react';
import { ProductPackage, Product } from '../../types';
import { Database } from '../../utils/database';
import PackageForm from './PackageForm';
// removed export button
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getSupabase } from '../../utils/supabaseClient';
import { exportToXlsx, generateExportFilename } from '../../utils/excel';
import useMediaQuery from '../../hooks/useMediaQuery';

type PackageWithUsage = ProductPackage & {
  hasLinkedOrders?: boolean;
  hasLinkedInventory?: boolean;
};

const PackageList: React.FC = () => {
  const { state } = useAuth();
  const { notify } = useToast();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [packages, setPackages] = useState<PackageWithUsage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingPackage, setEditingPackage] = useState<ProductPackage | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const canDeletePackage = (pkg?: PackageWithUsage | null) => !!pkg && !pkg.hasLinkedOrders && !pkg.hasLinkedInventory;
  const getUsageLabel = (pkg: PackageWithUsage) => {
    const reasons: string[] = [];
    if (pkg.hasLinkedOrders) reasons.push('đơn hàng');
    if (pkg.hasLinkedInventory) reasons.push('kho hàng');
    if (reasons.length === 0) return '';
    return `Đang gắn với ${reasons.join(' & ')}`;
  };

  const fetchPackageUsageMap = async (packageIds: string[], client?: ReturnType<typeof getSupabase>) => {
    if (!packageIds.length) return {} as Record<string, { hasLinkedOrders: boolean; hasLinkedInventory: boolean }>;
    const sbClient = client ?? getSupabase();
    if (!sbClient) return {} as Record<string, { hasLinkedOrders: boolean; hasLinkedInventory: boolean }>;
    const ordersRes = await sbClient.from('orders').select('package_id').in('package_id', packageIds);
    if (ordersRes.error) console.error('Không thể lấy orders để kiểm tra gói', ordersRes.error);
    const inventoryRes = await sbClient.from('inventory').select('package_id').in('package_id', packageIds);
    if (inventoryRes.error) console.error('Không thể lấy inventory để kiểm tra gói', inventoryRes.error);
    const orderPackageIds = new Set((ordersRes.data || []).map((o: any) => o.package_id).filter(Boolean));
    const inventoryPackageIds = new Set((inventoryRes.data || []).map((i: any) => i.package_id).filter(Boolean));
    const usageMap: Record<string, { hasLinkedOrders: boolean; hasLinkedInventory: boolean }> = {};
    packageIds.forEach(id => {
      usageMap[id] = {
        hasLinkedOrders: orderPackageIds.has(id),
        hasLinkedInventory: inventoryPackageIds.has(id)
      };
    });
    return usageMap;
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const sb = getSupabase();
    if (!sb) return;
    const [pkRes, prRes] = await Promise.all([
      sb.from('packages').select('*').order('created_at', { ascending: true }),
      sb.from('products').select('*').order('created_at', { ascending: true })
    ]);
    const allPackages = (pkRes.data || []).map((r: any) => ({
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
    const allProducts = (prRes.data || []).map((r: any) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description || '',
      sharedInventoryPool: !!r.shared_inventory_pool,
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
    })) as Product[];
    const usageMap = await fetchPackageUsageMap(allPackages.map(p => p.id), sb);
    const decoratedPackages = allPackages.map(pkg => ({
      ...pkg,
      hasLinkedOrders: usageMap[pkg.id]?.hasLinkedOrders || false,
      hasLinkedInventory: usageMap[pkg.id]?.hasLinkedInventory || false
    }));
    setPackages(decoratedPackages);
    setSelectedIds(prev => prev.filter(id => {
      const usage = usageMap[id];
      if (!usage) return true;
      return !(usage.hasLinkedInventory || usage.hasLinkedOrders);
    }));
    setProducts(allProducts);
  };

  // Realtime subscribe packages
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const ch = sb
      .channel('realtime:packages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packages' }, () => loadData())
      .subscribe();
    return () => { try { ch.unsubscribe(); } catch { } };
  }, []);

  const handleCreate = () => {
    setEditingPackage(null);
    setShowForm(false); // Force close first
    setTimeout(() => {
      setShowForm(true); // Then open with fresh state
    }, 50); // Small delay to ensure fresh state
  };

  const handleEdit = (pkg: ProductPackage) => {
    setEditingPackage(pkg);
    setShowForm(true);
  };

  const [confirmState, setConfirmState] = useState<null | { message: string; onConfirm: () => void }>(null);

  const handleDelete = (id: string) => {
    const target = packages.find(p => p.id === id);
    if (!target) return;
    if (!canDeletePackage(target)) {
      notify('Gói sản phẩm đang gắn với đơn hàng hoặc kho hàng, không thể xóa', 'warning');
      return;
    }
    setConfirmState({
      message: 'Bạn có chắc chắn muốn xóa gói sản phẩm này?',
      onConfirm: async () => {
        const sb = getSupabase();
        if (!sb) return notify('Không thể xóa gói sản phẩm', 'error');
        const usageMap = await fetchPackageUsageMap([id], sb);
        const usage = usageMap[id];
        if (usage?.hasLinkedOrders || usage?.hasLinkedInventory) {
          notify('Gói sản phẩm đang gắn với đơn hàng hoặc kho hàng, không thể xóa', 'error');
          loadData();
          return;
        }
        const { error } = await sb.from('packages').delete().eq('id', id);
        if (!error) {
          // Update local storage immediately
          const currentPackages = Database.getPackages();
          Database.setPackages(currentPackages.filter(p => p.id !== id));

          // Update related inventory items to remove package reference
          try {
            await sb.from('inventory')
              .update({
                package_id: null,
                account_columns: null,
                is_account_based: false,
                total_slots: null
              })
              .eq('package_id', id);

            // Update local storage inventory items
            const currentInventory = Database.getInventory();
            const updatedInventory = currentInventory.map(item => {
              if (item.packageId === id) {
                return {
                  ...item,
                  packageId: '',
                  accountColumns: [],
                  isAccountBased: false,
                  totalSlots: undefined,
                  updatedAt: new Date()
                };
              }
              return item;
            });
            Database.setInventory(updatedInventory);
          } catch { }

          // Force refresh form if it's open
          if (showForm && !editingPackage) {
            setShowForm(false);
            setTimeout(() => {
              setShowForm(true);
            }, 50); // Reduced delay for better UX
          }

          try {
            const sb2 = getSupabase();
            if (sb2) await sb2.from('activity_logs').insert({
              employee_id: state.user?.id || null,
              action: 'Xóa gói sản phẩm',
              details: [
                `packageId=${id}`,
                target?.code ? `packageCode=${target.code}` : '',
                target?.name ? `packageName=${target.name}` : '',
                target?.productId ? `productId=${target.productId}` : '',
                target?.productId ? `productName=${getProductName(target.productId)}` : ''
              ].filter(Boolean).join('; ')
            });
          } catch { }
          loadData();
          notify('Xóa gói sản phẩm thành công', 'success');
        } else {
          notify('Không thể xóa gói sản phẩm', 'error');
        }
      }
    });
  };

  const handleFormSubmit = () => {
    setShowForm(false);
    setEditingPackage(null);
    loadData();
  };

  const toggleSelectAll = (checked: boolean, ids: string[]) => {
    const eligibleIds = ids.filter(id => canDeletePackage(packages.find(p => p.id === id)));
    if (eligibleIds.length === 0) {
      if (checked) notify('Các gói đã chọn đang được sử dụng nên không thể xóa', 'warning');
      return;
    }
    if (checked) {
      setSelectedIds(prev => Array.from(new Set([...prev, ...eligibleIds])));
    } else {
      setSelectedIds(prev => prev.filter(id => !eligibleIds.includes(id)));
    }
  };
  const toggleSelect = (id: string, checked: boolean) => {
    const pkg = packages.find(p => p.id === id);
    if (!canDeletePackage(pkg)) {
      if (checked) notify('Gói sản phẩm đang gắn với đơn hàng hoặc kho hàng, không thể xóa', 'warning');
      return;
    }
    setSelectedIds(prev => checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id));
  };
  const bulkDelete = () => {
    if (selectedIds.length === 0) return;
    const deletableIds = selectedIds.filter(id => canDeletePackage(packages.find(p => p.id === id)));
    const blockedCount = selectedIds.length - deletableIds.length;
    if (blockedCount > 0) {
      notify(`${blockedCount} gói đang được sử dụng nên không thể xóa`, 'warning');
      setSelectedIds(deletableIds);
    }
    if (deletableIds.length === 0) {
      notify('Không còn gói nào có thể xóa', 'warning');
      return;
    }
    const targets = packages.filter(p => deletableIds.includes(p.id));
    setConfirmState({
      message: `Xóa ${deletableIds.length} gói sản phẩm đã chọn?`,
      onConfirm: async () => {
        const sb = getSupabase();
        if (!sb) return notify('Không thể xóa gói sản phẩm', 'error');
        const usageMap = await fetchPackageUsageMap(deletableIds, sb);
        const lockedNow = deletableIds.filter(id => {
          const usage = usageMap[id];
          return usage?.hasLinkedOrders || usage?.hasLinkedInventory;
        });
        if (lockedNow.length > 0) {
          notify('Một số gói vừa phát sinh liên kết, thử lại sau', 'error');
          setSelectedIds(prev => prev.filter(id => !lockedNow.includes(id)));
          loadData();
          return;
        }
        const { error } = await sb.from('packages').delete().in('id', deletableIds);
        if (!error) {
          // Update local storage immediately
          const currentPackages = Database.getPackages();
          Database.setPackages(currentPackages.filter(p => !deletableIds.includes(p.id)));

          // Update related inventory items to remove package references
          try {
            await sb.from('inventory')
              .update({
                package_id: null,
                account_columns: null,
                is_account_based: false,
                total_slots: null
              })
              .in('package_id', deletableIds);

            // Update local storage inventory items
            const currentInventory = Database.getInventory();
            const updatedInventory = currentInventory.map(item => {
              if (deletableIds.includes(item.packageId)) {
                return {
                  ...item,
                  packageId: '',
                  accountColumns: [],
                  isAccountBased: false,
                  totalSlots: undefined,
                  updatedAt: new Date()
                };
              }
              return item;
            });
            Database.setInventory(updatedInventory);
          } catch { }

          // Force refresh form if it's open
          if (showForm && !editingPackage) {
            setShowForm(false);
            setTimeout(() => {
              setShowForm(true);
            }, 50); // Reduced delay for better UX
          }

          try {
            const sb2 = getSupabase();
            if (sb2) await sb2.from('activity_logs').insert({
              employee_id: state.user?.id || null,
              action: 'Xóa hàng loạt gói',
              details: [
                `ids=${deletableIds.join(',')}`,
                `codes=${targets.map(t => t.code).filter(Boolean).join(',')}`,
                `names=${targets.map(t => t.name).filter(Boolean).join(',')}`
              ].filter(Boolean).join('; ')
            });
          } catch { }
          setSelectedIds([]);
          loadData();
          notify('Đã xóa gói đã chọn', 'success');
        } else {
          notify('Không thể xóa gói sản phẩm', 'error');
        }
      }
    });
  };

  const getProductName = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : 'Không xác định';
  };

  const formatWarrantyPeriod = (months: number) => {
    if (months >= 24) {
      return 'Vĩnh viễn';
    } else if (months >= 12) {
      const years = Math.floor(months / 12);
      return `${years} năm`;
    } else {
      return `${months} tháng`;
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price);
  };

  const exportPackagesXlsx = (items: ProductPackage[], filename: string) => {
    const rows = items.map((pkg, idx) => {
      const product = products.find(p => p.id === pkg.productId);

      // Build custom fields info
      const customFieldsInfo = (pkg.customFields || []).filter(cf => cf && cf.title).map(cf => cf.title).join('; ');

      // Build account columns info
      const accountColumnsInfo = (pkg.accountColumns || []).filter(col => col && col.title).map(col => col.title).join('; ');

      return {
        // Basic info
        code: pkg.code || `PK${idx + 1}`,
        name: pkg.name || '',
        productName: product?.name || 'Không xác định',
        productCode: product?.code || '',
        productDescription: product?.description || '',

        // Warranty info
        warrantyPeriod: formatWarrantyPeriod(pkg.warrantyPeriod),
        warrantyPeriodValue: pkg.warrantyPeriod,

        // Pricing
        costPrice: pkg.costPrice || 0,
        ctvPrice: pkg.ctvPrice || 0,
        retailPrice: pkg.retailPrice || 0,

        // Custom fields
        customFields: customFieldsInfo,
        customFieldsCount: pkg.customFields?.length || 0,

        // Account-based info
        isAccountBased: pkg.isAccountBased ? 'Có' : 'Không',
        isAccountBasedValue: pkg.isAccountBased || false,
        accountColumns: accountColumnsInfo,
        accountColumnsCount: pkg.accountColumns?.length || 0,
        defaultSlots: pkg.defaultSlots || 0,

        // System info
        createdAt: new Date(pkg.createdAt).toLocaleDateString('vi-VN'),
        updatedAt: new Date(pkg.updatedAt).toLocaleDateString('vi-VN'),

        // Raw dates for sorting
        createdAtRaw: pkg.createdAt.toISOString(),
        updatedAtRaw: pkg.updatedAt.toISOString(),
      };
    });

    exportToXlsx(rows, [
      // Basic info
      { header: 'Mã gói', key: 'code', width: 16 },
      { header: 'Tên gói', key: 'name', width: 28 },
      { header: 'Tên sản phẩm', key: 'productName', width: 24 },
      { header: 'Mã sản phẩm', key: 'productCode', width: 16 },
      { header: 'Mô tả sản phẩm', key: 'productDescription', width: 30 },

      // Warranty info
      { header: 'Thời hạn bảo hành', key: 'warrantyPeriod', width: 16 },
      { header: 'Thời hạn (tháng)', key: 'warrantyPeriodValue', width: 14 },

      // Pricing
      { header: 'Giá gốc', key: 'costPrice', width: 14 },
      { header: 'Giá CTV', key: 'ctvPrice', width: 14 },
      { header: 'Giá lẻ', key: 'retailPrice', width: 14 },

      // Custom fields
      { header: 'Trường tùy chỉnh', key: 'customFields', width: 30 },
      { header: 'Số trường tùy chỉnh', key: 'customFieldsCount', width: 16 },

      // Account-based info
      { header: 'Dạng tài khoản', key: 'isAccountBased', width: 14 },
      { header: 'Dạng tài khoản (giá trị)', key: 'isAccountBasedValue', width: 18 },
      { header: 'Cột tài khoản', key: 'accountColumns', width: 30 },
      { header: 'Số cột tài khoản', key: 'accountColumnsCount', width: 16 },
      { header: 'Slot mặc định', key: 'defaultSlots', width: 14 },

      // System info
      { header: 'Ngày tạo', key: 'createdAt', width: 14 },
      { header: 'Ngày cập nhật', key: 'updatedAt', width: 14 },
    ], filename, 'Gói sản phẩm');
  };

  const filteredPackages = packages.filter(pkg => {
    const normalizedSearch = searchTerm.toLowerCase();
    const productName = getProductName(pkg.productId).toLowerCase();
    const matchesSearch = pkg.name.toLowerCase().includes(normalizedSearch) ||
      (pkg.code || '').toLowerCase().includes(normalizedSearch) ||
      productName.includes(normalizedSearch);
    return matchesSearch;
  });

  const total = filteredPackages.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;
  const sortedPackages = filteredPackages
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
  const pageItems = sortedPackages.slice(start, start + limit);
  const selectablePageIds = pageItems.filter(pkg => canDeletePackage(pkg)).map(pkg => pkg.id);

  return (
    <div className="card">
      <div className="card-header">
        <div className="d-flex justify-content-between align-items-center">
          <h2 className="card-title">Danh sách gói sản phẩm</h2>
          <div className="d-flex gap-2">
            {selectedIds.length > 0 && !isMobile && (
              <>
                <span className="badge bg-primary">Đã chọn: {selectedIds.length}</span>
                <button className="btn btn-danger" onClick={bulkDelete}>Xóa đã chọn ({selectedIds.length})</button>
              </>
            )}
            {!isMobile && (
              <>
                <button className="btn btn-light" onClick={() => {
                  const filename = generateExportFilename('GoiSanPham', {
                    searchTerm,
                    total: filteredPackages.length
                  }, 'KetQuaLoc');
                  exportPackagesXlsx(filteredPackages, filename);
                }}>Xuất Excel (kết quả đã lọc)</button>
              </>
            )}
            <button
              onClick={handleCreate}
              className="btn btn-primary"
            >
              Thêm gói sản phẩm
            </button>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="mb-3">
          <input
            type="text"
            className="form-control"
            placeholder="Tìm kiếm gói sản phẩm..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {filteredPackages.length === 0 ? (
        <div className="text-center py-4">
          <p>Không có gói sản phẩm nào</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="package-mobile">
            {pageItems.map((pkg, index) => (
              <div key={pkg.id} className="package-card">
                <div className="package-card-header">
                  <div className="d-flex align-items-center gap-2">
                    <div className="package-card-title">{pkg.name}</div>
                  </div>
                  <div className="package-card-subtitle">{pkg.code || `PK${index + 1}`}</div>
                </div>

                <div className="package-card-row">
                  <div className="package-card-label">Mã gói</div>
                  <div className="package-card-value">{pkg.code || `PK${index + 1}`}</div>
                </div>
                <div className="package-card-row">
                  <div className="package-card-label">Sản phẩm</div>
                  <div className="package-card-value">{getProductName(pkg.productId)}</div>
                </div>
                <div className="package-card-row">
                  <div className="package-card-label">Bảo hành</div>
                  <div className="package-card-value">{formatWarrantyPeriod(pkg.warrantyPeriod)}</div>
                </div>
                <div className="package-card-row">
                  <div className="package-card-label">Giá gốc</div>
                  <div className="package-card-value">{formatPrice(pkg.costPrice)}</div>
                </div>
                <div className="package-card-row">
                  <div className="package-card-label">Giá CTV</div>
                  <div className="package-card-value">{formatPrice(pkg.ctvPrice)}</div>
                </div>
                <div className="package-card-row">
                  <div className="package-card-label">Giá lẻ</div>
                  <div className="package-card-value">{formatPrice(pkg.retailPrice)}</div>
                </div>

                <div className="package-card-actions">
                  <button
                    onClick={() => handleEdit(pkg)}
                    className="btn btn-secondary"
                  >
                    Sửa
                  </button>
                  {canDeletePackage(pkg) ? (
                    <button
                      onClick={() => handleDelete(pkg.id)}
                      className="btn btn-danger"
                    >
                      Xóa
                    </button>
                  ) : (
                    <span className="badge bg-light text-dark" title={getUsageLabel(pkg)}>
                      Đang dùng
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="table-responsive package-table">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36, minWidth: 36, maxWidth: 36 }}>
                    <input
                      type="checkbox"
                      checked={selectablePageIds.length > 0 && selectablePageIds.every(id => selectedIds.includes(id))}
                      disabled={selectablePageIds.length === 0}
                      onChange={(e) => toggleSelectAll(e.target.checked, selectablePageIds)}
                    />
                  </th>
                  <th style={{ width: '80px', minWidth: '80px', maxWidth: '100px' }}>Mã gói</th>
                  <th style={{ width: '120px', minWidth: '120px', maxWidth: '150px' }}>Tên gói</th>
                  <th style={{ width: '120px', minWidth: '120px', maxWidth: '150px' }}>Sản phẩm</th>
                  <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Thời hạn bảo hành</th>
                  <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Giá gốc</th>
                  <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Giá CTV</th>
                  <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Giá khách lẻ</th>
                  <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((pkg, index) => (
                  <tr key={pkg.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(pkg.id)}
                        disabled={!canDeletePackage(pkg)}
                        title={canDeletePackage(pkg) ? undefined : 'Gói đang được sử dụng, không thể xóa'}
                        onChange={(e) => toggleSelect(pkg.id, e.target.checked)}
                      />
                    </td>
                    <td>{pkg.code || `PK${index + 1}`}</td>
                    <td>
                      <div className="line-clamp-3" title={pkg.name} style={{ maxWidth: 360 }}>
                        {pkg.name}
                      </div>
                    </td>
                    <td>{getProductName(pkg.productId)}</td>
                    <td>{formatWarrantyPeriod(pkg.warrantyPeriod)}</td>
                    <td>{formatPrice(pkg.costPrice)}</td>
                    <td>{formatPrice(pkg.ctvPrice)}</td>
                    <td>{formatPrice(pkg.retailPrice)}</td>
                    <td>
                      <div className="d-flex gap-2">
                        <button
                          onClick={() => handleEdit(pkg)}
                          className="btn btn-secondary btn-sm"
                        >
                          Sửa
                        </button>
                        {canDeletePackage(pkg) ? (
                          <button
                            onClick={() => handleDelete(pkg.id)}
                            className="btn btn-danger btn-sm"
                          >
                            Xóa
                          </button>
                        ) : (
                          <span
                            className="badge bg-light text-dark align-self-center"
                            title={getUsageLabel(pkg)}
                            style={{ cursor: 'not-allowed' }}
                          >
                            Đang dùng
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
        <PackageForm
          key={editingPackage?.id || 'new'}
          package={editingPackage}
          onClose={() => {
            setShowForm(false);
            setEditingPackage(null);
          }}
          onSuccess={handleFormSubmit}
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

export default PackageList;

