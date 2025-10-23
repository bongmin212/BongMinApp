import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  try {
    const url = (process.env.REACT_APP_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) as string | undefined;
    const anon = (process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string | undefined;
    if (!url || !anon) {
      if (typeof window !== 'undefined') {
        console.warn('[Supabase] Missing env vars REACT_APP_SUPABASE_URL/ANON_KEY');
      }
      return null;
    }
    if (cached) return cached;
    cached = createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return cached;
  } catch (e) {
    console.error('[Supabase] createClient failed', e);
    return null;
  }
}

export function requireSupabase(): SupabaseClient {
  const client = getSupabase();
  if (!client) {
    throw new Error('Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY');
  }
  return client;
}

export const supabase: SupabaseClient | null = getSupabase();

// Function to cleanup orphaned employees (employees without auth users)
export async function cleanupOrphanedEmployees() {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: 'Supabase not configured' };
  
  try {
    // Function removed - no longer available after rollback
    console.warn('[Cleanup] cleanup_orphaned_employees function no longer available');
    return { ok: false, message: 'Function no longer available' };
  } catch (e) {
    console.error('[Cleanup] Error:', e);
    return { ok: false, message: 'Cleanup failed' };
  }
}

