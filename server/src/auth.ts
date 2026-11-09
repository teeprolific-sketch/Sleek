import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { emptyIdentity } from '../../src/domain/verification';
import type { Artisan, ArtisanAccountType, Customer } from '../../src/domain/types';
import type { Deps } from './context';
import { badRequest, forbidden, tooMany, unauthorized } from './errors';
import { newId, sha256 } from './ids';
import { sign, verify, type Claims } from './jwt';
import { isValidReferralCode } from '../../src/domain/referrals';
import { findUserByPhone, insertUser, notify } from './repo';
import { applyReferral } from './services/features';

export interface Session {
  userId: string;
  role: 'customer' | 'artisan' | 'admin';
  scope: 'user' | 'agent';
}

const SESSION_TTL = 30 * 24 * 3600;
const AGENT_TTL = 180 * 24 * 3600;
const OTP_TTL_MS = 5 * 60_000;
const OTP_MAX_PER_HOUR = 5;
const OTP_MAX_ATTEMPTS = 5;

/** Normalise to 234XXXXXXXXXX. Only Nigerian mobile numbers are accepted. */
export function normalisePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  const n = d.startsWith('234') ? d : d.startsWith('0') ? `234${d.slice(1)}` : d;
  if (!/^234[789][01]\d{8}$/.test(n)) throw badRequest('Enter a valid Nigerian mobile number, e.g. 0803 123 4567.', 'invalid_phone');
  return n;
}

export async function requestOtp(deps: Deps, rawPhone: string): Promise<{ sent: true; devCode?: string }> {
  const phone = normalisePhone(rawPhone);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const now = new Date(deps.now());
  const row = await deps.db.one<{ sent_count: number; window_start: Date }>('SELECT sent_count, window_start FROM otps WHERE phone = $1', [phone]);
  const sameWindow = row && now.getTime() - new Date(row.window_start).getTime() < 3_600_000;
  if (sameWindow && row!.sent_count >= OTP_MAX_PER_HOUR) throw tooMany('Too many codes requested. Try again in an hour.');
  await deps.db.query(
    `INSERT INTO otps (phone, code_hash, expires_at, attempts, sent_count, window_start) VALUES ($1, $2, $3, 0, 1, $4)
     ON CONFLICT (phone) DO UPDATE SET code_hash = $2, expires_at = $3, attempts = 0,
       sent_count = CASE WHEN $5 THEN otps.sent_count + 1 ELSE 1 END,
       window_start = CASE WHEN $5 THEN otps.window_start ELSE $4 END`,
    [phone, sha256(`${phone}:${code}`), new Date(now.getTime() + OTP_TTL_MS), now, !!sameWindow],
  );
  await deps.sms.sendOtp(phone, code);
  return deps.cfg.env === 'production' ? { sent: true } : { sent: true, devCode: code };
}

export async function verifyOtp(deps: Deps, rawPhone: string, code: string) {
  const phone = normalisePhone(rawPhone);
  const row = await deps.db.one<{ code_hash: string; expires_at: Date; attempts: number }>('SELECT code_hash, expires_at, attempts FROM otps WHERE phone = $1', [phone]);
  if (!row || new Date(row.expires_at).getTime() < deps.now()) throw unauthorized('That code has expired. Request a new one.');
  if (row.attempts >= OTP_MAX_ATTEMPTS) throw tooMany('Too many wrong codes. Request a new one.');
  const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(sha256(`${phone}:${code}`)));
  if (!ok) {
    await deps.db.query('UPDATE otps SET attempts = attempts + 1 WHERE phone = $1', [phone]);
    throw unauthorized('Wrong code.');
  }
  await deps.db.query('DELETE FROM otps WHERE phone = $1', [phone]);
  const user = await findUserByPhone(deps, phone);
  if (user) {
    if (user.suspended) throw forbidden('This account is suspended. Contact support.');
    return { token: sign({ sub: user.id, role: user.role, scope: 'user' }, deps.cfg.jwtSecret, SESSION_TTL, deps.now()), role: user.role, userId: user.id };
  }
  return { registrationToken: sign({ sub: phone, phone, scope: 'register' }, deps.cfg.jwtSecret, 30 * 60, deps.now()) };
}

