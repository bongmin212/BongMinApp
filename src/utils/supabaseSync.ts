import { getSupabase } from './supabaseClient';
import { Database } from './database';
import { ActivityLog, Customer, Employee, Expense, InventoryItem, Order, Product, ProductPackage, Warranty } from '../types';

// snake_case <-> camelCase mapping helpers
export function toCamel<T = any>(row: any): T {
  if (!row || typeof row !== 'object') return row;
  const out: any = Array.isArray(row) ? [] : {};
  Object.keys(row).forEach(k => {
    const ck = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[ck] = row[k];
  });
  return out as T;
}

export function toSnake<T = any>(obj: any): T {
  if (!obj || typeof obj !== 'object') return obj;
  const out: any = Array.isArray(obj) ? [] : {};
  Object.keys(obj).forEach(k => {
    const sk = k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    out[sk] = obj[k];
  });
  return out as T;
}

export function reviveDates<T = any>(x: T): T {
  const out: any = { ...x };
  if (out.createdAt) out.createdAt = new Date(out.createdAt);
  if (out.updatedAt) out.updatedAt = new Date(out.updatedAt);
  // common date fields on domain objects
  if ((out as any).purchaseDate) (out as any).purchaseDate = new Date((out as any).purchaseDate);
  if ((out as any).expiryDate) (out as any).expiryDate = new Date((out as any).expiryDate);
  if ((out as any).timestamp) (out as any).timestamp = new Date((out as any).timestamp);
  if ((out as any).date) (out as any).date = new Date((out as any).date);
  return out as T;
}

export async function hydrateAllFromSupabase(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const tables = [
    { name: 'products', setter: (rows: Product[]) => Database.setProducts(rows) },
    { name: 'packages', setter: (rows: ProductPackage[]) => Database.setPackages(rows) },
    { name: 'customers', setter: (rows: Customer[]) => Database.setCustomers(rows) },
    { name: 'employees', setter: (rows: Employee[]) => Database.setEmployees(rows) },
    { name: 'orders', setter: (rows: Order[]) => Database.setOrders(rows) },
    { name: 'inventory', setter: (rows: InventoryItem[]) => Database.setInventory(rows) },
    { name: 'warranties', setter: (rows: Warranty[]) => Database.setWarranties(rows) },
    { name: 'expenses', setter: (rows: Expense[]) => Database.setActivityLogs as any }, // placeholder; expenses handled separately below
  ];

  for (const t of tables) {
    try {
      const { data, error } = await sb.from(t.name).select('*');
      if (error) throw error;
      const rows = (data || []).map((d: any) => reviveDates(toCamel(d)));
      // special-case expenses setter not available in Database; load via direct localStorage write pattern used there
      if (t.name === 'expenses') {
        // reuse Database API shapes
        const key = 'bongmin_expenses';
        localStorage.setItem(key, JSON.stringify(rows));
      } else {
        (t.setter as any)(rows);
      }
    } catch (e) {
      console.warn('[SupabaseSync] hydrate table failed:', t.name, e);
    }
  }

  // Activity logs (read-only for hydration)
  try {
    const { data, error } = await sb.from('activity_logs').select('*').order('timestamp', { ascending: true });
    if (error) throw error;
    const rows = (data || []).map((d: any) => reviveDates(toCamel<ActivityLog>(d)));
    Database.setActivityLogs(rows);
  } catch (e) {
    console.warn('[SupabaseSync] hydrate activity_logs failed', e);
  }
}

// Mirror write helpers (best-effort; do not throw)
export async function mirrorInsert(table: string, payload: any): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const snake = toSnake(payload);
    await sb.from(table).insert(snake);
  } catch (e) {
    console.warn('[SupabaseSync] mirrorInsert failed', table, e);
  }
}

export async function mirrorUpdate(table: string, id: string, updates: any): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const snake = toSnake(updates);
    await sb.from(table).update(snake).eq('id', id);
  } catch (e) {
    console.warn('[SupabaseSync] mirrorUpdate failed', table, e);
  }
}

export async function mirrorDelete(table: string, id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from(table).delete().eq('id', id);
  } catch (e) {
    console.warn('[SupabaseSync] mirrorDelete failed', table, e);
  }
}

export async function mirrorActivityLog(payload: Omit<ActivityLog, 'id' | 'timestamp'> & { id?: string; timestamp?: Date }): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const toSend = { ...payload } as any;
    if (toSend.timestamp instanceof Date) toSend.timestamp = toSend.timestamp.toISOString();
    await sb.from('activity_logs').insert(toSnake(toSend));
  } catch (e) {
    console.warn('[SupabaseSync] mirrorActivityLog failed', e);
  }
}


