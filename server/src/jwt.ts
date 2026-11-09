import crypto from 'node:crypto';

/** Minimal HS256 JWT (no external dependency). */
export interface Claims {
  sub: string;
  role?: 'customer' | 'artisan' | 'admin';
  /** 'user' = app session, 'agent' = Ugent, 'register' = phone verified, account not yet created */
  scope: 'user' | 'agent' | 'register';
  phone?: string;
  /** agent token version (revocation) */
  ver?: number;
  iat: number;
  exp: number;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function sign(claims: Omit<Claims, 'iat' | 'exp'>, secret: string, ttlSec: number, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ ...claims, iat, exp: iat + ttlSec }));
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export function verify(token: string, secret: string, now = Date.now()): Claims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const header = JSON.parse(Buffer.from(head, 'base64url').toString());
    if (header.alg !== 'HS256') return null;
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as Claims;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < now) return null;
    return claims;
  } catch {
    return null;
  }
}
