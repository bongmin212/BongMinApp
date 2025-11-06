import { getSupabase } from './supabaseClient';
import { hydrateAllFromSupabase } from './supabaseSync';

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
  'expenses',
  'notifications'
];

export function subscribeRealtime(): Unsubscribe {
  const sb = getSupabase();
  if (!sb) return () => {};

  const channel = sb.channel('realtime:all');

  TABLES.forEach((table) => {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      async () => {
        try {
          await hydrateAllFromSupabase();
        } catch {}
      }
    );
  });

  channel.subscribe();

  return () => {
    try { channel.unsubscribe(); } catch {}
  };
}