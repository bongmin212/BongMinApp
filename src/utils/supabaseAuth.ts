import { getSupabase } from './supabaseClient';
import { Employee } from '../types';

export type SupabaseSignInResult =
  | { ok: true; sessionToken: string; user: Employee }
  | { ok: false; message?: string };

function normalizeRole(rawRole: any): 'MANAGER' | 'EMPLOYEE' {
  const v = String(rawRole || '').toLowerCase().trim();
  if (v === 'manager' || v === 'quanly' || v === 'quản lý' || v === 'admin') return 'MANAGER';
  if (v === 'employee' || v === 'nhanvien' || v === 'nhân viên' || v === 'staff') return 'EMPLOYEE';
  return 'EMPLOYEE';
}

function mapRowToEmployee(row: any): Employee {
  return {
    id: row.id,
    code: row.code ?? 'NV001',
    username: row.username ?? row.email ?? row.id,
    passwordHash: row.password_hash ?? '',
    role: normalizeRole(row.role),
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date()
  };
}

export async function signInWithEmailPassword(email: string, password: string): Promise<SupabaseSignInResult> {
  const sb = getSupabase();
  if (!sb) {
    console.error('[SupabaseAuth] Supabase not configured');
    return { ok: false, message: 'Supabase not configured' };
  }

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    console.error('[SupabaseAuth] signInWithPassword failed', { error });
    return { ok: false, message: error?.message ?? 'Sign-in failed' };
  }

  // Try to load employee row by Supabase user id for authoritative role
  try {
    let { data: row } = await sb
      .from('employees')
      .select('*')
      .eq('id', data.session.user.id)
      .single();
    // Do not auto-upsert as MANAGER; respect existing DB role. If not found, fall back below.
    if (row) {
      return { ok: true, sessionToken: data.session.access_token, user: mapRowToEmployee(row) };
    }
  } catch (e) {
    console.warn('[SupabaseAuth] employees lookup/upsert failed, using fallback', e);
  }

  // Fallback to Supabase identity
  const user: Employee = {
    id: data.session.user.id,
    code: 'NV001',
    username: data.session.user.email || email,
    passwordHash: '',
    role: 'EMPLOYEE',
    createdAt: new Date(),
    updatedAt: new Date()
  };
  return { ok: true, sessionToken: data.session.access_token, user };
}

export async function getSessionUser(): Promise<{ ok: true; token: string; user: Employee } | { ok: false }>{
  const sb = getSupabase();
  if (!sb) {
    console.error('[SupabaseAuth] getSessionUser: Supabase not configured');
    return { ok: false };
  }
  const { data } = await sb.auth.getSession();
  if (!data?.session) return { ok: false };
  const email = data.session.user.email || '';

  try {
    let { data: row } = await sb
      .from('employees')
      .select('*')
      .eq('id', data.session.user.id)
      .single();
    // Do not auto-upsert; if no row, use fallback mapping below
    if (row) {
      return { ok: true, token: data.session.access_token, user: mapRowToEmployee(row) };
    }
  } catch (e) {
    console.warn('[SupabaseAuth] getSessionUser employees lookup failed, using fallback', e);
  }

  // Fallback
  const user: Employee = {
    id: data.session.user.id,
    code: 'NV001',
    username: email || data.session.user.id,
    passwordHash: '',
    role: 'EMPLOYEE',
    createdAt: new Date(),
    updatedAt: new Date()
  };
  return { ok: true, token: data.session.access_token, user };
}


