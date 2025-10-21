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
  let reconnectTimeout: NodeJS.Timeout | null = null;
  let isReconnecting = false;
  let healthCheckInterval: NodeJS.Timeout | null = null;

  type PostgresChange = { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new?: any; old?: any };
  const handleRow = (table: string, payload: PostgresChange) => {
    try {
      console.log(`[Realtime] ${table} ${payload.eventType}:`, payload);
      const newRow = payload.new ? reviveDates(toCamel(payload.new)) : undefined;
      const oldRow = payload.old ? reviveDates(toCamel(payload.old)) : undefined;
    switch (table) {
      case 'products': {
        const items = Database.getProducts();
        if (payload.eventType === 'INSERT') {
          // Avoid duplicates
          if (!items.some(x => x.id === newRow.id)) {
            Database.setProducts([...items, newRow]);
          }
        } else if (payload.eventType === 'UPDATE') {
          Database.setProducts(items.map(x => x.id === newRow.id ? newRow : x));
        } else if (payload.eventType === 'DELETE') {
          Database.setProducts(items.filter(x => x.id !== (oldRow?.id || payload.old?.id)));
        }
        break;
      }
      case 'packages': {
        const items = Database.getPackages();
        if (payload.eventType === 'INSERT') {
          if (!items.some(x => x.id === newRow.id)) {
            Database.setPackages([...items, newRow]);
          }
        } else if (payload.eventType === 'UPDATE') {
          Database.setPackages(items.map(x => x.id === newRow.id ? newRow : x));
        } else if (payload.eventType === 'DELETE') {
          Database.setPackages(items.filter(x => x.id !== (oldRow?.id || payload.old?.id)));
        }
        break;
      }
      case 'customers': {
        const items = Database.getCustomers();
        if (payload.eventType === 'INSERT') {
          if (!items.some(x => x.id === newRow.id)) {
            Database.setCustomers([...items, newRow]);
          }
        } else if (payload.eventType === 'UPDATE') {
          Database.setCustomers(items.map(x => x.id === newRow.id ? newRow : x));
        } else if (payload.eventType === 'DELETE') {
          Database.setCustomers(items.filter(x => x.id !== (oldRow?.id || payload.old?.id)));
        }
        break;
      }
      case 'employees': {
        const items = Database.getEmployees();
        if (payload.eventType === 'INSERT') {
          if (!items.some(x => x.id === newRow.id)) {
            Database.setEmployees([...items, newRow]);
          }
        } else if (payload.eventType === 'UPDATE') {
          Database.setEmployees(items.map(x => x.id === newRow.id ? newRow : x));
        } else if (payload.eventType === 'DELETE') {
          Database.setEmployees(items.filter(x => x.id !== (oldRow?.id || payload.old?.id)));
        }
        break;
      }
      case 'orders': {
        const items = Database.getOrders();
        if (payload.eventType === 'INSERT') {
          if (!items.some(x => x.id === newRow.id)) {
            Database.setOrders([...items, newRow]);
          }
        } else if (payload.eventType === 'UPDATE') {
          Database.setOrders(items.map(x => x.id === newRow.id ? newRow : x));
        } else if (payload.eventType === 'DELETE') {
          Database.setOrders(items.filter(x => x.id !== (oldRow?.id || payload.old?.id)));
        }
        break;
      }
      case 'inventory': {
        const items = Database.getInventory();
        if (payload.eventType === 'INSERT') {
          if (!items.some(x => x.id === newRow.id)) {
            Database.setInventory([...items, newRow]);
          }
        } else if (payload.eventType === 'UPDATE') {
          Database.setInventory(items.map(x => x.id === newRow.id ? newRow : x));
          try {
            // Propagate inventory changes to linked orders so orderInfo stays in sync
            Database.refreshOrdersForInventory(newRow.id);
          } catch {}
        } else if (payload.eventType === 'DELETE') {
          Database.setInventory(items.filter(x => x.id !== (oldRow?.id || payload.old?.id)));
        }
        break;
      }
      case 'warranties': {
        const items = Database.getWarranties();
        if (payload.eventType === 'INSERT') {
          if (!items.some(x => x.id === newRow.id)) {
            Database.setWarranties([...items, newRow]);
          }
        } else if (payload.eventType === 'UPDATE') {
          Database.setWarranties(items.map(x => x.id === newRow.id ? newRow : x));
        } else if (payload.eventType === 'DELETE') {
          Database.setWarranties(items.filter(x => x.id !== (oldRow?.id || payload.old?.id)));
        }
        break;
      }
      case 'activity_logs': {
        const items = Database.getActivityLogs();
        if (payload.eventType === 'INSERT') {
          if (!items.some(x => x.id === newRow.id)) {
            Database.setActivityLogs([...items, newRow]);
          }
        } else if (payload.eventType === 'UPDATE') {
          Database.setActivityLogs(items.map(x => x.id === newRow.id ? newRow : x));
        } else if (payload.eventType === 'DELETE') {
          Database.setActivityLogs(items.filter(x => x.id !== (oldRow?.id || payload.old?.id)));
        }
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
    } catch (error) {
      console.error(`[Realtime] Error handling ${table} change:`, error);
    }
  };

  TABLES.forEach((table) => {
    const ch = sb
      .channel(`realtime:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (payload: any) => handleRow(table, payload as PostgresChange))
      .on('system', {}, (status) => {
        console.log(`[Realtime] ${table} channel status:`, status);
        if (status === 'CHANNEL_ERROR') {
          console.error(`[Realtime] Channel error for ${table}, attempting to reconnect...`);
          if (!isReconnecting) {
            isReconnecting = true;
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            reconnectTimeout = setTimeout(async () => {
              try {
                console.log(`[Realtime] Refreshing all data after channel error...`);
                const { hydrateAllFromSupabase } = await import('./supabaseSync');
                await hydrateAllFromSupabase();
                console.log(`[Realtime] Data refresh completed`);
              } catch (e) {
                console.error(`[Realtime] Failed to refresh data:`, e);
              } finally {
                isReconnecting = false;
              }
            }, 1000);
          }
        }
      })
      .subscribe((status) => {
        console.log(`[Realtime] ${table} subscription status:`, status);
      });
    channels.push(ch);
  });

  // Periodic health check every 30 seconds
  healthCheckInterval = setInterval(async () => {
    try {
      // Test connection by making a simple query
      const { data, error } = await sb.from('products').select('id').limit(1);
      if (error) {
        console.warn('[Realtime] Health check failed, connection may be unstable');
        // Don't auto-reconnect here, let the error handlers do it
      } else {
        console.log('[Realtime] Health check passed');
      }
    } catch (e) {
      console.warn('[Realtime] Health check error:', e);
    }
  }, 30000);

  return () => {
    try { 
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (healthCheckInterval) clearInterval(healthCheckInterval);
      channels.forEach(c => c.unsubscribe()); 
    } catch {}
  };
}


