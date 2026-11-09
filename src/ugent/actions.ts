/**
 * Ugent action surface.
 *
 * Ugent (the Me AI personal agent) books artisans on the user's behalf through
 * natural language. It talks to Sleek ONLY through these actions. They are
 * described as JSON-schema tools so an LLM agent can call them directly, and
 * the same contract is exposed by the backend at POST /v1/agent/actions/:name
 * (see docs/UGENT.md).
 *
 * Read-only actions run immediately. Anything that creates a booking, changes
 * a price, moves money or cancels returns `requires_confirmation` and waits
 * for the user to approve inside Sleek. Ugent can never fund escrow itself —
 * the user always completes payment in the Sleek payment screen.
 */
import { CATEGORIES, category, categoryName } from '../data/categories';
import { bookableFor, suggestSlots } from '../domain/availability';
import { STATUS_LABEL } from '../domain/escrow';
import { searchAvailable } from '../domain/ranking';
import { badgesFor, displayRating } from '../domain/trust';
import { useStore } from '../store';
import { naira, windowLabel } from '../utils/format';
import { CONFIRMATION_REQUIRED, type UgentActionName } from './types';

export interface ToolDef {
  name: UgentActionName;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

const iso = { type: 'string', description: 'ISO-8601 date-time, Africa/Lagos' };

export const UGENT_TOOLS: ToolDef[] = [
  { name: 'list_categories', description: 'List all trades/services offered on Sleek.', input_schema: { type: 'object', properties: {} } },
  {
    name: 'search_available_artisans',
    description: 'Search AVAILABLE, verified artisans ranked best to last. If start/end are given, only artisans free for that window are returned.',
    input_schema: {
      type: 'object',
      properties: { category_id: { type: 'string' }, city: { type: 'string' }, text: { type: 'string' }, start: iso, end: iso, limit: { type: 'number' } },
    },
  },
  { name: 'get_artisan_profile', description: 'Public profile, badges, rating and starting prices of an artisan.', input_schema: { type: 'object', properties: { artisan_id: { type: 'string' } }, required: ['artisan_id'] } },
  { name: 'check_artisan_skills', description: 'Which skills an artisan is verified for (each verified separately).', input_schema: { type: 'object', properties: { artisan_id: { type: 'string' } }, required: ['artisan_id'] } },
  {
    name: 'check_availability',
    description: 'Check if an artisan can take a job in a time window, and suggest free slots for that day.',
    input_schema: { type: 'object', properties: { artisan_id: { type: 'string' }, category_id: { type: 'string' }, start: iso, end: iso }, required: ['artisan_id', 'category_id', 'start', 'end'] },
  },
  {
    name: 'initiate_booking',
    description: 'Create a job request and open the chat. REQUIRES USER CONFIRMATION in Sleek. Price is then agreed in the Price Pool.',
    input_schema: {
      type: 'object',
      properties: { artisan_id: { type: 'string' }, category_id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, start: iso, end: iso, address_label: { type: 'string', description: 'Saved address label, e.g. Home' } },
      required: ['artisan_id', 'category_id', 'description', 'start', 'end'],
    },
  },
  { name: 'propose_price', description: 'Propose or counter a price in the job Price Pool. REQUIRES USER CONFIRMATION.', input_schema: { type: 'object', properties: { job_id: { type: 'string' }, amount: { type: 'number' } }, required: ['job_id', 'amount'] } },
  { name: 'request_escrow_funding', description: 'Ask the user to pay the locked price into escrow. The user completes payment in Sleek; Ugent never handles payment details.', input_schema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] } },
  { name: 'approve_job_completion', description: 'Approve proof of work and release escrow. REQUIRES USER CONFIRMATION.', input_schema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] } },
  { name: 'cancel_job', description: 'Cancel a job before work starts (refund per policy). REQUIRES USER CONFIRMATION.', input_schema: { type: 'object', properties: { job_id: { type: 'string' }, reason: { type: 'string' } }, required: ['job_id', 'reason'] } },
  { name: 'get_job_status', description: 'Status, escrow state, time window and the next step for a job.', input_schema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] } },
  { name: 'list_my_jobs', description: 'The user’s jobs with status.', input_schema: { type: 'object', properties: { active_only: { type: 'boolean' } } } },
];

export type UgentResult =
  | { status: 'ok'; data: unknown }
  | { status: 'requires_confirmation'; request_id: string; summary: string }
  | { status: 'error'; error: string };

type Args = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' ? v : undefined);
const st = () => useStore.getState();

