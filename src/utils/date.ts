export function startOfMonth(d: Date): Date {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(d: Date): Date {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

export function toMonthKey(d: Date): string {
  const x = new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const y = x.getFullYear();
  return `${y}-${m}`;
}

export function rangeMonths(from: Date, to: Date): Date[] {
  const res: Date[] = [];
  let cur = startOfMonth(from);
  const end = startOfMonth(to);
  while (cur <= end) {
    res.push(new Date(cur));
    cur = addMonths(cur, 1);
  }
  return res;
}


