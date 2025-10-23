// DISABLED REALTIME TO REDUCE CONSOLE NOISE
// import { getSupabase } from './supabaseClient';
// import { Database } from './database';
// import { reviveDates, toCamel } from './supabaseSync';

type Unsubscribe = () => void;

// Debug logging helper: disabled in production builds
const debugLog = (...args: any[]) => {
  if (process.env.NODE_ENV !== 'production') console.log(...args);
};

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
  // REALTIME IS DISABLED - return empty unsubscribe function
  console.log('[Realtime] Realtime is disabled to reduce console noise');
  return () => {};
}