function artisanSummary(id: string) {
  const a = st().artisans.find((x) => x.id === id);
  if (!a) return null;
  return {
    artisan_id: a.id,
    name: a.businessName ?? a.name,
    account_type: a.accountType,
    area: `${a.area}, ${a.city}`,
    rating: Number(displayRating(a).toFixed(1)),
    completed_escrow_jobs: a.stats.completedJobs,
    badges: badgesFor(a, Date.now(), categoryName).map((b) => b.label),
    starting_prices: Object.fromEntries(Object.entries(a.startingPrices).map(([k, v]) => [categoryName(k), naira(v)])),
  };
}

function jobStatus(jobId: string) {
  const j = st().jobs.find((x) => x.id === jobId);
  if (!j) return null;
  const next: Record<string, string> = {
    requested: 'Agree a price in the Price Pool',
    price_agreed: 'Customer pays the locked price into escrow',
    funded: 'Artisan arrives at the scheduled time',
    in_progress: 'Artisan is working; proof of work comes next',
    proof_submitted: 'Customer approves or disputes the proof of work',
    disputed: 'Sleek is reviewing the dispute',
  };
  return {
    job_id: j.id,
    title: j.title,
    status: STATUS_LABEL[j.status],
    window: windowLabel(j.window),
    price: j.pricePool.locked ? naira(j.pricePool.locked.amount) : null,
    escrow: j.escrow.state,
    next_step: next[j.status] ?? 'None — job closed',
    origin: j.origin,
  };
}

/** Called by the agent (or the backend agent gateway). */
export function executeUgentAction(name: UgentActionName, args: Args = {}): UgentResult {
  const state = st();
  if (!state.settings.ugentLinked) return { status: 'error', error: 'Ugent is not connected to this Sleek account. The user must link it in Sleek first.' };
  if (state.session.role !== 'customer') return { status: 'error', error: 'Ugent can only book on behalf of customer accounts.' };
  const now = Date.now();

  if (CONFIRMATION_REQUIRED.includes(name) || name === 'request_escrow_funding') {
    const summary = summarise(name, args);
    if ('error' in summary) return { status: 'error', error: summary.error };
    const req = state.queueUgentRequest(name, args, summary.text);
    return { status: 'requires_confirmation', request_id: req.id, summary: summary.text };
  }

  switch (name) {
    case 'list_categories':
      return { status: 'ok', data: CATEGORIES.map((c) => ({ id: c.id, name: c.name, group: c.group })) };
    case 'search_available_artisans': {
      const window = s(args.start) && s(args.end) ? { start: s(args.start)!, end: s(args.end)! } : undefined;
      const me = state.customers.find((c) => c.id === state.session.userId);
      const res = searchAvailable(state.artisans, state.jobs, { categoryId: s(args.category_id), city: s(args.city) ?? me?.city, text: s(args.text), window, categoryName }, now);
      return { status: 'ok', data: res.slice(0, Number(args.limit) || 5).map((r, i) => ({ rank: i + 1, ...artisanSummary(r.artisan.id), score: r.score.total })) };
    }
    case 'get_artisan_profile': {
      const a = artisanSummary(s(args.artisan_id) ?? '');
      return a ? { status: 'ok', data: a } : { status: 'error', error: 'Artisan not found.' };
    }
    case 'check_artisan_skills': {
      const a = state.artisans.find((x) => x.id === args.artisan_id);
      if (!a) return { status: 'error', error: 'Artisan not found.' };
      return { status: 'ok', data: [...a.skills, ...a.workers.flatMap((w) => w.skills)].map((k) => ({ category_id: k.categoryId, name: categoryName(k.categoryId), status: k.status })) };
    }
    case 'check_availability': {
      const a = state.artisans.find((x) => x.id === args.artisan_id);
      if (!a) return { status: 'error', error: 'Artisan not found.' };
      const w = { start: s(args.start)!, end: s(args.end)! };
      const b = bookableFor(state.jobs, a, s(args.category_id)!, w);
      const dur = (new Date(w.end).getTime() - new Date(w.start).getTime()) / 60_000;
      const slots = suggestSlots(state.jobs, a, s(args.category_id)!, new Date(w.start), dur, now).slice(0, 6);
      return { status: 'ok', data: { available: b.ok, reason: b.reason, suggested_slots: slots.map((x) => ({ ...x, label: windowLabel(x) })) } };
    }
    case 'get_job_status': {
      const j = jobStatus(s(args.job_id) ?? '');
      return j ? { status: 'ok', data: j } : { status: 'error', error: 'Job not found.' };
    }
    case 'list_my_jobs': {
      const mine = state.jobs.filter((j) => j.customerId === state.session.userId && (!args.active_only || !['completed', 'resolved', 'cancelled', 'declined'].includes(j.status)));
      return { status: 'ok', data: mine.map((j) => jobStatus(j.id)) };
    }
    default:
      return { status: 'error', error: `Unknown action ${name}` };
  }
}

