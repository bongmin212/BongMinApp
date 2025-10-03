import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  try {
    const url = process.env.REACT_APP_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL as any;
    const anon = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as any;
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
  } catch {
    return null;
  }
}


