import React from 'react';
import { Customer } from '../../types';
import { formatCurrencyVND } from '../../utils/money';

export interface CustomerAggRow {
  customerId: string;
  name: string;
  code: string;
  type: string;
  revenue: number;
  profit: number;
  orders: number;
}

interface TopCustomersTableProps {
  rows: CustomerAggRow[];
  customersById: Record<string, Customer>;
}

const TopCustomersTable: React.FC<TopCustomersTableProps> = ({ rows, customersById }) => {
  const top = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <h3 className="card-title">Top khách hàng theo doanh thu</h3>
      </div>
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Khách hàng</th>
              <th>Loại</th>
              <th>Đơn</th>
              <th>Doanh thu</th>
              <th>Lãi</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r) => {
              const customer = customersById[r.customerId];
              return (
                <tr key={r.customerId}>
                  <td>
                    <div>
                      <div>{r.name}</div>
                      <small className="text-muted">{r.code}</small>
                    </div>
                  </td>
                  <td>
                    <span className={`customer-type ${r.type === 'CTV' ? 'customer-ctv' : 'customer-retail'}`}>
                      {r.type === 'CTV' ? 'Cộng tác viên' : 'Khách lẻ'}
                    </span>
                  </td>
                  <td>{r.orders}</td>
                  <td>{formatCurrencyVND(r.revenue)}</td>
                  <td>{formatCurrencyVND(r.profit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TopCustomersTable;
