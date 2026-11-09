/**
 * Ugent gateway. Agent tokens (scope "agent") can call read actions directly.
 * State-changing actions create a pending request that ONLY the user's own app
 * session can confirm — an agent token is rejected on the confirm endpoint.
 */
import { CATEGORIES, category } from '../../../src/data/categories';
import { STATUS_LABEL } from '../../../src/domain/escrow';
import type { Job } from '../../../src/domain/types';
import { UGENT_TOOLS } from '../../../src/ugent/tools';
import { CONFIRMATION_REQUIRED, type UgentActionName } from '../../../src/ugent/types';
import { issueAgentToken, type Session } from '../auth';
import type { Deps } from '../context';
import { badRequest, forbidden, notFound, ruleViolation } from '../errors';
import { newId } from '../ids';
import { getJob, notify } from '../repo';
import * as artisans from './artisans';
import * as jobs from './jobs';

const iso = (deps: Deps) => new Date(deps.now()).toISOString();
const REQUEST_TTL_MS = 30 * 60_000;

export const tools = () => UGENT_TOOLS;

export async function link(deps: Deps, s: Session) {
  if (s.role !== 'customer' || s.scope !== 'user') throw forbidden('Only customers can connect Ugent.');
  const row = await deps.db.one<{ agent_token_version: number }>('UPDATE users SET agent_token_version = agent_token_version + 1 WHERE id = $1 RETURNING agent_token_version', [s.userId]);
  return { agentToken: issueAgentToken(deps, s.userId, row!.agent_token_version), scopes: UGENT_TOOLS.map((t) => t.name) };
}

export async function unlink(deps: Deps, s: Session) {
  if (s.scope !== 'user') throw forbidden();
  await deps.db.query('UPDATE users SET agent_token_version = agent_token_version + 1 WHERE id = $1', [s.userId]);
  await deps.db.query("UPDATE agent_requests SET status = 'rejected' WHERE user_id = $1 AND status = 'pending'", [s.userId]);
}

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

function jobSummary(j: Job) {
  return { job_id: j.id, title: j.title, status: STATUS_LABEL[j.status], window: j.window, price: j.pricePool.locked?.amount ?? null, escrow: j.escrow.state, origin: j.origin };
}

async function summarise(deps: Deps, s: Session, name: UgentActionName, a: Args): Promise<string> {
  if (name === 'initiate_booking') {
    if (!str(a.artisan_id) || !str(a.category_id) || !str(a.start) || !str(a.end) || !str(a.description)) throw badRequest('initiate_booking needs artisan_id, category_id, description, start and end.');
    const av = await artisans.availability(deps, str(a.artisan_id)!, str(a.category_id)!, { start: str(a.start)!, end: str(a.end)! });
    if (!av.available) throw ruleViolation(av.reason ?? 'Not available', 'not_bookable');
    const p = await artisans.profile(deps, str(a.artisan_id)!);
    return `Send a ${category(str(a.category_id)!).name} request to ${p.artisan.businessName ?? p.artisan.name} for ${a.start} – ${a.end}: “${a.description}”. No payment yet.`;
  }
  const job = await getJob(deps, str(a.job_id) ?? '');
  if (job.customerId !== s.userId) throw forbidden();
  switch (name) {
    case 'propose_price':
      if (!Number.isInteger(a.amount)) throw badRequest('amount must be a whole Naira amount.');
      return `Offer ₦${Number(a.amount).toLocaleString('en-NG')} for “${job.title}”.`;
    case 'request_escrow_funding':
      if (job.status !== 'price_agreed') throw ruleViolation('The price must be locked before paying into escrow.');
      return `Pay ₦${job.pricePool.locked!.amount.toLocaleString('en-NG')} into Sleek Escrow for “${job.title}”. You complete payment yourself in Sleek.`;
    case 'approve_job_completion':
      return `Approve the work on “${job.title}” and release ₦${job.escrow.amount.toLocaleString('en-NG')} to the artisan.`;
    case 'cancel_job':
      return `Cancel “${job.title}”. Reason: ${str(a.reason) ?? 'not given'}.`;
    default:
      return name;
  }
}

