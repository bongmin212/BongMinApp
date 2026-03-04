import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { formatCurrencyVND, kiloFormat } from '../../utils/money';

export interface TrendsPoint {
  key: string; // YYYY-MM
  revenue: number;
  profit: number;
  expenses: number;
}

/** A combined point used in the forecast chart */
export interface ForecastPoint {
  /** YYYY-MM-DD */
  date: string;
  /** Actual daily revenue (undefined for pure forecast points) */
  actual?: number;
  /** Forecasted revenue (undefined for historical points) */
  forecast?: number;
}

interface TrendsChartProps {
  data: TrendsPoint[];
  showRevenue?: boolean;
  showProfit?: boolean;
  showExpenses?: boolean;
  /** Daily actual + forecast data for the predictive analytics chart */
  forecastData?: ForecastPoint[];
  showForecast?: boolean;
}

// Custom tooltip for the forecast chart
const ForecastTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{
      background: 'var(--bg-primary, #fff)',
      border: '1px solid var(--border-color, #e5e7eb)',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 13,
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary, #111)' }}>{label}</div>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} style={{ color: entry.color, display: 'flex', gap: 8 }}>
          <span>{entry.name}:</span>
          <span style={{ fontWeight: 600 }}>{formatCurrencyVND(Number(entry.value))}</span>
        </div>
      ))}
    </div>
  );
};

const TrendsChart: React.FC<TrendsChartProps> = ({
  data,
  showRevenue = true,
  showProfit = true,
  showExpenses = true,
  forecastData,
  showForecast = false,
}) => {
  // Find the split date where actual ends and forecast begins
  const splitDate = forecastData
    ? forecastData.find(p => p.forecast !== undefined && p.actual === undefined)?.date
    : undefined;

  return (
    <>
      {/* Existing 12-month area chart */}
      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8884d8" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="pro" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ff7300" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#ff7300" stopOpacity={0} />
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

      {/* Forecast chart — only rendered when forecastData is provided */}
      {showForecast && forecastData && forecastData.length > 0 && (
        <div style={{ marginTop: 24 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary, #111)' }}>
              📈 Dự báo doanh thu 7 ngày tới
            </span>
            <span style={{
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 20,
              letterSpacing: '0.3px',
            }}>
              ⚙️ Linear Regression
            </span>
            <span style={{
              background: 'rgba(245, 166, 35, 0.12)',
              color: '#b7851e',
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 20,
              border: '1px solid rgba(245, 166, 35, 0.35)',
            }}>
              Inventory Planning
            </span>
          </div>

          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={forecastData} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => {
                    const d = new Date(v);
                    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
                  }}
                />
                <YAxis tickFormatter={kiloFormat} tick={{ fontSize: 11 }} />
                <Tooltip content={<ForecastTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {/* Vertical reference line at the boundary between actual and forecast */}
                {splitDate && (
                  <ReferenceLine
                    x={splitDate}
                    stroke="#aaa"
                    strokeDasharray="4 3"
                    label={{ value: 'Hôm nay', position: 'insideTopLeft', fontSize: 11, fill: '#888' }}
                  />
                )}
                {/* Actual revenue — solid line */}
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Thực tế"
                  stroke="#8884d8"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#8884d8' }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
                {/* Forecast revenue — dashed orange line */}
                <Line
                  type="monotone"
                  dataKey="forecast"
                  name="Dự báo"
                  stroke="#f5a623"
                  strokeWidth={2.5}
                  strokeDasharray="6 3"
                  dot={{ r: 4, fill: '#f5a623', strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#f5a623' }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{
            marginTop: 8,
            fontSize: 11,
            color: 'var(--text-secondary, #888)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span>💡</span>
            <span>Dự báo dựa trên xu hướng 30 ngày gần nhất. Chỉ mang tính tham khảo cho kế hoạch nhập kho.</span>
          </div>
        </div>
      )}

      {/* Empty state for forecast */}
      {showForecast && (!forecastData || forecastData.length === 0) && (
        <div style={{
          marginTop: 24,
          padding: '24px 16px',
          textAlign: 'center',
          color: 'var(--text-secondary, #888)',
          background: 'var(--bg-secondary, #f9fafb)',
          borderRadius: 8,
          border: '1px dashed var(--border-color, #e5e7eb)',
          fontSize: 13,
        }}>
          📊 Không đủ dữ liệu để dự báo. Cần ít nhất 2 ngày có doanh thu trong 30 ngày qua.
        </div>
      )}
    </>
  );
};

export default TrendsChart;
