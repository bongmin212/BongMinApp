import { getSupabase } from './supabaseClient';
import { Database } from './database';
import { reviveDates, toCamel } from './supabaseSync';

type Unsubscribe = () => void;

const TABLES = [
  'products',
  'packages',
  'customers',
  'employees',
  'orders',
  'inventory',
  'warranties',
  'activity_logs',
  'expenses'
];

export function subscribeRealtime(): Unsubscribe {
  const sb = getSupabase();
  if (!sb) return () => {};

  const channels: { unsubscribe: () => void }[] = [];

  type PostgresChange = { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new?: any; old?: any };
  const handleRow = (table: string, payload: PostgresChange) => {
    const newRow = payload.new ? reviveDates(toCamel(payload.new)) : undefined;
    const oldRow = payload.old ? reviveDates(toCamel(payload.old)) : undefined;
    switch (table) {
      case 'products': {
        const items = Database.getProducts();
        if (payload.eventType === 'INSERT') Database.setProducts([...items, newRow]);
        else if (payload.eventType === 'UPDATE') Database.setProducts(items.map(x => x.id === newRow.id ? newRow : x));
        else if (payload.eventType === 'DELETE') Database.setProducts(items.filter(x => x.id !== (oldRow?.id || payload.old?.id)));
        break;
      }
      case 'packages': {
        const items = Database.getPackages();
        if (payload.eventType === 'INSERT') Database.setPackages([...items, newRow]);
        else if (payload.eventType === 'UPDATE') Database.setPackages(items.map(x => x.id === newRow.id ? newRow : x));
        else if (payload.eventType === 'DELETE') Database.setPackages(items.filter(x => x.id !== (oldRow?.id || payload.old?.id)));
        break;
      }
      case 'customers': {
        const items = Database.getCustomers();
        if (payload.eventType === 'INSERT') Database.setCustomers([...items, newRow]);
        else if (payload.eventType === 'UPDATE') Database.setCustomers(items.map(x => x.id === newRow.id ? newRow : x));
        else if (payload.eventType === 'DELETE') Database.setCustomers(items.filter(x => x.id !== (oldRow?.id || payload.old?.id)));
        break;
      }
      case 'employees': {
        const items = Database.getEmployees();
        if (payload.eventType === 'INSERT') Database.setEmployees([...items, newRow]);
        else if (payload.eventType === 'UPDATE') Database.setEmployees(items.map(x => x.id === newRow.id ? newRow : x));
        else if (payload.eventType === 'DELETE') Database.setEmployees(items.filter(x => x.id !== (oldRow?.id || payload.old?.id)));
        break;
      }
      case 'orders': {
        const items = Database.getOrders();
        if (payload.eventType === 'INSERT') Database.setOrders([...items, newRow]);
        else if (payload.eventType === 'UPDATE') Database.setOrders(items.map(x => x.id === newRow.id ? newRow : x));
        else if (payload.eventType === 'DELETE') Database.setOrders(items.filter(x => x.id !== (oldRow?.id || payload.old?.id)));
        break;
      }
      case 'inventory': {
        const items = Database.getInventory();
        if (payload.eventType === 'INSERT') Database.setInventory([...items, newRow]);
        else if (payload.eventType === 'UPDATE') Database.setInventory(items.map(x => x.id === newRow.id ? newRow : x));
        else if (payload.eventType === 'DELETE') Database.setInventory(items.filter(x => x.id !== (oldRow?.id || payload.old?.id)));
        break;
      }
      case 'warranties': {
        const items = Database.getWarranties();
        if (payload.eventType === 'INSERT') Database.setWarranties([...items, newRow]);
        else if (payload.eventType === 'UPDATE') Database.setWarranties(items.map(x => x.id === newRow.id ? newRow : x));
        else if (payload.eventType === 'DELETE') Database.setWarranties(items.filter(x => x.id !== (oldRow?.id || payload.old?.id)));
        break;
      }
      case 'activity_logs': {
        const items = Database.getActivityLogs();
        if (payload.eventType === 'INSERT') Database.setActivityLogs([...items, newRow]);
        else if (payload.eventType === 'UPDATE') Database.setActivityLogs(items.map(x => x.id === newRow.id ? newRow : x));
        else if (payload.eventType === 'DELETE') Database.setActivityLogs(items.filter(x => x.id !== (oldRow?.id || payload.old?.id)));
        break;
      }
      case 'expenses': {
        // expenses stored via localStorage operations in Database
        try {
          const key = 'bongmin_expenses';
          const items: any[] = JSON.parse(localStorage.getItem(key) || '[]');
          if (payload.eventType === 'INSERT') localStorage.setItem(key, JSON.stringify([...items, newRow]));
          else if (payload.eventType === 'UPDATE') localStorage.setItem(key, JSON.stringify(items.map(x => x.id === newRow.id ? newRow : x)));
          else if (payload.eventType === 'DELETE') localStorage.setItem(key, JSON.stringify(items.filter(x => x.id !== (oldRow?.id || payload.old?.id))));
        } catch {}
        break;
      }
      default:
        break;
    }
  };

  TABLES.forEach((table) => {
    const ch = sb
      .channel(`realtime:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (payload: any) => handleRow(table, payload as PostgresChange))
      .subscribe();
    channels.push(ch);
  });

  return () => {
    try { channels.forEach(c => c.unsubscribe()); } catch {}
  };
}


