import React, { useState, useEffect } from 'react';
import { Customer, Order, ProductPackage, Product, ORDER_STATUSES, PAYMENT_STATUSES } from '../../types';
import OrderDetailsModal from '../Orders/OrderDetailsModal';
import { Database } from '../../utils/database';
import { getSupabase } from '../../utils/supabaseClient';
import { useToast } from '../../contexts/ToastContext';

interface CustomerOrderHistoryProps {
  customer: Customer;
  onClose: () => void;
}

const CustomerOrderHistory: React.FC<CustomerOrderHistoryProps> = ({ customer, onClose }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const { notify } = useToast();
  const [renewState, setRenewState] = useState<null | {
    order: Order;
    packageId: string;
    useCustomPrice: boolean;
    customPrice: number;
    note: string;
    paymentStatus: any;
    markMessageSent: boolean;
    useCustomExpiry: boolean;
    customExpiryDate?: Date;
  }>(null);

  useEffect(() => {
    loadData();
  }, [customer.id]);

  const loadData = async () => {
    const sb = getSupabase();
    if (!sb) return;
    
    const [ordersRes, packagesRes, productsRes, inventoryRes] = await Promise.all([
      sb.from('orders').select('*').eq('customer_id', customer.id),
      sb.from('packages').select('*'),
      sb.from('products').select('*'),
      sb.from('inventory').select('*')
    ]);
    
    const allOrders = (ordersRes.data || []).map((r: any) => ({
      id: r.id,
      code: r.code,
      customerId: r.customer_id,
      packageId: r.package_id,
      status: r.status,
      paymentStatus: r.payment_status,
      orderInfo: r.order_info,
      notes: r.notes,
      createdBy: r.created_by || 'system',
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
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
    })) as Order[];
    
    const allPackages = (packagesRes.data || []).map((r: any) => ({
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
    
    const allProducts = (productsRes.data || []).map((r: any) => ({
      ...r,
      sharedInventoryPool: r.shared_inventory_pool || r.sharedInventoryPool,
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
    })) as Product[];
    
    setOrders(allOrders);
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

  const customerCode = customer.code || 'KH001';

  const getPackageInfo = (packageId: string) => {
    const pkg = packages.find(p => p.id === packageId);
    if (!pkg) return null;
    
    const product = products.find(p => p.id === pkg.productId);
    return {
      package: pkg,
      product: product
    };
  };

  const getStatusLabel = (status: string) => {
    return ORDER_STATUSES.find(s => s.value === status)?.label || status;
  };

  const getStatusClass = (status: string) => {
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

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('vi-VN');
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(price);
  };

  const getOrderPrice = (order: Order) => {
    const packageInfo = getPackageInfo(order.packageId);
    if (!packageInfo) return 0;
    // Respect custom price if set
    if (order.useCustomPrice && typeof order.customPrice === 'number' && order.customPrice > 0) {
      return order.customPrice;
    }
    return customer.type === 'CTV'
      ? packageInfo.package.ctvPrice
      : packageInfo.package.retailPrice;
  };

  const getTotalSpent = () => {
    return orders
      .filter(order => order.status === 'COMPLETED')
      .reduce((total, order) => {
        return total + getOrderPrice(order);
      }, 0);
  };

  const getCompletedOrdersCount = () => {
    return orders.filter(order => order.status === 'COMPLETED').length;
  };

  const buildFullOrderInfo = (order: Order): { lines: string[]; text: string } => {
    let baseLines = String((order as any).orderInfo || '')
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
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
    // Filter out unwanted info lines (internal-only): any Slot: ...
    baseLines = baseLines.filter(line => {
      const normalized = line.toLowerCase();
      if (normalized.startsWith('slot:')) return false; // e.g., "Slot: Slot 1" or "Slot: 1/5"
      return true;
    });
    const text = baseLines.join('\n');
    return { lines: baseLines, text };
  };

  return (
    <>
    <div className="modal">
      <div className="modal-content" style={{ maxWidth: '1400px', width: '95%' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            Lịch sử đơn hàng - {customer.name}
          </h3>
          <button
            type="button"
            className="close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="mb-3">
          <div className="row">
            <div className="col-md-6">
              <strong>Thông tin khách hàng:</strong>
              <div style={{ display: 'grid', rowGap: 8, marginTop: 6 }}>
                <div><strong>Mã KH:</strong> {customerCode}</div>
                <div>
                  <span className={`customer-type ${customer.type === 'CTV' ? 'customer-ctv' : 'customer-retail'}`}>
                    {customer.type === 'CTV' ? 'Cộng Tác Viên' : 'Khách Lẻ'}
                  </span>
                </div>
                {customer.phone && <div><strong>SĐT:</strong> {customer.phone}</div>}
                {customer.email && <div><strong>Email:</strong> {customer.email}</div>}
                {customer.source && (
                  <div><strong>Nguồn:</strong> {(() => {
                    const map: any = { FACEBOOK: 'Facebook', TELEGRAM: 'Telegram', PAGE: 'Page', WEB: 'Web', ZALO: 'Zalo' };
                    return map[customer.source] || customer.source;
                  })()}</div>
                )}
                {customer.sourceDetail && <div><strong>Chi tiết nguồn:</strong> {customer.sourceDetail}</div>}
                {customer.notes && <div><strong>Ghi chú KH:</strong> {customer.notes}</div>}
              </div>
            </div>
            <div className="col-md-6">
              <strong>Thống kê:</strong>
              <div>Tổng đơn hàng: {orders.length}</div>
              <div>Đơn hoàn thành: {getCompletedOrdersCount()}</div>
              <div>Tổng chi tiêu: {formatPrice(getTotalSpent())}</div>
            </div>
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-4">
            <p>Khách hàng chưa có đơn hàng nào</p>
          </div>
        ) : (
          <>
          {/* Mobile cards */}
          <div className="customer-mobile">
            {orders.map((order, index) => {
              const packageInfo = getPackageInfo(order.packageId);
              if (!packageInfo) return null;
              return (
                <div key={order.id} className="customer-card">
                  <div className="customer-card-header">
                    <div className="customer-card-title">{order.code || `#${index + 1}`}</div>
                    <div className="customer-card-subtitle">{formatDate(order.purchaseDate)}</div>
                  </div>
                  <div className="customer-card-row">
                    <div className="customer-card-label">Sản phẩm</div>
                    <div className="customer-card-value">{packageInfo.product?.name || 'Không xác định'}</div>
                  </div>
                  <div className="customer-card-row">
                    <div className="customer-card-label">Gói</div>
                    <div className="customer-card-value">{packageInfo.package.name}</div>
                  </div>
                  <div className="customer-card-row">
                    <div className="customer-card-label">Hết hạn</div>
                    <div className="customer-card-value">{formatDate(order.expiryDate)}</div>
                  </div>
                  <div className="customer-card-row">
                    <div className="customer-card-label">Trạng thái</div>
                    <div className="customer-card-value"><span className={`status-badge ${getStatusClass(order.status)}`}>{getStatusLabel(order.status)}</span></div>
                  </div>
                  <div className="customer-card-row">
                    <div className="customer-card-label">Thanh toán</div>
                    <div className="customer-card-value"><span className="status-badge">{(() => {
                      const paymentStatus = (order as any).paymentStatus;
                      if (!paymentStatus) return 'Chưa TT';
                      switch (paymentStatus) {
                        case 'PAID': return 'Đã TT';
                        case 'REFUNDED': return 'Hoàn';
                        case 'UNPAID':
                        default: return 'Chưa TT';
                      }
                    })()}</span></div>
                  </div>
                  <div className="customer-card-row">
                    <div className="customer-card-label">Giá</div>
                    <div className="customer-card-value">{formatPrice(getOrderPrice(order))}</div>
                  </div>
                  {(order.notes && String(order.notes).trim()) ? (
                    <div className="customer-card-row">
                      <div className="customer-card-label">Ghi chú</div>
                      <div className="customer-card-value">{String(order.notes)}</div>
                    </div>
                  ) : null}
                  <div className="customer-card-actions">
                    <button onClick={() => setViewingOrder(order)} className="btn btn-light">Xem</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="table-responsive customer-table" style={{ overflowX: 'auto' }}>
            <table className="table" style={{ tableLayout: 'fixed', minWidth: '1200px' }}>
              <thead>
                <tr>
                  <th style={{ width: '120px' }}>Mã đơn hàng</th>
                  <th style={{ width: '100px' }}>Ngày mua</th>
                  <th style={{ width: '180px' }}>Sản phẩm</th>
                  <th style={{ width: '120px' }}>Gói</th>
                  <th style={{ width: '100px' }}>Ngày hết hạn</th>
                  <th style={{ width: '120px' }}>Trạng thái</th>
                  <th style={{ width: '100px' }}>Thanh toán</th>
                  <th style={{ width: '120px' }}>Giá</th>
                  <th style={{ width: '180px' }}>Ghi chú</th>
                  <th style={{ width: '100px' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order, index) => {
                  const packageInfo = getPackageInfo(order.packageId);
                  if (!packageInfo) return null;

                  const cellStyle: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle' };

                  return (
                    <tr key={order.id}>
                      <td style={cellStyle}>{order.code || `#${index + 1}`}</td>
                      <td style={cellStyle}>{formatDate(order.purchaseDate)}</td>
                      <td style={cellStyle}>{packageInfo.product?.name || 'Không xác định'}</td>
                      <td style={cellStyle}>{packageInfo.package.name}</td>
                      <td style={cellStyle}>{formatDate(order.expiryDate)}</td>
                      <td style={cellStyle}>
                        <span className={`status-badge ${getStatusClass(order.status)}`}>
                          {getStatusLabel(order.status)}
                        </span>
                      </td>
                      <td style={cellStyle}>
                        <span className={`status-badge ${(() => {
                          const paymentStatus = (order as any).paymentStatus;
                          if (!paymentStatus) return 'status-processing';
                          switch (paymentStatus) {
                            case 'PAID': return 'status-completed';
                            case 'REFUNDED': return 'status-cancelled';
                            case 'UNPAID':
                            default: return 'status-processing';
                          }
                        })()}`}>
                          {(() => {
                            const paymentStatus = (order as any).paymentStatus;
                            if (!paymentStatus) return 'Chưa TT';
                            switch (paymentStatus) {
                              case 'PAID': return 'Đã TT';
                              case 'REFUNDED': return 'Hoàn';
                              case 'UNPAID':
                              default: return 'Chưa TT';
                            }
                          })()}
                        </span>
                      </td>
                      <td style={cellStyle}>{formatPrice(getOrderPrice(order))}</td>
                      <td style={cellStyle}>{order.notes || '-'}</td>
                      <td style={cellStyle}>
                        <button
                          onClick={() => setViewingOrder(order)}
                          className="btn btn-light"
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          Xem
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}

        <div className="d-flex justify-content-end mt-3">
          <button
            onClick={onClose}
            className="btn btn-secondary"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
    {!!viewingOrder && (
      <OrderDetailsModal
        order={viewingOrder}
        onClose={() => setViewingOrder(null)}
        inventory={inventory}
        products={products}
        packages={packages}
        getCustomerName={() => customer.name}
        getCustomerCode={() => customer.code || ''}
        getPackageInfo={getPackageInfo as any}
        getStatusLabel={getStatusLabel as any}
        getPaymentLabel={(val: any) => PAYMENT_STATUSES.find(p => p.value === val)?.label || 'Chưa thanh toán'}
        formatDate={formatDate}
        formatPrice={formatPrice}
        onOpenRenew={() => {
          setRenewState({
            order: viewingOrder,
            packageId: viewingOrder.packageId,
            useCustomPrice: false,
            customPrice: 0,
            note: '',
            paymentStatus: (viewingOrder as any).paymentStatus || 'UNPAID',
            markMessageSent: !!(viewingOrder as any).renewalMessageSent,
            useCustomExpiry: false,
            customExpiryDate: undefined
          });
        }}
        onCopyInfo={async () => {
          const o = viewingOrder;
          const customerName = customer.name;
          const pkgInfo = getPackageInfo(o.packageId);
          const productName = pkgInfo?.product?.name || 'Không xác định';
          const packageName = pkgInfo?.package?.name || 'Không xác định';
          const statusLabel = getStatusLabel(o.status);
          const paymentLabel = (PAYMENT_STATUSES.find(p => p.value === (o as any).paymentStatus)?.label) || 'Chưa thanh toán';
          const purchaseDate = new Date(o.purchaseDate).toLocaleDateString('vi-VN');
          const expiryDate = new Date(o.expiryDate).toLocaleDateString('vi-VN');
          const price = getOrderPrice(o);
          const out: string[] = [];
          out.push('═══════════════════════════════════════');
          out.push('📋 THÔNG TIN ĐƠN HÀNG');
          out.push('═══════════════════════════════════════');
          out.push('');
          out.push(`Mã đơn hàng: ${o.code || '-'}`);
          out.push(`Khách hàng: ${customerName}`);
          out.push(`Sản phẩm: ${productName}`);
          out.push(`Gói: ${packageName}`);
          out.push(`Ngày mua: ${purchaseDate}`);
          out.push(`Ngày hết hạn: ${expiryDate}`);
          out.push(`Trạng thái: ${statusLabel}`);
          out.push(`Thanh toán: ${paymentLabel}`);
          out.push(`Giá: ${formatPrice(price)}`);
          const inv = (() => {
            if ((o as any).inventoryItemId) {
              const found = inventory.find((i: any) => i.id === (o as any).inventoryItemId);
              if (found) return found;
            }
            const byLinked = inventory.find((i: any) => i.linked_order_id === o.id);
            if (byLinked) return byLinked;
            return inventory.find((i: any) => i.is_account_based && (i.profiles || []).some((p: any) => p.assignedOrderId === o.id));
          })();
          if (inv) {
            const packageInfo = packages.find(p => p.id === inv.packageId);
            const accountColumns = (packageInfo as any)?.accountColumns || inv.accountColumns || [];
            const displayColumns = accountColumns.filter((col: any) => col.includeInOrderInfo);
            if (displayColumns.length > 0) {
              out.push('');
              out.push('─────────────────────────────────────');
              out.push('🔐 THÔNG TIN TÀI KHOẢN');
              out.push('─────────────────────────────────────');
              out.push('');
              displayColumns.forEach((col: any) => {
                const value = (inv.accountData || {})[col.id] || '';
                if (String(value).trim()) {
                  out.push(`📌 ${col.title}:`);
                  out.push(`   ${String(value)}`);
                  out.push('');
                }
              });
            }
          }
          const customFieldValues = (o as any).customFieldValues || {};
          if (pkgInfo?.package?.customFields && Object.keys(customFieldValues).length > 0) {
            out.push('');
            out.push('─────────────────────────────────────');
            out.push('📝 TRƯỜNG TÙY CHỈNH');
            out.push('─────────────────────────────────────');
            out.push('');
            (pkgInfo.package.customFields as any[]).forEach((cf: any) => {
              const value = customFieldValues[cf.id];
              if (value && String(value).trim()) {
                out.push(`📌 ${cf.title}:`);
                out.push(`   ${String(value).trim()}`);
                out.push('');
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
      />
    )}

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
              const months = Math.max(1, (pkg as any)?.warrantyPeriod || 1);
              const preview = (() => {
                if (renewState.useCustomExpiry && renewState.customExpiryDate) {
                  return new Date(renewState.customExpiryDate);
                }
                const d = new Date(base);
                d.setMonth(d.getMonth() + months);
                return d;
              })();
              const defaultPrice = customer.type === 'CTV' ? ((pkg as any)?.ctvPrice || 0) : ((pkg as any)?.retailPrice || 0);
              const price = renewState.useCustomPrice ? (renewState.customPrice || 0) : defaultPrice;
              return (
                <div className="p-2">
                  <div><strong>Mã đơn:</strong> {o.code}</div>
                  <div><strong>Khách hàng:</strong> {customer.name} ({customer.code || ''})</div>
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
                            const currentExpiry = new Date(o.expiryDate);
                            const base = currentExpiry > new Date() ? currentExpiry : new Date();
                            const pkg = getPackageInfo(renewState.packageId)?.package;
                            const months = Math.max(1, (pkg as any)?.warrantyPeriod || 1);
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
                      onChange={(e) => setRenewState(prev => prev ? { ...prev, paymentStatus: e.target.value as any } : prev)}
                    >
                      {PAYMENT_STATUSES.map(p => (
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
                              setOrders(prev => prev.map(o => o.id === renewState.order.id ? { ...o, renewalMessageSent: true, renewalMessageSentAt: new Date(), renewalMessageSentBy: 'system' } as any : o));
                            } else {
                              await sb.from('orders').update({
                                renewal_message_sent: false,
                                renewal_message_sent_at: null,
                                renewal_message_sent_by: null
                              }).eq('id', renewState.order.id);
                              setOrders(prev => prev.map(o => o.id === renewState.order.id ? { ...o, renewalMessageSent: false, renewalMessageSentAt: undefined, renewalMessageSentBy: undefined } as any : o));
                            }
                          } else {
                            try {
                              if (checked) {
                                Database.updateOrder(renewState.order.id, { renewalMessageSent: true, renewalMessageSentAt: new Date(), renewalMessageSentBy: 'system' } as any);
                              } else {
                                Database.updateOrder(renewState.order.id, { renewalMessageSent: false, renewalMessageSentAt: undefined, renewalMessageSentBy: undefined } as any);
                              }
                            } catch {}
                          }
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
              className="btn btn-primary"
              onClick={async () => {
                if (!renewState) return;
                const o = renewState.order;
                const updated = Database.renewOrder(o.id, renewState.packageId, {
                  note: renewState.note,
                  paymentStatus: renewState.paymentStatus,
                  createdBy: 'system',
                  useCustomPrice: renewState.useCustomPrice,
                  customPrice: renewState.customPrice,
                  useCustomExpiry: renewState.useCustomExpiry,
                  customExpiryDate: renewState.customExpiryDate
                });
                if (updated) {
                  setRenewState(null);
                  setViewingOrder(updated);
                  await loadData();
                  notify('Gia hạn đơn hàng thành công', 'success');
                } else {
                  notify('Không thể gia hạn đơn hàng', 'error');
                }
              }}
            >
              Xác nhận gia hạn
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default CustomerOrderHistory;

