import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  try {
    const url = process.env.REACT_APP_SUPABASE_URL;
    const anon = process.env.REACT_APP_SUPABASE_ANON_KEY;
    if (!url || !anon) return null;
    if (cached) return cached;
    cached = createClient(url, anon, {
      auth: {
        persistSession: false
      }
    });
    return cached;
  } catch {
    return null;
  }
}