export async function execute(deps: Deps, s: Session, name: UgentActionName, args: Args) {
  if (s.role !== 'customer') throw forbidden('Ugent acts for customer accounts only.');
  if (!UGENT_TOOLS.some((t) => t.name === name)) throw notFound(`Unknown action ${name}`);
  if (CONFIRMATION_REQUIRED.includes(name) || name === 'request_escrow_funding') {
    const summary = await summarise(deps, s, name, args);
    const id = newId('ug');
    const req = { id, userId: s.userId, action: name, args, summary, status: 'pending', createdAt: iso(deps), expiresAt: new Date(deps.now() + REQUEST_TTL_MS).toISOString() };
    await deps.db.query("INSERT INTO agent_requests (id, user_id, status, data, expires_at) VALUES ($1, $2, 'pending', $3, $4)", [id, s.userId, JSON.stringify(req), req.expiresAt]);
    await notify(deps, s.userId, 'Ugent needs your confirmation', summary, '/ugent');
    return { status: 'requires_confirmation', request_id: id, summary };
  }
  switch (name) {
    case 'list_categories':
      return { status: 'ok', data: CATEGORIES.map((c) => ({ id: c.id, name: c.name, group: c.group })) };
    case 'search_available_artisans': {
      const window = str(args.start) && str(args.end) ? { start: str(args.start)!, end: str(args.end)! } : undefined;
      const me = await deps.db.one<{ city: string }>('SELECT city FROM users WHERE id = $1', [s.userId]);
      return { status: 'ok', data: await artisans.search(deps, { categoryId: str(args.category_id), city: str(args.city) ?? me?.city, text: str(args.text), window, limit: Number(args.limit) || 5 }) };
    }
    case 'get_artisan_profile':
      return { status: 'ok', data: await artisans.profile(deps, str(args.artisan_id) ?? '') };
    case 'check_artisan_skills':
      return { status: 'ok', data: (await artisans.profile(deps, str(args.artisan_id) ?? '')).artisan.skills };
    case 'check_availability':
      return { status: 'ok', data: await artisans.availability(deps, str(args.artisan_id) ?? '', str(args.category_id) ?? '', { start: str(args.start)!, end: str(args.end)! }) };
    case 'get_job_status': {
      const j = await getJob(deps, str(args.job_id) ?? '');
      if (j.customerId !== s.userId) throw forbidden();
      return { status: 'ok', data: jobSummary(j) };
    }
    case 'list_my_jobs': {
      const list = (await jobs.listJobs(deps, s)).filter((j) => !args.active_only || !['completed', 'resolved', 'cancelled', 'declined'].includes(j.status));
      return { status: 'ok', data: list.map(jobSummary) };
    }
    default:
      throw notFound(`Unknown action ${name}`);
  }
}

export async function listRequests(deps: Deps, s: Session) {
  return (await deps.db.query<{ data: object; status: string }>('SELECT data, status FROM agent_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [s.userId])).map((r) => ({ ...r.data, status: r.status }));
}

/** Confirm/reject — only from the user's own app session, never from an agent token. */
export async function decide(deps: Deps, s: Session, id: string, decision: 'confirm' | 'reject') {
  if (s.scope !== 'user') throw forbidden('Only you can confirm Ugent requests, inside Sleek.');
  const row = await deps.db.one<{ data: { action: UgentActionName; args: Args }; status: string; expires_at: Date }>("UPDATE agent_requests SET status = 'processing' WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING data, status, expires_at", [id, s.userId]);
  if (!row) throw notFound('This request is no longer pending.');
  const finish = (status: string, result?: unknown, error?: string) =>
    deps.db.query("UPDATE agent_requests SET status = $2, data = data || jsonb_build_object('decidedAt', $3::text, 'result', $4::jsonb, 'error', $5::text) WHERE id = $1", [id, status, iso(deps), JSON.stringify(result ?? null), error ?? null]);
  if (decision === 'reject') {
    await finish('rejected');
    return { status: 'rejected' };
  }
  if (new Date(row.expires_at).getTime() < deps.now()) {
    await finish('expired');
    throw ruleViolation('This request expired. Ask Ugent again.', 'expired');
  }
  const a = row.data.args;
  const user: Session = { ...s, scope: 'user' };
  try {
    let result: unknown;
    let openRoute: string | undefined;
    switch (row.data.action) {
      case 'initiate_booking': {
        const me = await deps.db.one<{ data: { addresses: { label: string }[] } }>('SELECT data FROM users WHERE id = $1', [s.userId]);
        const idx = Math.max(0, me?.data.addresses.findIndex((x) => x.label === a.address_label) ?? 0);
        const job = await jobs.createJob(deps, user, { artisanId: str(a.artisan_id)!, categoryId: str(a.category_id)!, title: str(a.title) ?? '', description: str(a.description)!, window: { start: str(a.start)!, end: str(a.end)! }, addressIndex: idx, issueMediaIds: [], origin: 'ugent' });
        result = { job_id: job.id };
        openRoute = `/chat/${job.id}`;
        break;
      }
      case 'propose_price':
        await jobs.proposePrice(deps, user, str(a.job_id)!, Number(a.amount), 'Proposed via Ugent');
        break;
      case 'request_escrow_funding': {
        const pay = await jobs.initEscrowPayment(deps, user, str(a.job_id)!);
        result = { authorization_url: pay.authorizationUrl, reference: pay.reference };
        openRoute = `/escrow/${a.job_id}`;
        break;
      }
      case 'approve_job_completion':
        await jobs.approveJob(deps, user, str(a.job_id)!);
        break;
      case 'cancel_job':
        await jobs.cancelJob(deps, user, str(a.job_id)!, str(a.reason) ?? 'Cancelled via Ugent');
        break;
    }
    await finish('confirmed', result);
    return { status: 'confirmed', result, openRoute };
  } catch (e) {
    await finish('failed', undefined, (e as Error).message);
    throw e;
  }
}

/** Scheduler: pending requests older than 30 minutes expire. */
export async function expireRequests(deps: Deps) {
  await deps.db.query("UPDATE agent_requests SET status = 'expired' WHERE status = 'pending' AND expires_at < $1", [iso(deps)]);
}
