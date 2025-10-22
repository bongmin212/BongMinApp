import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';
import { formatCurrencyVND, kiloFormat } from '../../utils/money';

export interface TrendsPoint {
  key: string; // YYYY-MM
  revenue: number;
  profit: number;
  expenses: number;
}

interface TrendsChartProps {
  data: TrendsPoint[];
  showRevenue?: boolean;
  showProfit?: boolean;
  showExpenses?: boolean;
}

const TrendsChart: React.FC<TrendsChartProps> = ({ data, showRevenue = true, showProfit = true, showExpenses = true }) => {
  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8884d8" stopOpacity={0.35}/>
              <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="pro" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.35}/>
              <stop offset="95%" stopColor="#82ca9d" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ff7300" stopOpacity={0.35}/>
              <stop offset="95%" stopColor="#ff7300" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="key" />
          <YAxis tickFormatter={kiloFormat} />
          <Tooltip formatter={(v: any) => formatCurrencyVND(Number(v))} />
          <Legend />
          {showRevenue && (
            <Area type="monotone" dataKey="revenue" name="Doanh thu" stroke="#8884d8" fillOpacity={1} fill="url(#rev)" />
          )}
          {showProfit && (
            <Area type="monotone" dataKey="profit" name="Lãi" stroke="#82ca9d" fillOpacity={1} fill="url(#pro)" />
          )}
          {showExpenses && (
            <Area type="monotone" dataKey="expenses" name="Chi phí" stroke="#ff7300" fillOpacity={1} fill="url(#exp)" />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TrendsChart;


