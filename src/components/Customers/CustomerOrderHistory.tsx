import React, { useState, useEffect } from 'react';
import { Customer, Order, ProductPackage, Product, ORDER_STATUSES, PAYMENT_STATUSES } from '../../types';
import OrderDetailsModal from '../Orders/OrderDetailsModal';
import { Database } from '../../utils/database';
import { getSupabase } from '../../utils/supabaseClient';

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
      <div className="modal-content" style={{ maxWidth: '1000px', width: '95%' }}>
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
          <div className="table-responsive" style={{ overflowX: 'visible' }}>
            <table className="table" style={{ tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Mã đơn hàng</th>
                  <th style={{ width: '80px', minWidth: '80px', maxWidth: '100px' }}>Ngày mua</th>
                  <th style={{ width: '120px', minWidth: '120px', maxWidth: '150px' }}>Sản phẩm</th>
                  <th style={{ width: '120px', minWidth: '120px', maxWidth: '150px' }}>Gói</th>
                  <th style={{ width: '80px', minWidth: '80px', maxWidth: '100px' }}>Ngày hết hạn</th>
                  <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Trạng thái</th>
                  <th style={{ width: '80px', minWidth: '80px', maxWidth: '100px' }}>Thanh toán</th>
                  <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Giá</th>
                  <th style={{ width: '120px', minWidth: '120px', maxWidth: '150px' }}>Ghi chú</th>
                  <th style={{ width: '80px', minWidth: '80px', maxWidth: '100px' }}>Thao tác</th>
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
        getPackageInfo={getPackageInfo as any}
        getStatusLabel={getStatusLabel as any}
        getPaymentLabel={(val: any) => PAYMENT_STATUSES.find(p => p.value === val)?.label || 'Chưa thanh toán'}
        formatDate={formatDate}
      />
    )}
    </>
  );
};

export default CustomerOrderHistory;

