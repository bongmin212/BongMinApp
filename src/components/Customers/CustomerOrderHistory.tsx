import React, { useState, useEffect } from 'react';
import { Customer, Order, ProductPackage, Product, ORDER_STATUSES, PAYMENT_STATUSES } from '../../types';
import { Database } from '../../utils/database';

interface CustomerOrderHistoryProps {
  customer: Customer;
  onClose: () => void;
}

const CustomerOrderHistory: React.FC<CustomerOrderHistoryProps> = ({ customer, onClose }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);

  useEffect(() => {
    loadData();
  }, [customer.id]);

  const loadData = () => {
    const customerOrders = Database.getOrdersByCustomer(customer.id);
    const allPackages = Database.getPackages();
    const allProducts = Database.getProducts();
    
    setOrders(customerOrders);
    setPackages(allPackages);
    setProducts(allProducts);
  };

  const customerCode = (() => {
    const idx = Database.getCustomers().findIndex(c => c.id === customer.id);
    return `KH${idx + 1}`;
  })();

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

  const getTotalSpent = () => {
    return orders
      .filter(order => order.status === 'COMPLETED')
      .reduce((total, order) => {
        const packageInfo = getPackageInfo(order.packageId);
        if (packageInfo) {
          const price = customer.type === 'CTV' 
            ? packageInfo.package.ctvPrice 
            : packageInfo.package.retailPrice;
          return total + price;
        }
        return total;
      }, 0);
  };

  const getCompletedOrdersCount = () => {
    return orders.filter(order => order.status === 'COMPLETED').length;
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
                  <th style={{ width: 120 }}>Mã đơn hàng</th>
                  <th style={{ width: 120 }}>Ngày mua</th>
                  <th>Sản phẩm</th>
                  <th style={{ width: 160 }}>Gói</th>
                  <th style={{ width: 130 }}>Ngày hết hạn</th>
                  <th style={{ width: 140 }}>Trạng thái</th>
                  <th style={{ width: 120 }}>Giá</th>
                  <th>Ghi chú</th>
                  <th style={{ width: 90 }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order, index) => {
                  const packageInfo = getPackageInfo(order.packageId);
                  if (!packageInfo) return null;

                  const price = customer.type === 'CTV' 
                    ? packageInfo.package.ctvPrice 
                    : packageInfo.package.retailPrice;

                  const cellStyle: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle' };

                  return (
                    <tr key={order.id}>
                      <td style={cellStyle}>#{index + 1}</td>
                      <td style={cellStyle}>{formatDate(order.purchaseDate)}</td>
                      <td style={cellStyle}>{packageInfo.product?.name || 'Không xác định'}</td>
                      <td style={cellStyle}>{packageInfo.package.name}</td>
                      <td style={cellStyle}>{formatDate(order.expiryDate)}</td>
                      <td style={cellStyle}>
                        <span className={`status-badge ${getStatusClass(order.status)}`}>
                          {getStatusLabel(order.status)}
                        </span>
                      </td>
                      <td style={cellStyle}>{formatPrice(price)}</td>
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
      <div className="modal">
        <div className="modal-content" style={{ maxWidth: '640px' }}>
          <div className="modal-header">
            <h3 className="modal-title">Chi tiết đơn hàng</h3>
            <button type="button" className="close" onClick={() => setViewingOrder(null)}>×</button>
          </div>
          <div className="mb-3">
            <div><strong>Khách hàng:</strong> {customer.name}</div>
            <div><strong>Sản phẩm:</strong> {getPackageInfo(viewingOrder!.packageId)?.product?.name || 'Không xác định'}</div>
            <div><strong>Gói:</strong> {getPackageInfo(viewingOrder!.packageId)?.package?.name || 'Không xác định'}</div>
            <div><strong>Ngày mua:</strong> {formatDate(viewingOrder!.purchaseDate)}</div>
            <div><strong>Ngày hết hạn:</strong> {formatDate(viewingOrder!.expiryDate)}</div>
            <div><strong>Trạng thái:</strong> {getStatusLabel(viewingOrder!.status)}</div>
            <div><strong>Thanh toán:</strong> {PAYMENT_STATUSES.find(p => p.value === (viewingOrder as any).paymentStatus)?.label || 'Chưa thanh toán'}</div>
            {(viewingOrder as any).orderInfo && (
              <div><strong>Thông tin đơn hàng:</strong> {(viewingOrder as any).orderInfo}</div>
            )}
            <div>
              <strong>Kho hàng:</strong>{' '}
              {(() => {
                const inv = (() => {
                  if (viewingOrder!.inventoryItemId) {
                    return Database.getInventory().find(i => i.id === viewingOrder!.inventoryItemId);
                  }
                  return Database.getInventory().find(i => i.linkedOrderId === viewingOrder!.id);
                })();
                if (!inv) return 'Không liên kết';
                const code = inv!.code ?? '';
                const pDate = new Date(inv!.purchaseDate).toLocaleDateString('vi-VN');
                const eDate = new Date(inv!.expiryDate).toLocaleDateString('vi-VN');
                const status = inv!.status;
                const statusLabel =
                  status === 'SOLD' ? 'Đã bán' :
                  status === 'AVAILABLE' ? 'Có sẵn' :
                  status === 'RESERVED' ? 'Đã giữ' :
                  status === 'EXPIRED' ? 'Hết hạn' : status;
                const header = `${code || 'Không có'} | Nhập: ${pDate} | HSD: ${eDate} | ${statusLabel}`;
                const extra: string[] = [];
                if (inv!.productInfo) extra.push(`| Thông tin sản phẩm: ${inv!.productInfo}`);
                if (inv!.sourceNote) extra.push(`Nguồn: ${inv!.sourceNote}`);
                if (typeof inv!.purchasePrice === 'number') extra.push(`| Giá nhập: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(inv!.purchasePrice as number)}`);
                return [header, ...extra].join(' \n ');
              })()}
            </div>
            {viewingOrder!.notes && <div><strong>Ghi chú:</strong> {viewingOrder!.notes}</div>}
            {(() => {
              const list = Database.getWarrantiesByOrder(viewingOrder!.id);
              return (
                <div style={{ marginTop: '12px' }}>
                  <strong>Lịch sử bảo hành:</strong>
                  {list.length === 0 ? (
                    <div>Chưa có</div>
                  ) : (
                    <ul style={{ paddingLeft: '18px', marginTop: '6px' }}>
                      {list.map(w => (
                        <li key={w.id}>
                          {new Date(w.createdAt).toLocaleDateString('vi-VN')} - {w.reason} ({w.status === 'DONE' ? 'đã xong' : 'chưa xong'})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}
          </div>
          <div className="d-flex justify-content-end gap-2">
            <button className="btn btn-secondary" onClick={() => setViewingOrder(null)}>Đóng</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default CustomerOrderHistory;

