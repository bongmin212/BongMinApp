export type PasswordRecord = {
  scheme: 'pbkdf2';
  iter: number;
  salt: string; // base64
  hash: string; // base64
};

const textEncoder = new TextEncoder();

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function pbkdf2(password: string, saltB64: string, iter: number = 120000): Promise<PasswordRecord> {
  const salt = fromBase64(saltB64);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  const derivedKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const raw = await crypto.subtle.exportKey('raw', derivedKey);
  return { scheme: 'pbkdf2', iter, salt: saltB64, hash: toBase64(raw) };
}

export async function createPasswordRecord(password: string, iter: number = 120000): Promise<PasswordRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = toBase64(salt.buffer);
  return pbkdf2(password, saltB64, iter);
}

export async function verifyPassword(password: string, stored: string): Promise<{ ok: boolean; upgraded?: PasswordRecord }> {
  if (!stored.includes('$')) {
    if (password === stored) {
      const rec = await createPasswordRecord(password);
      return { ok: true, upgraded: rec };
    }
    return { ok: false };
  }
  const [scheme, iterStr, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'pbkdf2') return { ok: false };
  const iter = Number(iterStr) || 120000;
  const rec = await pbkdf2(password, saltB64, iter);
  return { ok: rec.hash === hashB64 };
}

export function serializePasswordRecord(rec: PasswordRecord): string {
  return `${rec.scheme}$${rec.iter}$${rec.salt}$${rec.hash}`;
}

export type AppToken = {
  v: 1;
  iat: number;
  exp: number;
  rnd: string;
  uid?: string;
};

export function createAppToken(opts?: { ttlMs?: number; uid?: string }): string {
  const now = Date.now();
  const ttl = Math.max(5 * 60_000, opts?.ttlMs ?? 8 * 60 * 60_000);
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const rnd = Array.from(bytes).join(',');
  const tok: AppToken = { v: 1, iat: now, exp: now + ttl, rnd, uid: opts?.uid };
  return btoa(unescape(encodeURIComponent(JSON.stringify(tok))));
}

export function parseAppToken(token: string | null): AppToken | null {
  if (!token) return null;
  try {
    const json = decodeURIComponent(escape(atob(token)));
    const data = JSON.parse(json) as AppToken;
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}


