import React from 'react';
import { ProductPackage } from '../../types';
import { formatCurrencyVND } from '../../utils/money';

export interface PackageAggRow {
  packageId: string;
  name: string;
  revenue: number;
  profit: number;
  orders: number;
}

interface TopPackagesTableProps {
  rows: PackageAggRow[];
  packagesById: Record<string, ProductPackage>;
}

const TopPackagesTable: React.FC<TopPackagesTableProps> = ({ rows, packagesById }) => {
  const top = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <h3 className="card-title">Top gói theo doanh thu</h3>
      </div>
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Gói</th>
              <th>Đơn</th>
              <th>Doanh thu</th>
              <th>Lãi</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r) => {
              const pkg = packagesById[r.packageId];
              return (
                <tr key={r.packageId}>
                  <td>{pkg?.name || r.name}</td>
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

export default TopPackagesTable;


