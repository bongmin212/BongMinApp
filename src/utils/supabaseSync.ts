import { getSupabase } from './supabaseClient';
import { Database } from './database';
import { ActivityLog, Customer, Employee, Expense, InventoryItem, Order, Product, ProductPackage, Warranty } from '../types';

// Debug logging helper: disabled in production builds
const debugLog = (...args: any[]) => {
  if (process.env.NODE_ENV !== 'production') console.log(...args);
};

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

// Special mapping for expenses table
export function toSnakeExpense(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const out: any = { ...obj };
  
  // No special mapping needed - use standard camelCase to snake_case conversion
  // The 'date' field should map to 'date' column in Supabase
  
  // Convert camelCase to snake_case for all fields
  const snakeOut: any = {};
  Object.keys(out).forEach(k => {
    const sk = k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    snakeOut[sk] = out[k];
  });
  
  return snakeOut;
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
    { name: 'expenses', setter: (rows: Expense[]) => Database.setExpenses(rows) },
  ];

  for (const t of tables) {
    try {
      const { data, error } = await sb.from(t.name).select('*');
      if (error) throw error;
      const rows = (data || []).map((d: any) => reviveDates(toCamel(d)));
      debugLog(`[SupabaseSync] hydrating ${t.name}:`, rows.length, 'items');
      (t.setter as any)(rows);
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
    // Normalize payload: convert Dates to ISO strings and drop non-UUID ids to allow DB defaults
    const normalized = (() => {
      const clone: any = Array.isArray(payload) ? payload.map((x: any) => ({ ...x })) : { ...payload };

      const coerce = (obj: any) => {
        if (!obj || typeof obj !== 'object') return obj;
        Object.keys(obj).forEach((k) => {
          const v = obj[k];
          if (v instanceof Date) {
            obj[k] = v.toISOString();
          } else if (v && typeof v === 'object' && !Array.isArray(v)) {
            coerce(v);
          }
        });
        return obj;
      };

      const coerceId = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        const looksLikeUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(val || ''));
        if (Object.prototype.hasOwnProperty.call(obj, 'id')) {
          const idVal = obj.id;
          if (idVal && typeof idVal === 'string' && !looksLikeUuid(idVal)) {
            // Let DB generate UUID if our local id isn't a UUID
            delete obj.id;
          }
        }
      };

      if (Array.isArray(clone)) {
        clone.forEach((item) => { coerce(item); coerceId(item); });
      } else {
        coerce(clone);
        coerceId(clone);
      }
      return clone;
    })();

    const snake = table === 'expenses' ? toSnakeExpense(normalized) : toSnake(normalized);
    debugLog(`[SupabaseSync] mirrorInsert ${table}:`, snake);
    const { data, error } = await sb.from(table).insert(snake);
    if (error) {
      console.error(`[SupabaseSync] mirrorInsert ${table} error:`, error);
      throw error;
    }
    debugLog(`[SupabaseSync] mirrorInsert ${table} success:`, data);
  } catch (e: any) {
    const message = e?.message || e?.error || String(e);
    console.warn('[SupabaseSync] mirrorInsert failed', { table, message, payloadKeys: Object.keys(payload || {}) });
    throw e; // Re-throw to let caller handle the error
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


