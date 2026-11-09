/**
 * Jobs, chat, Price Pool, escrow, proof of work, cancellation, reviews and
 * disputes. Every rule comes from ../../src/domain — the same code the app runs.
 *
 * Concurrency: anything that can change an artisan's capacity locks the
 * artisan's user row (SELECT … FOR UPDATE) first, so two customers can never
 * fund overlapping slots for the same worker.
 */
import type { PoolClient } from 'pg';
import { category, categoryName } from '../../../src/data/categories';
import { bookableFor, freeWorkersFor, workerFreeFor, workerSkillApproved } from '../../../src/domain/availability';
import * as Esc from '../../../src/domain/escrow';
import { moderateMessage } from '../../../src/domain/moderation';
import * as Pool from '../../../src/domain/pricePool';
import { isTrusted } from '../../../src/domain/trust';
import type { Artisan, CapturedMedia, Customer, Dispute, DisputeOutcome, DisputeReason, Job, Review, TimeWindow, UploadPurpose } from '../../../src/domain/types';
import type { Deps } from '../context';
import { badRequest, conflict, forbidden, notFound, ruleViolation } from '../errors';
import { newId } from '../ids';
import { adminIds, audit, capacityJobs, getArtisan, getJob, getUser, insertJob, insertMessage, notify, saveJob, saveUser, systemMessage } from '../repo';
import type { Session } from '../auth';

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const iso = (deps: Deps) => new Date(deps.now()).toISOString();
type Party = 'customer' | 'artisan';

function partyOf(job: Job, s: Session): Party {
  if (s.userId === job.customerId) return 'customer';
  if (s.userId === job.artisanId) return 'artisan';
  throw forbidden('You are not part of this job.');
}

function addTimeline(deps: Deps, j: Job, label: string, by: Job['timeline'][number]['by']) {
  j.timeline = [...j.timeline, { at: iso(deps), label, by }];
}

/** What a viewer may see. The exact address is hidden from the artisan until escrow is funded. */
export function jobView(job: Job, viewer: Session): Job {
  if (viewer.role === 'admin' || viewer.userId === job.customerId || Esc.isLocationDisclosed(job)) return job;
  const a = job.address;
  return { ...job, address: { label: '', line1: '', area: a.area, city: a.city, state: a.state } };
}

export async function getJobFor(deps: Deps, s: Session, id: string) {
  const job = await getJob(deps, id);
  if (s.role !== 'admin') partyOf(job, s);
  return jobView(job, s);
}

