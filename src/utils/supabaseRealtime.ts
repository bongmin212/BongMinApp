// DISABLED REALTIME TO REDUCE CONSOLE NOISE
// import { getSupabase } from './supabaseClient';
// import { Database } from './database';
// import { reviveDates, toCamel } from './supabaseSync';

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
  // REALTIME IS DISABLED - return empty unsubscribe function
  // Realtime is disabled to reduce console noise
  return () => {};
}