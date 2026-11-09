import type { PoolClient } from 'pg';
import { categoryFromLink, shouldPush } from '../../src/domain/notifications';
import type { Admin, AppNotification, Artisan, ChatMessage, Customer, Job, NotificationCategory, NotificationPrefs, User } from '../../src/domain/types';
import type { Deps } from './context';
import type { Queryable } from './db';
import { notFound } from './errors';
import { newId } from './ids';

type C = Queryable | PoolClient;
const iso = (deps: Deps) => new Date(deps.now()).toISOString();

// ---- users ----------------------------------------------------------------
export async function getUser<T extends User = User>(deps: Deps, id: string, c: C = deps.db.pool, forUpdate = false): Promise<T & { suspended?: boolean }> {
  const row = await deps.db.one<{ data: T; suspended: boolean }>(`SELECT data, suspended FROM users WHERE id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`, [id], c);
  if (!row) throw notFound('User not found');
  return { ...row.data, suspended: row.suspended };
}

export async function findUserByPhone(deps: Deps, phone: string) {
  return deps.db.one<{ id: string; role: User['role']; suspended: boolean }>('SELECT id, role, suspended FROM users WHERE phone = $1', [phone]);
}

export async function insertUser(deps: Deps, u: User, c: C = deps.db.pool) {
  await deps.db.query(
    'INSERT INTO users (id, role, phone, city, online, data) VALUES ($1, $2, $3, $4, $5, $6)',
    [u.id, u.role, u.phone, (u as Customer | Artisan).city ?? null, (u as Artisan).online ?? false, JSON.stringify(stripMeta(u))],
    c,
  );
}

export async function saveUser(deps: Deps, u: User, c: C = deps.db.pool) {
  await deps.db.query('UPDATE users SET data = $2, city = $3, online = $4, updated_at = now() WHERE id = $1', [u.id, JSON.stringify(stripMeta(u)), (u as Customer | Artisan).city ?? null, (u as Artisan).online ?? false], c);
}

function stripMeta<T>(u: T): T {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { suspended, ...rest } = u as T & { suspended?: boolean };
  return rest as T;
}

export async function getArtisan(deps: Deps, id: string, c: C = deps.db.pool, forUpdate = false): Promise<Artisan> {
  const u = await getUser<Artisan>(deps, id, c, forUpdate);
  if (u.role !== 'artisan') throw notFound('Artisan not found');
  return u;
}

export async function listArtisans(deps: Deps, city?: string): Promise<Artisan[]> {
  const rows = await deps.db.query<{ data: Artisan }>(
    `SELECT data FROM users WHERE role = 'artisan' AND NOT suspended ${city ? 'AND city = $1' : ''}`,
    city ? [city] : [],
  );
  return rows.map((r) => r.data);
}

// ---- jobs -------------------------------------------------------------------
export async function getJob(deps: Deps, id: string, c: C = deps.db.pool, forUpdate = false): Promise<Job> {
  const row = await deps.db.one<{ data: Job }>(`SELECT data FROM jobs WHERE id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`, [id], c);
  if (!row) throw notFound('Job not found');
  return row.data;
}

export async function insertJob(deps: Deps, j: Job, c: C) {
  await deps.db.query(
    'INSERT INTO jobs (id, customer_id, artisan_id, status, window_start, window_end, data) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [j.id, j.customerId, j.artisanId, j.status, j.window.start, j.window.end, JSON.stringify(j)],
    c,
  );
}

export async function saveJob(deps: Deps, j: Job, c: C) {
  j.updatedAt = iso(deps);
  await deps.db.query('UPDATE jobs SET status = $2, data = $3, updated_at = now() WHERE id = $1', [j.id, j.status, JSON.stringify(j)], c);
}

/** Jobs that can occupy an artisan's time (used for overlap checks). */
export async function capacityJobs(deps: Deps, artisanIds: string[], c: C = deps.db.pool): Promise<Job[]> {
  if (!artisanIds.length) return [];
  const rows = await deps.db.query<{ data: Job }>(
    "SELECT data FROM jobs WHERE artisan_id = ANY($1) AND status IN ('funded','in_progress','proof_submitted')",
    [artisanIds],
    c,
  );
  return rows.map((r) => r.data);
}

// ---- messages / notifications / audit ---------------------------------------
export async function insertMessage(deps: Deps, m: Omit<ChatMessage, 'id' | 'at'>, c: C = deps.db.pool): Promise<ChatMessage> {
  const msg: ChatMessage = { ...m, id: newId('msg'), at: iso(deps) };
  await deps.db.query('INSERT INTO messages (id, job_id, data) VALUES ($1, $2, $3)', [msg.id, msg.jobId, JSON.stringify(msg)], c);
  return msg;
}

export const systemMessage = (deps: Deps, jobId: string, text: string, c?: C) => insertMessage(deps, { jobId, from: 'system', kind: 'system', text }, c);

export async function notify(deps: Deps, userId: string, title: string, body: string, link?: string, c: C = deps.db.pool, category?: NotificationCategory) {
  const cat = category ?? categoryFromLink(link, title);
  const prefs = await deps.db.one<{ notification_prefs: NotificationPrefs }>('SELECT notification_prefs FROM users WHERE id = $1', [userId], c);
  const p = prefs?.notification_prefs && Object.keys(prefs.notification_prefs).length ? prefs.notification_prefs : undefined;
  const silent = !shouldPush(p, cat, deps.now());
  const n: AppNotification = { id: newId('n'), userId, title, body, link, at: iso(deps), read: false, category: cat, silent };
  await deps.db.query('INSERT INTO notifications (id, user_id, data) VALUES ($1, $2, $3)', [n.id, userId, JSON.stringify(n)], c);
  // Production: when !silent, enqueue an Expo push notification for the user's devices here.
}

export async function audit(deps: Deps, actorId: string | null, action: string, targetId: string | null, detail: Record<string, unknown> = {}, c: C = deps.db.pool) {
  await deps.db.query('INSERT INTO audit_log (actor_id, action, target_id, detail) VALUES ($1, $2, $3, $4)', [actorId, action, targetId, JSON.stringify(detail)], c);
}

export async function adminIds(deps: Deps): Promise<string[]> {
  return (await deps.db.query<{ id: string }>("SELECT id FROM users WHERE role = 'admin'")).map((r) => r.id);
}

export type { Admin };