export interface RegisterInput {
  registrationToken: string;
  name: string;
  role: 'customer' | 'artisan';
  accountType?: ArtisanAccountType;
  businessName?: string;
  city: string;
  area: string;
  referralCode?: string;
}

export async function register(deps: Deps, i: RegisterInput) {
  const claims = verify(i.registrationToken, deps.cfg.jwtSecret, deps.now());
  if (!claims || claims.scope !== 'register' || !claims.phone) throw unauthorized('Verify your phone number again.');
  if (await findUserByPhone(deps, claims.phone)) throw badRequest('An account already exists for this number. Sign in instead.');
  if (i.name.trim().split(/\s+/).length < 2) throw badRequest('Enter your first and last name as on your NIN.');
  if (i.referralCode && !isValidReferralCode(i.referralCode)) throw badRequest('That referral code isn’t valid. Check it, or leave it empty.');
  const id = newId(i.role === 'customer' ? 'cus' : 'art');
  const now = new Date(deps.now()).toISOString();
  if (i.role === 'customer') {
    const c: Customer = { id, role: 'customer', name: i.name.trim(), phone: claims.phone, area: i.area, city: i.city, joinedAt: now, addresses: [] };
    await insertUser(deps, c);
  } else {
    const a: Artisan = {
      id,
      role: 'artisan',
      accountType: i.accountType ?? 'individual',
      businessName: i.businessName?.trim() || undefined,
      name: i.name.trim(),
      phone: claims.phone,
      bio: '',
      area: i.area,
      city: i.city,
      yearsExperience: 1,
      online: false,
      identity: emptyIdentity(),
      skills: [],
      startingPrices: {},
      stats: { completedJobs: 0, cancelledByArtisan: 0, disputesOpened: 0, disputesLost: 0, ruleViolations: 0, ratingSum: 0, ratingCount: 0, onTimeRate: 1 },
      workers: [],
      calendarMode: i.accountType && i.accountType !== 'individual' ? 'shared' : undefined,
      workingHours: { 0: null, 1: { start: 8, end: 18 }, 2: { start: 8, end: 18 }, 3: { start: 8, end: 18 }, 4: { start: 8, end: 18 }, 5: { start: 8, end: 18 }, 6: { start: 9, end: 15 } },
      joinedAt: now,
      avatarColor: '#0EA5E9',
    };
    await insertUser(deps, a);
    await notify(deps, id, 'Welcome to Sleek', 'Verify your identity and each skill to start receiving jobs.', '/verify');
  }
  if (i.referralCode) {
    const [first, last] = i.name.trim().split(/\s+/);
    await applyReferral(deps, id, `${first} ${last?.[0] ?? ''}.`, i.role, i.referralCode).catch(() => undefined); // a bad code never blocks sign-up
  }
  return { token: sign({ sub: id, role: i.role, scope: 'user' }, deps.cfg.jwtSecret, SESSION_TTL, deps.now()), role: i.role, userId: id };
}

export function issueAgentToken(deps: Deps, userId: string, version: number) {
  return sign({ sub: userId, role: 'customer', scope: 'agent', ver: version }, deps.cfg.jwtSecret, AGENT_TTL, deps.now());
}

/** Resolve the caller from the Authorization header. Suspended users and revoked agent tokens are rejected. */
export async function authenticate(deps: Deps, req: FastifyRequest): Promise<Session> {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) throw unauthorized();
  const claims: Claims | null = verify(h.slice(7), deps.cfg.jwtSecret, deps.now());
  if (!claims || (claims.scope !== 'user' && claims.scope !== 'agent') || !claims.role) throw unauthorized();
  const row = await deps.db.one<{ suspended: boolean; agent_token_version: number; role: Session['role'] }>('SELECT suspended, agent_token_version, role FROM users WHERE id = $1', [claims.sub]);
  if (!row) throw unauthorized();
  if (row.suspended) throw forbidden('This account is suspended. Contact support.');
  if (claims.scope === 'agent' && claims.ver !== row.agent_token_version) throw unauthorized('Ugent access was revoked. Reconnect in Sleek.');
  return { userId: claims.sub, role: row.role, scope: claims.scope };
}
