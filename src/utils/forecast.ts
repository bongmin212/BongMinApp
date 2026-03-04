/**
 * forecast.ts — Simple Predictive Analytics utility
 * Algorithm: Ordinary Least Squares (OLS) Linear Regression
 * Purpose: Forecast revenue for the next N days based on historical daily data.
 * No external dependencies required.
 */

export interface DailyPoint {
    /** YYYY-MM-DD */
    date: string;
    revenue: number;
}

/**
 * Formats a Date to YYYY-MM-DD string in local time.
 */
function toDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Adds `n` days to a Date (returns a new Date).
 */
function addDays(d: Date, n: number): Date {
    const result = new Date(d);
    result.setDate(result.getDate() + n);
    return result;
}

/**
 * OLS Linear Regression: fits y = a + b*x where x is the day index (0, 1, 2, ...).
 * Returns slope `b` and intercept `a`.
 */
function ols(y: number[]): { a: number; b: number } {
    const n = y.length;
    if (n === 0) return { a: 0, b: 0 };
    if (n === 1) return { a: y[0], b: 0 };

    const sumX = (n * (n - 1)) / 2;
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
    const sumY = y.reduce((acc, v) => acc + v, 0);
    const sumXY = y.reduce((acc, v, i) => acc + i * v, 0);

    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return { a: sumY / n, b: 0 };

    const b = (n * sumXY - sumX * sumY) / denom;
    const a = (sumY - b * sumX) / n;
    return { a, b };
}

/**
 * Generates `days` forecast points after the last date in `history`
 * using OLS Linear Regression over the provided history.
 *
 * @param history  Sorted array of historical daily revenue points (ascending by date).
 * @param days     Number of future days to forecast (e.g. 7).
 * @returns        Array of DailyPoint with predicted revenue (floored at 0).
 */
export function linearRegressionForecast(
    history: DailyPoint[],
    days: number
): DailyPoint[] {
    if (history.length < 2 || days <= 0) return [];

    const revenues = history.map(p => p.revenue);
    const { a, b } = ols(revenues);
    const n = history.length;

    const lastDate = new Date(history[history.length - 1].date);
    const result: DailyPoint[] = [];

    for (let i = 1; i <= days; i++) {
        const futureDate = addDays(lastDate, i);
        const predicted = a + b * (n - 1 + i);
        result.push({
            date: toDateKey(futureDate),
            revenue: Math.max(0, Math.round(predicted)),
        });
    }

    return result;
}

export { toDateKey, addDays };