function summarise(name: UgentActionName, args: Args): { text: string } | { error: string } {
  const state = st();
  const job = state.jobs.find((j) => j.id === args.job_id);
  switch (name) {
    case 'initiate_booking': {
      const a = state.artisans.find((x) => x.id === args.artisan_id);
      if (!a) return { error: 'Artisan not found.' };
      if (!s(args.start) || !s(args.end) || !s(args.category_id)) return { error: 'A booking needs a service and a start and end time.' };
      const w = { start: s(args.start)!, end: s(args.end)! };
      const b = bookableFor(state.jobs, a, s(args.category_id)!, w);
      if (!b.ok) return { error: b.reason! };
      return { text: `Send a ${category(s(args.category_id)!).name} request to ${a.businessName ?? a.name} for ${windowLabel(w)}: “${s(args.description)}”. No payment yet — you’ll agree the price in chat.` };
    }
    case 'propose_price':
      return job ? { text: `Offer ${naira(Number(args.amount))} for “${job.title}”.` } : { error: 'Job not found.' };
    case 'request_escrow_funding':
      if (!job) return { error: 'Job not found.' };
      if (job.status !== 'price_agreed') return { error: 'The price must be locked before paying into escrow.' };
      return { text: `Pay ${naira(job.pricePool.locked!.amount)} into Sleek Escrow for “${job.title}”. You’ll complete payment yourself in Sleek.` };
    case 'approve_job_completion':
      return job ? { text: `Approve the work on “${job.title}” and release ${naira(job.escrow.amount)} to the artisan.` } : { error: 'Job not found.' };
    case 'cancel_job':
      return job ? { text: `Cancel “${job.title}”. Reason: ${s(args.reason) ?? 'not given'}.` } : { error: 'Job not found.' };
    default:
      return { text: name };
  }
}

/**
 * Runs a confirmed request. Called only from the Sleek UI after the user taps
 * Confirm. Returns a route to open when the user must finish in-app (payment).
 */
export function runConfirmedRequest(id: string): { ok: boolean; message: string; openRoute?: string } {
  const state = st();
  const req = state.ugentRequests.find((r) => r.id === id);
  if (!req || req.status !== 'pending') return { ok: false, message: 'This request is no longer pending.' };
  if (new Date(req.expiresAt).getTime() < Date.now()) {
    state.decideUgentRequest(id, 'rejected', undefined, 'Expired');
    return { ok: false, message: 'This request expired. Ask Ugent again.' };
  }
  const a = req.args;
  let r: { ok: boolean; error?: string; value?: unknown };
  let openRoute: string | undefined;
  switch (req.action) {
    case 'initiate_booking': {
      const me = state.customers.find((c) => c.id === state.session.userId);
      const addressIndex = Math.max(0, me?.addresses.findIndex((x) => x.label === a.address_label) ?? 0);
      r = state.createJob({ artisanId: s(a.artisan_id)!, categoryId: s(a.category_id)!, title: s(a.title) ?? '', description: s(a.description) ?? '', window: { start: s(a.start)!, end: s(a.end)! }, addressIndex, issuePhotos: [], origin: 'ugent' });
      if (r.ok) openRoute = `/chat/${r.value}`;
      break;
    }
    case 'propose_price':
      r = state.proposePrice(s(a.job_id)!, Number(a.amount), 'Proposed via Ugent');
      break;
    case 'request_escrow_funding':
      r = { ok: true };
      openRoute = `/escrow/${s(a.job_id)}`;
      break;
    case 'approve_job_completion':
      r = state.approveJob(s(a.job_id)!);
      break;
    case 'cancel_job':
      r = state.cancelJob(s(a.job_id)!, s(a.reason) ?? 'Cancelled via Ugent');
      break;
    default:
      r = { ok: false, error: 'Unsupported action' };
  }
  state.decideUgentRequest(id, 'confirmed', r.ok ? r.value ?? true : undefined, r.ok ? undefined : r.error);
  return { ok: r.ok, message: r.ok ? 'Done.' : r.error ?? 'Failed', openRoute };
}
