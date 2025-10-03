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

async function provisionEmployeeRow(
  sb: ReturnType<typeof getSupabase>,
  params: { userId: string; emailFallback: string }
): Promise<{ ok: true; row: any } | { ok: false }> {
  if (!sb) return { ok: false };
  const { userId, emailFallback } = params;
  const baseCode = 'NV' + String((userId || '').replace(/[^a-z0-9]/gi, '').slice(0, 8) || '00000000').toUpperCase();
  const tryUsernames: string[] = [];
  const email = (emailFallback || '').trim();
  if (email) tryUsernames.push(email);
  tryUsernames.push(userId); // guaranteed unique fallback

  // Attempt up to two usernames to avoid unique violations
  for (let i = 0; i < tryUsernames.length; i++) {
    const username = tryUsernames[i];
    const code = i === 0 ? baseCode : baseCode + String(i + 1);
    const { data: created, error } = await sb
      .from('employees')
      .insert({
        id: userId,
        code,
        username,
        role: 'EMPLOYEE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('*')
      .single();
    if (!error && created) return { ok: true, row: created };
    // If unique violation, retry with next candidate; otherwise abort
    const msg = String(error?.message || '').toLowerCase();
    const isUniqueViolation = msg.includes('duplicate key') || msg.includes('unique constraint');
    if (!isUniqueViolation) break;
  }
  return { ok: false };
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
    if (row) {
      return { ok: true, sessionToken: data.session.access_token, user: mapRowToEmployee(row) };
    }

    // Auto-provision if missing with safe fallbacks for unique constraints
    const provision = await provisionEmployeeRow(sb, {
      userId: data.session.user.id,
      emailFallback: data.session.user.email || email
    });
    if (provision.ok) {
      return { ok: true, sessionToken: data.session.access_token, user: mapRowToEmployee(provision.row) };
    }
  } catch (e) {
    console.warn('[SupabaseAuth] employees lookup/provision failed, using fallback', e);
  }

  // Fallback to Supabase identity (prefer role from user/app metadata if present)
  const metaRoleRaw: any = (data.session.user as any)?.app_metadata?.role ?? (data.session.user as any)?.user_metadata?.role;
  const fallbackRole = normalizeRole(metaRoleRaw);
  const user: Employee = {
    id: data.session.user.id,
    code: 'NV001',
    username: data.session.user.email || email,
    passwordHash: '',
    role: fallbackRole,
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
    if (row) {
      return { ok: true, token: data.session.access_token, user: mapRowToEmployee(row) };
    }

    // Auto-provision here as well to self-heal sessions
    const provision = await provisionEmployeeRow(sb, {
      userId: data.session.user.id,
      emailFallback: email
    });
    if (provision.ok) {
      return { ok: true, token: data.session.access_token, user: mapRowToEmployee(provision.row) };
    }
  } catch (e) {
    console.warn('[SupabaseAuth] getSessionUser lookup/provision failed, using fallback', e);
  }

  // Fallback (prefer role from user/app metadata if present)
  const metaRoleRaw: any = (data.session.user as any)?.app_metadata?.role ?? (data.session.user as any)?.user_metadata?.role;
  const fallbackRole = normalizeRole(metaRoleRaw);
  const user: Employee = {
    id: data.session.user.id,
    code: 'NV001',
    username: email || data.session.user.id,
    passwordHash: '',
    role: fallbackRole,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  return { ok: true, token: data.session.access_token, user };
}