export async function listJobs(deps: Deps, s: Session) {
  const col = s.role === 'artisan' ? 'artisan_id' : 'customer_id';
  const rows = await deps.db.query<{ data: Job }>(`SELECT data FROM jobs WHERE ${col} = $1 ORDER BY updated_at DESC LIMIT 200`, [s.userId]);
  return rows.map((r) => jobView(r.data, s));
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export interface CreateJobInput {
  artisanId: string;
  categoryId: string;
  title: string;
  description: string;
  window: TimeWindow;
  addressIndex: number;
  issueMediaIds: string[];
  workerId?: string;
  origin?: 'app' | 'ugent';
}

export async function createJob(deps: Deps, s: Session, input: CreateJobInput): Promise<Job> {
  if (s.role !== 'customer') throw forbidden('Only customers can book artisans.');
  const desc = `${input.title} ${input.description}`;
  const mod = moderateMessage(desc);
  if (!mod.allowed) throw ruleViolation(mod.warning!, 'message_blocked', { violations: mod.violations });
  return deps.db.tx(async (c) => {
    const artisan = await getArtisan(deps, input.artisanId, c, true); // lock: serialises bookings per artisan
    if ((artisan as Artisan & { suspended?: boolean }).suspended) throw ruleViolation('This artisan is not available.');
    const customer = await getUser<Customer>(deps, s.userId, c);
    const jobs = await capacityJobs(deps, [artisan.id], c);
    const check = bookableFor(jobs, artisan, input.categoryId, input.window);
    if (!check.ok) throw ruleViolation(check.reason!, 'not_bookable');
    if (new Date(input.window.start).getTime() < deps.now()) throw badRequest('Pick a time in the future.');
    const issuePhotos = await claimMedia(deps, c, s.userId, input.issueMediaIds, ['issue_photo']);
    const at = iso(deps);
    const job: Job = {
      id: newId('job'),
      customerId: customer.id,
      artisanId: artisan.id,
      workerId: input.workerId && check.workers.includes(input.workerId) ? input.workerId : undefined,
      categoryId: input.categoryId,
      title: input.title.trim() || category(input.categoryId).name,
      description: input.description.trim(),
      window: input.window,
      address: customer.addresses[input.addressIndex] ?? customer.addresses[0],
      size: category(input.categoryId).defaultSize,
      status: 'requested',
      pricePool: Pool.emptyPool(),
      escrow: { state: 'none', amount: 0 },
      issuePhotos,
      createdAt: at,
      updatedAt: at,
      timeline: [{ at, label: input.origin === 'ugent' ? 'Request sent by Ugent (confirmed by you)' : `Request sent to ${artisan.businessName ?? artisan.name}`, by: input.origin === 'ugent' ? 'ugent' : 'customer' }],
      origin: input.origin ?? 'app',
    };
    await insertJob(deps, job, c);
    await systemMessage(deps, job.id, 'Chat is protected by Sleek. Phone numbers, emails, links and off-app contact are blocked. Your exact address is shared only after you fund escrow.', c);
    for (const m of issuePhotos) await insertMessage(deps, { jobId: job.id, from: 'customer', kind: 'media', text: 'Photo of the issue', media: m }, c);
    await notify(deps, artisan.id, 'New job request', `${customer.name} needs ${categoryName(input.categoryId)} — ${job.title}.`, `/chat/${job.id}`, c);
    return job;
  });
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
export async function listMessages(deps: Deps, s: Session, jobId: string) {
  const job = await getJob(deps, jobId);
  if (s.role !== 'admin') partyOf(job, s);
  return (await deps.db.query<{ data: unknown }>('SELECT data FROM messages WHERE job_id = $1 ORDER BY created_at, id', [jobId])).map((r) => r.data);
}

export async function sendMessage(deps: Deps, s: Session, jobId: string, text: string) {
  const job = await getJob(deps, jobId);
  const party = partyOf(job, s);
  if (['completed', 'resolved', 'cancelled', 'declined'].includes(job.status)) throw ruleViolation('This job is closed. Chat is read-only.', 'chat_closed');
  const trimmed = text.trim();
  if (!trimmed) throw badRequest('Message is empty.');
  if (trimmed.length > 1000) throw badRequest('Message is too long.');
  const res = moderateMessage(trimmed);
  if (!res.allowed) {
    await recordViolation(deps, s.userId, party, jobId, res.violations, res.redacted);
    throw ruleViolation(res.warning!, 'message_blocked', { violations: res.violations });
  }
  return insertMessage(deps, { jobId, from: party, kind: 'text', text: trimmed });
}

export async function recordViolation(deps: Deps, userId: string, role: Party, jobId: string, types: string[], excerpt: string) {
  await deps.db.tx(async (c) => {
    const v = { id: newId('vio'), userId, role, jobId, types, excerpt, at: iso(deps), reviewed: false };
    await deps.db.query('INSERT INTO violations (id, user_id, data) VALUES ($1, $2, $3)', [v.id, userId, JSON.stringify(v)], c);
    if (role === 'artisan') {
      const a = await getArtisan(deps, userId, c, true);
      a.stats = { ...a.stats, ruleViolations: a.stats.ruleViolations + 1, lastViolationAt: iso(deps) };
      await saveUser(deps, a, c);
    }
  });
}

// ---------------------------------------------------------------------------
// Price Pool
// ---------------------------------------------------------------------------
async function withJob<T>(deps: Deps, jobId: string, fn: (job: Job, c: PoolClient) => Promise<T>): Promise<T> {
  return deps.db.tx(async (c) => fn(await getJob(deps, jobId, c, true), c));
}

function poolErr(e: unknown): never {
  if (e instanceof Pool.PricePoolError) throw ruleViolation(e.message, 'price_pool');
  throw e;
}

export async function proposePrice(deps: Deps, s: Session, jobId: string, amount: number, note?: string) {
  if (note) {
    const m = moderateMessage(note);
    if (!m.allowed) throw ruleViolation(m.warning!, 'message_blocked');
  }
  return withJob(deps, jobId, async (job, c) => {
    const party = partyOf(job, s);
    if (job.status !== 'requested') throw ruleViolation('The price can only be negotiated before it is locked.', 'price_pool');
    const counter = job.pricePool.offers.some((o) => o.status === 'pending');
    const offerId = newId('off');
    try {
      job.pricePool = Pool.propose(job.pricePool, party, amount, offerId, iso(deps), note?.trim() || undefined);
    } catch (e) {
      poolErr(e);
    }
    await saveJob(deps, job, c);
    await insertMessage(deps, { jobId, from: party, kind: 'price', text: `${counter ? 'Counter-offer' : 'Proposed'} ${naira(amount)}`, offerId }, c);
    await notify(deps, party === 'customer' ? job.artisanId : job.customerId, counter ? 'Counter-offer received' : 'New price offer', `${naira(amount)} for “${job.title}”.`, `/chat/${jobId}`, c);
    return jobView(job, s);
  });
}

export async function acceptPrice(deps: Deps, s: Session, jobId: string) {
  return withJob(deps, jobId, async (job, c) => {
    const party = partyOf(job, s);
    try {
      job.pricePool = Pool.accept(job.pricePool, party, iso(deps));
    } catch (e) {
      poolErr(e);
    }
    const amount = job.pricePool.locked!.amount;
    job.status = 'price_agreed';
    job.size = Esc.classifyJobSize(amount, job.window.start, job.window.end, category(job.categoryId).defaultSize);
    addTimeline(deps, job, `Price locked at ${naira(amount)}`, party);
    await saveJob(deps, job, c);
    await systemMessage(deps, jobId, `Price locked at ${naira(amount)}. This is now permanent for this job. Next: the customer pays into Sleek Escrow.`, c);
    await notify(deps, party === 'customer' ? job.artisanId : job.customerId, 'Price agreed', `${naira(amount)} locked for “${job.title}”.`, `/job/${jobId}`, c);
    return jobView(job, s);
  });
}

export async function withdrawOffer(deps: Deps, s: Session, jobId: string) {
  return withJob(deps, jobId, async (job, c) => {
    const party = partyOf(job, s);
    try {
      job.pricePool = Pool.withdraw(job.pricePool, party);
    } catch (e) {
      poolErr(e);
    }
    await saveJob(deps, job, c);
    await systemMessage(deps, jobId, `${party === 'customer' ? 'Customer' : 'Artisan'} withdrew their offer.`, c);
    return jobView(job, s);
  });
}

export async function declineJob(deps: Deps, s: Session, jobId: string, reason: string) {
  return withJob(deps, jobId, async (job, c) => {
    if (partyOf(job, s) !== 'artisan') throw forbidden('Only the artisan can decline.');
    if (job.status !== 'requested' && job.status !== 'price_agreed') throw ruleViolation('This job can no longer be declined. Use cancel instead.');
    job.status = 'declined';
    addTimeline(deps, job, `Artisan declined: ${reason}`, 'artisan');
    await saveJob(deps, job, c);
    await systemMessage(deps, jobId, 'The artisan declined this request. No payment was taken.', c);
    await notify(deps, job.customerId, 'Request declined', `“${job.title}” was declined. Try another available artisan.`, `/job/${jobId}`, c);
    return jobView(job, s);
  });
}

// ---------------------------------------------------------------------------
// Escrow funding (two steps: init checkout → signed webhook confirms)
// ---------------------------------------------------------------------------
export async function initEscrowPayment(deps: Deps, s: Session, jobId: string) {
  const job = await getJob(deps, jobId);
  if (partyOf(job, s) !== 'customer') throw forbidden('Only the customer can fund escrow.');
  if (!Esc.canFund(job)) throw ruleViolation('Agree a price in the Price Pool before paying into escrow.', 'cannot_fund');
  const artisan = await getArtisan(deps, job.artisanId);
  const others = await capacityJobs(deps, [artisan.id]);
  if (!pickWorker(artisan, others, job)) throw ruleViolation('This artisan was just booked for an overlapping time. Please choose another time.', 'slot_taken');
  const amount = job.pricePool.locked!.amount;
  const reference = newId('esc');
  await deps.db.query("INSERT INTO payments (reference, kind, target_id, user_id, amount, status) VALUES ($1, 'escrow', $2, $3, $4, 'pending')", [reference, jobId, s.userId, amount]);
  const checkout = await deps.payments.initializeCharge({
    reference,
    amount,
    email: `${s.userId}@${deps.cfg.customerEmailDomain}`,
    callbackUrl: deps.cfg.paystackCallbackUrl,
    metadata: { jobId, kind: 'escrow' },
  });
  return { reference, amount, authorizationUrl: checkout.authorizationUrl, accessCode: checkout.accessCode };
}

/** Returns the worker that will do the job, or null if nobody qualified is free. */
function pickWorker(artisan: Artisan, capacity: Job[], job: Job): string | null {
  const others = capacity.filter((j) => j.id !== job.id);
  if (artisan.accountType !== 'individual' && artisan.workers.length) {
    const free = freeWorkersFor(others, artisan, job.categoryId, job.window);
    if (job.workerId && free.includes(job.workerId)) return job.workerId;
    return free[0] ?? null;
  }
  return workerFreeFor(others, artisan, artisan.id, job.window) ? artisan.id : null;
}

type SideEffect = () => Promise<void>;

/**
 * Called from the PSP webhook (after signature verification) or a manual verify.
 * Idempotent: a reference is processed once.
 */
export async function handleChargeSuccess(deps: Deps, reference: string, paidAmount: number): Promise<{ outcome: string }> {
  const effects: SideEffect[] = [];
  const outcome = await deps.db.tx(async (c) => {
    const pay = await deps.db.one<{ kind: string; target_id: string; amount: string; status: string; user_id: string }>('SELECT * FROM payments WHERE reference = $1 FOR UPDATE', [reference], c);
    if (!pay) return 'unknown_reference';
    if (pay.status !== 'pending') return `already_${pay.status}`;
    const expected = Number(pay.amount);
    if (paidAmount !== expected) {
      await deps.db.query("UPDATE payments SET status = 'amount_mismatch', data = $2, updated_at = now() WHERE reference = $1", [reference, JSON.stringify({ paidAmount })], c);
      effects.push(() => issueRefund(deps, reference, paidAmount, pay.target_id, 'Amount did not match the locked price'));
      return 'amount_mismatch';
    }
    if (pay.kind === 'order') {
      await deps.db.query("UPDATE payments SET status = 'success', updated_at = now() WHERE reference = $1", [reference], c);
      const row = await deps.db.one<{ data: { timeline: { at: string; label: string }[] } }>('SELECT data FROM orders WHERE id = $1 FOR UPDATE', [pay.target_id], c);
      if (row) {
        const data = { ...row.data, status: 'confirmed', paymentRef: reference, timeline: [...row.data.timeline, { at: iso(deps), label: 'Payment received — vendor confirmed your order' }] };
        await deps.db.query("UPDATE orders SET status = 'confirmed', data = $2 WHERE id = $1", [pay.target_id, JSON.stringify(data)], c);
        await notify(deps, pay.user_id, 'Order confirmed', `Order #${pay.target_id.slice(-6).toUpperCase()} is paid and confirmed.`, `/orders/${pay.target_id}`, c);
      }
      return 'order_paid';
    }
    // escrow
    const job0 = await getJob(deps, pay.target_id, c);
    const artisan = await getArtisan(deps, job0.artisanId, c, true); // lock artisan first (same order as createJob)
    const job = await getJob(deps, pay.target_id, c, true);
    const capacity = await capacityJobs(deps, [artisan.id], c);
    const worker = Esc.canFund(job) ? pickWorker(artisan, capacity, job) : null;
    if (!worker) {
      await deps.db.query("UPDATE payments SET status = 'refund_due', updated_at = now() WHERE reference = $1", [reference], c);
      effects.push(() => issueRefund(deps, reference, paidAmount, job.id, 'Slot no longer available'));
      await notify(deps, job.customerId, 'Payment refunded', `The artisan was booked for that time before your payment completed. ${naira(paidAmount)} is being refunded.`, `/job/${job.id}`, c);
      return 'refunded_slot_taken';
    }
    await deps.db.query("UPDATE payments SET status = 'success', updated_at = now() WHERE reference = $1", [reference], c);
    job.escrow = Esc.fundEscrow(job, reference, iso(deps));
    job.status = 'funded';
    if (artisan.accountType !== 'individual' && artisan.workers.length) job.workerId = worker;
    addTimeline(deps, job, `${naira(job.escrow.amount)} paid into Sleek Escrow`, 'customer');
    await saveJob(deps, job, c);
    await systemMessage(deps, job.id, `Escrow funded: ${naira(job.escrow.amount)} is held safely by Sleek. The job address is now shared with the artisan.`, c);
    await notify(deps, artisan.id, 'Escrow funded — job confirmed', `${naira(job.escrow.amount)} is held for “${job.title}”. Address unlocked.`, `/job/${job.id}`, c);
    await notify(deps, job.customerId, 'Payment secured', `${naira(job.escrow.amount)} is held in escrow for “${job.title}”.`, `/job/${job.id}`, c);
    await audit(deps, job.customerId, 'escrow.funded', job.id, { reference, amount: paidAmount }, c);
    return 'funded';
  });
  for (const e of effects) await e();
  return { outcome };
}

export async function handleChargeFailed(deps: Deps, reference: string) {
  await deps.db.query("UPDATE payments SET status = 'failed', updated_at = now() WHERE reference = $1 AND status = 'pending'", [reference]);
}

/** Refunds always go back to the original charge. Failures are surfaced to admins for manual handling. */
export async function issueRefund(deps: Deps, chargeRef: string, amount: number, targetId: string, reason: string) {
  if (amount <= 0) return;
  const ref = `${chargeRef}_rf${Date.now().toString(36)}`;
  const charge = await deps.db.one<{ user_id: string }>('SELECT user_id FROM payments WHERE reference = $1', [chargeRef]);
  await deps.db.query("INSERT INTO payments (reference, kind, target_id, user_id, amount, status, data) VALUES ($1, 'refund', $2, $3, $4, 'processing', $5)", [ref, targetId, charge?.user_id ?? 'unknown', amount, JSON.stringify({ chargeRef, reason })]);
  const r = await deps.payments.refund({ reference: chargeRef, amount });
  if (!r.ok) {
    await deps.db.query("UPDATE payments SET status = 'failed', data = data || $2 WHERE reference = $1", [ref, JSON.stringify({ error: r.error })]);
    for (const id of await adminIds(deps)) await notify(deps, id, 'Refund failed — action needed', `${naira(amount)} for ${targetId}: ${r.error}`, '/admin');
    await audit(deps, null, 'refund.failed', targetId, { chargeRef, amount, error: r.error });
  }
}

// ---------------------------------------------------------------------------
// Doing the work
// ---------------------------------------------------------------------------
export async function assignWorker(deps: Deps, s: Session, jobId: string, workerId: string) {
  return deps.db.tx(async (c) => {
    const job0 = await getJob(deps, jobId, c);
    if (partyOf(job0, s) !== 'artisan') throw forbidden('Only the account owner can assign workers.');
    const artisan = await getArtisan(deps, job0.artisanId, c, true);
    const job = await getJob(deps, jobId, c, true);
    if (!workerSkillApproved(artisan, workerId, job.categoryId)) throw ruleViolation('This worker is not verified for this skill.');
    const others = (await capacityJobs(deps, [artisan.id], c)).filter((j) => j.id !== jobId);
    if (!workerFreeFor(others, artisan, workerId, job.window)) throw ruleViolation('This worker already has a job at an overlapping time.');
    const w = artisan.workers.find((x) => x.id === workerId);
    job.workerId = workerId;
    addTimeline(deps, job, `Assigned to ${w?.name ?? 'worker'}`, 'artisan');
    await saveJob(deps, job, c);
    await systemMessage(deps, jobId, `${w?.name ?? 'A verified worker'} from ${artisan.businessName ?? artisan.name} has been assigned to this job.`, c);
    return jobView(job, s);
  });
}

export async function startJob(deps: Deps, s: Session, jobId: string) {
  return withJob(deps, jobId, async (job, c) => {
    if (partyOf(job, s) !== 'artisan') throw forbidden('Only the artisan can start the job.');
    if (!Esc.canStart(job, deps.now())) throw ruleViolation('You can start from 1 hour before the agreed time, once escrow is funded.', 'cannot_start');
    job.status = 'in_progress';
    addTimeline(deps, job, 'Artisan started work', 'artisan');
    await saveJob(deps, job, c);
    await systemMessage(deps, jobId, 'The artisan has started work.', c);
    await notify(deps, job.customerId, 'Work started', `Your artisan has started “${job.title}”.`, `/job/${jobId}`, c);
    return jobView(job, s);
  });
}

/** Turn uploaded media IDs into job evidence. Only the uploader's own media with an allowed purpose can be used, once. */
async function claimMedia(deps: Deps, c: PoolClient, userId: string, ids: string[], purposes: UploadPurpose[]): Promise<CapturedMedia[]> {
  if (!ids.length) return [];
  const rows = await deps.db.query<{ id: string; purpose: UploadPurpose; data: CapturedMedia & { claimed?: boolean } }>('SELECT id, purpose, data FROM media WHERE id = ANY($1) AND user_id = $2 FOR UPDATE', [ids, userId], c);
  if (rows.length !== ids.length) throw badRequest('Some photos were not found. Take them again.');
  for (const r of rows) {
    if (!purposes.includes(r.purpose)) throw ruleViolation(`That photo was taken for “${r.purpose}” and can’t be used here.`, 'upload_not_allowed');
    if (r.data.claimed) throw ruleViolation('A photo can only be used once.', 'upload_not_allowed');
    await deps.db.query('UPDATE media SET data = data || \'{"claimed":true}\' WHERE id = $1', [r.id], c);
  }
  return rows.map((r) => ({ id: r.data.id, uri: r.data.uri, purpose: r.data.purpose, capturedAt: r.data.capturedAt, loggedBy: r.data.loggedBy }));
}

export async function addJobPhoto(deps: Deps, s: Session, jobId: string, mediaId: string) {
  return withJob(deps, jobId, async (job, c) => {
    const party = partyOf(job, s);
    const allowed = party === 'customer' ? ['requested', 'price_agreed', 'funded'] : ['funded', 'in_progress'];
    if (!allowed.includes(job.status)) throw ruleViolation('Photos can’t be added at this stage.', 'upload_not_allowed');
    const [m] = await claimMedia(deps, c, s.userId, [mediaId], party === 'customer' ? ['issue_photo'] : ['site_before']);
    job.issuePhotos = [...job.issuePhotos, m];
    await saveJob(deps, job, c);
    return insertMessage(deps, { jobId, from: party, kind: 'media', text: m.purpose === 'issue_photo' ? 'Photo of the issue' : 'Site photo before work', media: m }, c);
  });
}

export async function submitProof(deps: Deps, s: Session, jobId: string, mediaIds: string[], note: string) {
  const mod = moderateMessage(note);
  if (!mod.allowed) throw ruleViolation(mod.warning!, 'message_blocked');
  return withJob(deps, jobId, async (job, c) => {
    if (partyOf(job, s) !== 'artisan') throw forbidden('Only the artisan can upload proof of work.');
    if (!Esc.canSubmitProof(job)) throw ruleViolation('Start the job before uploading proof of work.', 'cannot_submit_proof');
    if (!mediaIds.length) throw ruleViolation('Add at least one photo of the finished work.');
    const photos = await claimMedia(deps, c, s.userId, mediaIds, ['proof_of_work']);
    const submittedAt = iso(deps);
    job.proof = { photos, note: note.trim(), submittedAt, autoReleaseAt: Esc.autoReleaseAt(submittedAt, job.size) };
    job.status = 'proof_submitted';
    addTimeline(deps, job, 'Proof of work uploaded', 'artisan');
    await saveJob(deps, job, c);
    const h = Esc.AUTO_RELEASE_HOURS[job.size];
    await systemMessage(deps, jobId, `Proof of work uploaded. The customer has ${h} hours to approve or dispute, after which payment is released automatically.`, c);
    await notify(deps, job.customerId, 'Please review the work', `Proof of work for “${job.title}” is ready. Approve or raise a dispute within ${h}h.`, `/proof/${jobId}`, c);
    return jobView(job, s);
  });
}

/** Release escrow to the artisan. The ledger's unique (job_id, type) index makes double release impossible. */
async function releaseInTx(deps: Deps, c: PoolClient, job: Job, reason: 'customer_approved' | 'auto_release') {
  const artisan = await getArtisan(deps, job.artisanId, c, true);
  job.escrow = Esc.release(job.escrow, isTrusted(artisan, deps.now()), reason, iso(deps));
  job.status = 'completed';
  addTimeline(deps, job, reason === 'auto_release' ? 'No response from customer — payment auto-released' : 'Customer approved — payment released', 'system');
  await saveJob(deps, job, c);
  await deps.db.query("INSERT INTO ledger (id, artisan_id, job_id, type, amount, note) VALUES ($1, $2, $3, 'escrow_release', $4, $5)", [newId('led'), artisan.id, job.id, job.escrow.releasedToArtisan, job.title], c);
  artisan.stats = { ...artisan.stats, completedJobs: artisan.stats.completedJobs + 1 };
  await saveUser(deps, artisan, c);
  await systemMessage(deps, job.id, `Payment released: ${naira(job.escrow.releasedToArtisan!)} to the artisan (Sleek commission ${naira(job.escrow.commission!)}).`, c);
  await notify(deps, artisan.id, 'Payment released', `${naira(job.escrow.releasedToArtisan!)} for “${job.title}” is now in your earnings.`, '/earnings', c);
  await notify(deps, job.customerId, reason === 'auto_release' ? 'Payment auto-released' : 'Job completed', `“${job.title}” is complete. Please rate your artisan.`, `/review/${job.id}`, c);
  await audit(deps, reason === 'auto_release' ? null : job.customerId, `escrow.${reason}`, job.id, { amount: job.escrow.amount }, c);
}

export async function approveJob(deps: Deps, s: Session, jobId: string) {
  return withJob(deps, jobId, async (job, c) => {
    if (partyOf(job, s) !== 'customer') throw forbidden('Only the customer can approve.');
    if (!Esc.canApprove(job)) throw ruleViolation('There is nothing to approve yet.', 'cannot_approve');
    await releaseInTx(deps, c, job, 'customer_approved');
    return jobView(job, s);
  });
}

/** Scheduler: release every job whose auto-release time has passed. */
export async function runAutoRelease(deps: Deps): Promise<string[]> {
  const due = await deps.db.query<{ id: string }>("SELECT id FROM jobs WHERE status = 'proof_submitted' AND (data->'proof'->>'autoReleaseAt')::timestamptz <= $1", [iso(deps)]);
  const released: string[] = [];
  for (const { id } of due) {
    await deps.db.tx(async (c) => {
      const job = await getJob(deps, id, c, true);
      if (!Esc.dueForAutoRelease(job, deps.now())) return;
      await releaseInTx(deps, c, job, 'auto_release');
      released.push(id);
    });
  }
  return released;
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------
export async function quoteCancellation(deps: Deps, s: Session, jobId: string) {
  const job = await getJob(deps, jobId);
  return Esc.quoteCancellation(job, partyOf(job, s), deps.now());
}

export async function cancelJob(deps: Deps, s: Session, jobId: string, reason: string, opts: { system?: boolean } = {}) {
  if (!opts.system && reason.trim().length < 3) throw badRequest('Give a short reason.');
  const effects: SideEffect[] = [];
  const out = await withJob(deps, jobId, async (job, c) => {
    const party: 'customer' | 'artisan' | 'admin' = opts.system ? 'admin' : partyOf(job, s);
    let applied;
    try {
      applied = Esc.applyCancellation(job, party, reason, deps.now());
    } catch (e) {
      if (e instanceof Esc.EscrowRuleError) throw ruleViolation(e.message, 'cannot_cancel');
      throw e;
    }
    const q = party === 'admin' ? { trustPenalty: false } : Esc.quoteCancellation(job, party, deps.now());
    const chargeRef = job.escrow.paymentRef;
    job.escrow = applied.escrow;
    job.cancellation = applied.record;
    job.status = 'cancelled';
    addTimeline(deps, job, `Cancelled by ${party}: ${reason}`, party === 'admin' ? 'system' : party);
    await saveJob(deps, job, c);
    if (applied.record.artisanCompensation > 0) {
      await deps.db.query("INSERT INTO ledger (id, artisan_id, job_id, type, amount, note) VALUES ($1, $2, $3, 'cancellation_fee', $4, $5)", [newId('led'), job.artisanId, job.id, applied.record.artisanCompensation, `Late cancellation: ${job.title}`], c);
    }
    if (q.trustPenalty) {
      const a = await getArtisan(deps, job.artisanId, c, true);
      a.stats = { ...a.stats, cancelledByArtisan: a.stats.cancelledByArtisan + 1 };
      await saveUser(deps, a, c);
    }
    if (chargeRef && applied.record.refundAmount > 0) effects.push(() => issueRefund(deps, chargeRef, applied.record.refundAmount, job.id, `Cancelled by ${party}`));
    await systemMessage(deps, jobId, `Job cancelled by the ${party}. ${applied.record.refundAmount ? `${naira(applied.record.refundAmount)} refunded to the customer.` : 'No payment was taken.'}`, c);
    if (party !== 'customer') await notify(deps, job.customerId, 'Job cancelled', `“${job.title}” was cancelled.`, `/job/${jobId}`, c);
    if (party !== 'artisan') await notify(deps, job.artisanId, 'Job cancelled', `“${job.title}” was cancelled.`, `/job/${jobId}`, c);
    return jobView(job, s);
  });
  for (const e of effects) await e();
  return out;
}

/** Scheduler: unpaid locked prices expire after 24h so the request doesn't linger. */
export async function expireUnpaid(deps: Deps): Promise<string[]> {
  const cutoff = new Date(deps.now() - 24 * 3_600_000).toISOString();
  const rows = await deps.db.query<{ id: string }>("SELECT id FROM jobs WHERE status = 'price_agreed' AND (data->'pricePool'->'locked'->>'lockedAt')::timestamptz <= $1", [cutoff]);
  for (const r of rows) await cancelJob(deps, { userId: 'system', role: 'admin', scope: 'user' }, r.id, 'Not paid within 24 hours of agreeing the price', { system: true });
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------
export async function submitReview(deps: Deps, s: Session, jobId: string, rating: number, comment: string) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw badRequest('Choose a rating from 1 to 5.');
  const m = moderateMessage(comment);
  if (!m.allowed) throw ruleViolation(m.warning!, 'message_blocked');
  return withJob(deps, jobId, async (job, c) => {
    if (partyOf(job, s) !== 'customer') throw forbidden('Only the customer can review.');
    if (job.status !== 'completed' && job.status !== 'resolved') throw ruleViolation('You can review once the job is complete.');
    if (job.reviewId) throw conflict('You have already reviewed this job.');
    const customer = await getUser<Customer>(deps, job.customerId, c);
    const [first, last] = customer.name.split(' ');
    const r: Review = { id: newId('rev'), jobId, artisanId: job.artisanId, customerName: `${first} ${last?.[0] ?? ''}.`.trim(), rating, comment: comment.trim(), categoryId: job.categoryId, at: iso(deps) };
    await deps.db.query('INSERT INTO reviews (id, job_id, artisan_id, data) VALUES ($1, $2, $3, $4)', [r.id, jobId, job.artisanId, JSON.stringify(r)], c);
    job.reviewId = r.id;
    await saveJob(deps, job, c);
    const a = await getArtisan(deps, job.artisanId, c, true);
    a.stats = { ...a.stats, ratingSum: a.stats.ratingSum + rating, ratingCount: a.stats.ratingCount + 1 };
    await saveUser(deps, a, c);
    await notify(deps, job.artisanId, 'New review', `${rating}★ — “${comment.slice(0, 60)}”`, `/artisan/${job.artisanId}`, c);
    return r;
  });
}

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------
export async function openDispute(deps: Deps, s: Session, jobId: string, reason: DisputeReason, details: string, evidenceMediaIds: string[]) {
  if (details.trim().length < 15) throw badRequest('Please describe the problem in a few sentences (at least 15 characters).');
  return withJob(deps, jobId, async (job, c) => {
    const party = partyOf(job, s);
    if (!Esc.canDispute(job)) throw ruleViolation('Disputes can be opened while money is held in escrow.', 'cannot_dispute');
    const evidence = await claimMedia(deps, c, s.userId, evidenceMediaIds, ['dispute_evidence']);
    const d: Dispute = { id: newId('dsp'), jobId, openedBy: party, reason, details: details.trim(), evidence, status: 'open', openedAt: iso(deps) };
    await deps.db.query('INSERT INTO disputes (id, job_id, status, data) VALUES ($1, $2, $3, $4)', [d.id, jobId, d.status, JSON.stringify(d)], c);
    job.status = 'disputed';
    job.disputeId = d.id;
    job.escrow = { ...job.escrow, state: 'frozen' };
    addTimeline(deps, job, `Dispute opened by ${party}`, party);
    await saveJob(deps, job, c);
    if (party === 'customer') {
      const a = await getArtisan(deps, job.artisanId, c, true);
      a.stats = { ...a.stats, disputesOpened: a.stats.disputesOpened + 1 };
      await saveUser(deps, a, c);
    }
    await systemMessage(deps, jobId, 'A dispute has been opened. The money stays in escrow until Sleek reviews the chat history and proof of work. This usually takes 1–3 working days.', c);
    await notify(deps, party === 'customer' ? job.artisanId : job.customerId, 'Dispute opened', `A dispute was opened on “${job.title}”. Add your side of the story.`, `/dispute/${jobId}`, c);
    for (const id of await adminIds(deps)) await notify(deps, id, 'New dispute', `${job.title} — ${naira(job.escrow.amount)} frozen`, `/resolve/${d.id}`, c);
    return d;
  });
}

export async function getDisputeForJob(deps: Deps, s: Session, jobId: string) {
  const job = await getJob(deps, jobId);
  if (s.role !== 'admin') partyOf(job, s);
  const row = await deps.db.one<{ data: Dispute }>('SELECT data FROM disputes WHERE job_id = $1', [jobId]);
  if (!row) throw notFound('No dispute on this job');
  return row.data;
}

export async function respondDispute(deps: Deps, s: Session, disputeId: string, text: string) {
  const m = moderateMessage(text);
  if (!m.allowed) throw ruleViolation(m.warning!, 'message_blocked');
  return deps.db.tx(async (c) => {
    const row = await deps.db.one<{ data: Dispute }>('SELECT data FROM disputes WHERE id = $1 FOR UPDATE', [disputeId], c);
    if (!row) throw notFound('Dispute not found');
    const job = await getJob(deps, row.data.jobId, c);
    if (partyOf(job, s) === row.data.openedBy) throw forbidden('The other party responds to a dispute.');
    if (row.data.status === 'resolved') throw ruleViolation('This dispute is already resolved.');
    const d = { ...row.data, artisanResponse: text.trim() };
    await deps.db.query('UPDATE disputes SET data = $2 WHERE id = $1', [disputeId, JSON.stringify(d)], c);
    return d;
  });
}

export async function resolveDispute(deps: Deps, s: Session, disputeId: string, outcome: DisputeOutcome, artisanShare: number, note: string) {
  if (s.role !== 'admin') throw forbidden('Admins only.');
  if (note.trim().length < 10) throw badRequest('Add a short explanation for both parties.');
  const effects: SideEffect[] = [];
  const result = await deps.db.tx(async (c) => {
    const row = await deps.db.one<{ data: Dispute }>('SELECT data FROM disputes WHERE id = $1 FOR UPDATE', [disputeId], c);
    if (!row) throw notFound('Dispute not found');
    if (row.data.status === 'resolved') throw conflict('Already resolved.');
    const job = await getJob(deps, row.data.jobId, c, true);
    const artisan = await getArtisan(deps, job.artisanId, c, true);
    const share = outcome === 'release_to_artisan' ? 1 : outcome === 'refund_customer' ? 0 : Math.min(1, Math.max(0, artisanShare));
    const chargeRef = job.escrow.paymentRef;
    job.escrow = Esc.resolveDisputeEscrow(job.escrow, share, isTrusted(artisan, deps.now()), iso(deps));
    job.status = 'resolved';
    addTimeline(deps, job, 'Dispute resolved by Sleek', 'admin');
    await saveJob(deps, job, c);
    const d: Dispute = { ...row.data, status: 'resolved', resolution: { outcome, artisanShare: share, note: note.trim(), by: s.userId, at: iso(deps) } };
    await deps.db.query("UPDATE disputes SET status = 'resolved', data = $2 WHERE id = $1", [disputeId, JSON.stringify(d)], c);
    if (job.escrow.releasedToArtisan) {
      await deps.db.query("INSERT INTO ledger (id, artisan_id, job_id, type, amount, note) VALUES ($1, $2, $3, 'escrow_release', $4, $5)", [newId('led'), artisan.id, job.id, job.escrow.releasedToArtisan, `Dispute resolution: ${job.title}`], c);
    }
    artisan.stats = share < 0.5 ? { ...artisan.stats, disputesLost: artisan.stats.disputesLost + 1 } : { ...artisan.stats, completedJobs: artisan.stats.completedJobs + 1 };
    await saveUser(deps, artisan, c);
    if (chargeRef && job.escrow.refundedToCustomer) effects.push(() => issueRefund(deps, chargeRef, job.escrow.refundedToCustomer!, job.id, 'Dispute resolution'));
    await systemMessage(deps, job.id, `Dispute resolved by Sleek. Artisan receives ${naira(job.escrow.releasedToArtisan ?? 0)}; customer refunded ${naira(job.escrow.refundedToCustomer ?? 0)}. Note: ${note.trim()}`, c);
    for (const uid of [job.customerId, artisan.id]) await notify(deps, uid, 'Dispute resolved', `Decision on “${job.title}”: ${note.trim().slice(0, 80)}`, `/dispute/${job.id}`, c);
    await audit(deps, s.userId, 'dispute.resolved', disputeId, { outcome, share }, c);
    return { dispute: d, job };
  });
  for (const e of effects) await e();
  return result;
}
