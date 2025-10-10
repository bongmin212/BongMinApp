import React, { useState, useEffect } from 'react';
import { ActivityLog, Employee, Order, Customer, Product, ProductPackage, ORDER_STATUSES, WARRANTY_STATUSES, InventoryItem, Warranty } from '../../types';
import { getSupabase } from '../../utils/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { exportToXlsx, generateExportFilename } from '../../utils/excel';

const ActivityLogList: React.FC = () => {
  const { isManager, state } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [warranties, setWarranties] = useState<Warranty[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  // Initialize from URL (no localStorage)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q') || '';
      const emp = params.get('emp') || '';
      const p = parseInt(params.get('page') || '1', 10);
      const l = parseInt((params.get('limit') || '20'), 10);
      setSearchTerm(q);
      setDebouncedSearchTerm(q);
      setSelectedEmployee(emp);
      setPage(!Number.isNaN(p) && p > 0 ? p : 1);
      if (!Number.isNaN(l) && l > 0) setLimit(l);
    } catch {}
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Reset page on filter changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchTerm, selectedEmployee]);

  // No localStorage persistence

  // Sync URL
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (debouncedSearchTerm) params.set('q', debouncedSearchTerm); else params.delete('q');
      if (selectedEmployee) params.set('emp', selectedEmployee); else params.delete('emp');
      params.set('page', String(page));
      params.set('limit', String(limit));
      const s = params.toString();
      const url = `${window.location.pathname}${s ? `?${s}` : ''}`;
      window.history.replaceState(null, '', url);
    } catch {}
  }, [debouncedSearchTerm, selectedEmployee, page, limit]);

  const loadData = async () => {
    const sb = getSupabase();
    if (!sb) return;
    const [logsRes, empRes, ordersRes, customersRes, productsRes, packagesRes, invRes, warrantiesRes] = await Promise.all([
      sb.from('activity_logs').select('*'),
      sb.from('employees').select('*'),
      sb.from('orders').select('*'),
      sb.from('customers').select('*'),
      sb.from('products').select('*'),
      sb.from('packages').select('*'),
      sb.from('inventory').select('*'),
      sb.from('warranties').select('*')
    ]);

    const allLogs = (logsRes.data || []).map((r: any) => ({
      id: r.id,
      employeeId: r.employee_id || r.employeeId,
      action: r.action,
      details: r.details || undefined,
      timestamp: r.timestamp ? new Date(r.timestamp) : new Date()
    })) as ActivityLog[];
    const allEmployees = (empRes.data || []).map((r: any) => ({
      id: r.id,
      code: r.code,
      username: r.username || r.email || r.id,
      passwordHash: '',
      role: String(r.role || '').toUpperCase() === 'MANAGER' ? 'MANAGER' : 'EMPLOYEE',
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
    })) as Employee[];
    const allOrders = (ordersRes.data || []).map((r: any) => ({
      ...r,
      purchaseDate: r.purchase_date ? new Date(r.purchase_date) : new Date(r.purchaseDate),
      expiryDate: r.expiry_date ? new Date(r.expiry_date) : new Date(r.expiryDate),
      createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt: r.updated_at ? new Date(r.updated_at) : new Date()
    })) as Order[];
    const allCustomers = (customersRes.data || []) as Customer[];
    const allProducts = (productsRes.data || []) as Product[];
    const allPackages = (packagesRes.data || []) as ProductPackage[];
    const allInventory = (invRes.data || []).map((i: any) => ({
      ...i,
      purchaseDate: i.purchase_date ? new Date(i.purchase_date) : new Date(i.purchaseDate),
      expiryDate: i.expiry_date ? new Date(i.expiry_date) : new Date(i.expiryDate),
      createdAt: i.created_at ? new Date(i.created_at) : new Date(),
      updatedAt: i.updated_at ? new Date(i.updated_at) : new Date()
    })) as InventoryItem[];
    const allWarranties = (warrantiesRes.data || []).map((w: any) => ({
      id: w.id,
      code: w.code,
      createdAt: w.created_at ? new Date(w.created_at) : new Date(),
      updatedAt: w.updated_at ? new Date(w.updated_at) : new Date(),
      orderId: w.order_id || w.orderId,
      reason: w.reason,
      status: (w.status || 'PENDING').toUpperCase(),
      createdBy: w.created_by || w.createdBy,
      replacementInventoryId: w.replacement_inventory_id || w.replacementInventoryId,
      newOrderInfo: w.new_order_info || w.newOrderInfo
    })) as Warranty[];

    const sortedLogs = allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    setLogs(sortedLogs);
    try {
      if (state?.user && !allEmployees.some(e => e.id === state.user!.id)) {
        allEmployees.push({ ...state.user });
      }
    } catch {}
    setEmployees(allEmployees);
    setOrders(allOrders);
    setCustomers(allCustomers);
    setProducts(allProducts);
    setPackages(allPackages);
    setInventory(allInventory);
    setWarranties(allWarranties);
  };

  // Realtime updates for activity logs
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const channel = sb
      .channel('realtime:activity_logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, () => {
        loadData();
      })
      .subscribe();
    return () => { try { channel.unsubscribe(); } catch {} };
  }, []);

  const getEmployeeName = (employeeId: string) => {
    const employee = employees.find(e => e.id === employeeId);
    if (employee) return employee.username;
    if (state?.user && state.user.id === employeeId) return state.user.username;
    return 'Không xác định';
  };

  const formatDateTime = (date: Date) => {
    return new Date(date).toLocaleString('vi-VN');
  };

  const statusLabelMap = [...ORDER_STATUSES, ...WARRANTY_STATUSES].reduce<Record<string, string>>((acc, cur) => {
    acc[cur.value] = cur.label;
    return acc;
  }, {});

  const parseDetails = (details?: string): Record<string, string> => {
    if (!details) return {};
    return details
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .reduce<Record<string, string>>((acc, part) => {
        const [k, v] = part.split('=');
        if (k && v) acc[k.trim()] = v.trim();
        return acc;
      }, {});
  };

  const getPackageById = (id?: string) => packages.find((p) => p.id === id);
  const getProductById = (id?: string) => products.find((p) => p.id === id);
  const getOrderById = (id?: string) => orders.find((o) => o.id === id);
  const getCustomerById = (id?: string) => customers.find((c) => c.id === id);
  const getEmployeeById = (id?: string) => employees.find((e) => e.id === id);
  const getInventoryById = (id?: string) => inventory.find((i) => i.id === id);
  const getWarrantyById = (id?: string) => warranties.find((w) => w.id === id);

  const renderFriendlyDetails = (log: ActivityLog) => {
    const kv = parseDetails(log.details);
    const actionLower = String(log.action || '').toLowerCase();

    const order = getOrderById(kv.orderId);
    const pkg = getPackageById(order?.packageId || kv.packageId);
    const product = getProductById(pkg?.productId || kv.productId);
    const customer = getCustomerById(order?.customerId || kv.customerId);
    const employee = getEmployeeById(kv.employeeId);
    const inventoryItem = getInventoryById(kv.inventoryId || kv.inventoryItemId || kv.replacementInventoryId);
    const warranty = getWarrantyById(kv.warrantyId);

    const parts: string[] = [];

    if (order || kv.orderCode) {
      const code = kv.orderCode || order?.code;
      if (code) parts.push(`Đơn ${code}`);
    }
    if (warranty || kv.warrantyCode) {
      const wcode = kv.warrantyCode || warranty?.code;
      if (wcode) parts.push(`Đơn bảo hành ${wcode}`);
    }
    if (actionLower.includes('tạo gói sản phẩm') && product && pkg) {
      parts.push(`Sản phẩm ${product.name}`);
      parts.push(`Gói sản phẩm ${pkg.name}`);
    } else {
      if (pkg) {
        parts.push(`Gói ${pkg.name}`);
      }
      if (product) {
        parts.push(`Sản phẩm ${product.name}`);
      }
    }
    // Some actions only include ids (e.g., delete employee/product/package)
    if (!order && !pkg && !product) {
      if (kv.packageId) {
        const p2 = getPackageById(kv.packageId);
        if (p2) parts.push(`Gói ${p2.name}`);
      }
      if (kv.productId) {
        const pr2 = getProductById(kv.productId);
        if (pr2) parts.push(`Sản phẩm ${pr2.name}`);
      }
    }
    // prefer embedded name if provided to keep showing after deletion
    // Explicit entity-specific names first
    if (kv.productName) {
      parts.push(`Sản phẩm ${kv.productName}`);
    } else if (kv.packageName) {
      parts.push(`Gói ${kv.packageName}`);
    } else if (kv.customerName) {
      parts.push(`Khách ${kv.customerName}`);
    } else if (kv.name) {
      // Fallback: infer label from action text when only `name=` is present
      if (actionLower.includes('sản phẩm')) parts.push(`Sản phẩm ${kv.name}`);
      else if (actionLower.includes('gói')) parts.push(`Gói sản phẩm ${kv.name}`);
      else if (actionLower.includes('kho')) parts.push(`Kho ${kv.name}`);
      else parts.push(`Khách ${kv.name}`);
    } else if (customer) {
      parts.push(`Khách ${customer.name}`);
    }
    if (employee) {
      parts.push(`Nhân viên ${employee.username}`);
    }
    if (inventoryItem) {
      parts.push(`Kho ${inventoryItem.code}`);
    }
    if (kv.status) {
      parts.push(`Trạng thái: ${statusLabelMap[kv.status] || kv.status}`);
    }
    if (kv.paymentStatus) {
      parts.push(`Thanh toán: ${kv.paymentStatus}`);
    }

    // Render field diffs if present in details like key=old->new
    const diffs: string[] = [];
    Object.entries(kv).forEach(([key, value]) => {
      if (key === 'orderId' || key === 'packageId' || key === 'customerId' || key === 'status' || key === 'paymentStatus') return;
      const arrowIndex = value.indexOf('->');
      if (arrowIndex > -1) {
        const beforeVal = value.slice(0, arrowIndex);
        const afterVal = value.slice(arrowIndex + 2);
        // Friendly labels for common fields
        const labelMap: Record<string, string> = {
          purchaseDate: 'Ngày mua',
          expiryDate: 'Hết hạn',
          orderInfo: 'Thông tin đơn',
          notes: 'Ghi chú',
          inventoryItemId: 'Liên kết kho',
          inventoryId: 'Liên kết kho',
          replacementInventoryId: 'Kho thay thế',
          warrantyId: 'Đơn bảo hành',
          customerId: 'Khách hàng',
          packageId: 'Gói',
          productId: 'Sản phẩm',
          status: 'Trạng thái',
          paymentStatus: 'Thanh toán'
        };

        let beforeText = beforeVal;
        let afterText = afterVal;

        if (key === 'customerId') {
          beforeText = getCustomerById(beforeVal)?.name || beforeVal || '-';
          afterText = getCustomerById(afterVal)?.name || afterVal || '-';
        }
        if (key === 'packageId') {
          beforeText = getPackageById(beforeVal)?.name || beforeVal || '-';
          afterText = getPackageById(afterVal)?.name || afterVal || '-';
        }
        if (key === 'status') {
          beforeText = statusLabelMap[beforeVal] || beforeVal;
          afterText = statusLabelMap[afterVal] || afterVal;
        }
        if (key === 'productId') {
          beforeText = getProductById(beforeVal)?.name || beforeVal || '-';
          afterText = getProductById(afterVal)?.name || afterVal || '-';
        }
        if (key === 'inventoryItemId' || key === 'inventoryId' || key === 'replacementInventoryId') {
          beforeText = getInventoryById(beforeVal)?.code || (beforeVal ? beforeVal.slice(-6) : '-');
          afterText = getInventoryById(afterVal)?.code || (afterVal ? afterVal.slice(-6) : '-');
        }
        if (key === 'warrantyId') {
          beforeText = getWarrantyById(beforeVal)?.code || (beforeVal ? beforeVal.slice(-6) : '-');
          afterText = getWarrantyById(afterVal)?.code || (afterVal ? afterVal.slice(-6) : '-');
        }

        diffs.push(`${labelMap[key] || key}: ${beforeText} → ${afterText}`);
      }
    });

    if (diffs.length) {
      parts.push(`Thay đổi: ${diffs.join(' • ')}`);
    }

    // Provide simpler summaries for certain actions with minimal keys
    if (parts.length === 0) {
      // Normalize inventory id keys
      if (kv.inventoryItemId || kv.inventoryId || kv.replacementInventoryId) {
        const invId = kv.inventoryItemId || kv.inventoryId || kv.replacementInventoryId;
        const inv = getInventoryById(invId);
        const prodName = getProductById(kv.productId || '')?.name;
        const pkgName = getPackageById(kv.packageId || '')?.name;
        const info = [prodName && `Sản phẩm ${prodName}`, pkgName && `Gói ${pkgName}`, kv.productInfo && `Thông tin: ${kv.productInfo}`]
          .filter(Boolean)
          .join(' • ');
        return `Kho ${inv?.code || (invId ? invId.slice(-6) : '-')}${info ? ' • ' + info : ''}`;
      }
      if (kv.warrantyId || kv.warrantyCode) {
        const w = kv.warrantyId ? getWarrantyById(kv.warrantyId) : undefined;
        const wcode = kv.warrantyCode || w?.code;
        return `Đơn bảo hành ${wcode || (kv.warrantyId ? kv.warrantyId.slice(-6) : '-')}`;
      }
      return log.details || '-';
    }
    return parts.join(' • ');
  };

  const filteredLogs = logs.filter(log => {
    const employeeName = getEmployeeName(log.employeeId).toLowerCase();
    const matchesSearch = 
      employeeName.includes(debouncedSearchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      (log.details && log.details.toLowerCase().includes(debouncedSearchTerm.toLowerCase()));
    
    const matchesEmployee = !selectedEmployee || log.employeeId === selectedEmployee;
    
    return matchesSearch && matchesEmployee;
  });

  const total = filteredLogs.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;
  const pageItems = filteredLogs.slice(start, start + limit);

  const exportLogsXlsx = (items: ActivityLog[], filename: string) => {
    const rows = items.map((log) => ({
      timestamp: new Date(log.timestamp).toLocaleString('vi-VN'),
      employee: getEmployeeName(log.employeeId),
      action: log.action,
      details: renderFriendlyDetails(log)
    }));
    exportToXlsx(rows, [
      { header: 'Thời gian', key: 'timestamp', width: 22 },
      { header: 'Nhân viên', key: 'employee', width: 18 },
      { header: 'Hành động', key: 'action', width: 28 },
      { header: 'Chi tiết', key: 'details', width: 60 },
    ], filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, 'Hoạt động');
  };

  const resetFilters = () => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setSelectedEmployee('');
    setPage(1);
  };

  if (!isManager()) {
    return (
      <div className="card">
        <div className="alert alert-danger">
          <h4>Không có quyền truy cập</h4>
          <p>Chỉ tài khoản quản lý mới có thể xem lịch sử hoạt động.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="d-flex justify-content-between align-items-center">
          <h2 className="card-title">Lịch sử hoạt động</h2>
        </div>
      </div>

      <div className="mb-3">
        <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <div>
            <input
              type="text"
              className="form-control"
              placeholder="Tìm kiếm hoạt động..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <select
              className="form-control"
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
            >
              <option value="">Tất cả nhân viên</option>
              {employees.map(employee => (
                <option key={employee.id} value={employee.id}>
                  {employee.username}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="d-flex gap-2">
              <button className="btn btn-light" onClick={() => {
                const filename = generateExportFilename('NhatKyHoatDong', {
                  debouncedSearchTerm,
                  selectedEmployee: selectedEmployee ? employees.find(e => e.id === selectedEmployee)?.username : ''
                }, 'TrangHienTai');
                exportLogsXlsx(pageItems, filename);
              }}>Xuất Excel (trang hiện tại)</button>
              <button className="btn btn-light" onClick={() => {
                const filename = generateExportFilename('NhatKyHoatDong', {
                  debouncedSearchTerm,
                  selectedEmployee: selectedEmployee ? employees.find(e => e.id === selectedEmployee)?.username : ''
                }, 'KetQuaLoc');
                exportLogsXlsx(filteredLogs, filename);
              }}>Xuất Excel (kết quả đã lọc)</button>
            </div>
          </div>
          <div>
            <button className="btn btn-light w-100" onClick={resetFilters}>Reset bộ lọc</button>
          </div>
        </div>
      </div>

      {pageItems.length === 0 ? (
        <div className="text-center py-4">
          <p>Không có hoạt động nào</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Nhân viên</th>
                <th>Hành động</th>
                <th>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(log => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.timestamp)}</td>
                  <td>{getEmployeeName(log.employeeId)}</td>
                  <td>{log.action}</td>
                  <td>{renderFriendlyDetails(log)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mt-3">
        <div>
          <select className="form-control" style={{ width: 100 }} value={limit} onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-light" disabled={currentPage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>«</button>
          <span>Trang {currentPage} / {totalPages}</span>
          <button className="btn btn-light" disabled={currentPage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>»</button>
        </div>
        <div>
          <small className="text-muted">Hiển thị {pageItems.length}/{total} mục</small>
        </div>
      </div>
    </div>
  );
};

export default ActivityLogList;

