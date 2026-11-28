/**
 * v2 features on the server: en-route, more-time requests, tips, two-way
 * reviews, safety alerts, favourites, matching & notification preferences,
 * referrals, time off, payout schedules, protection claims, admin notes,
 * worker management, business onboarding, certificates and insights.
 * All rules come from ../../../src/domain.
 */
import type { PoolClient } from 'pg';
import { category } from '../../../src/data/categories';
import { validateCustomerReview } from '../../../src/domain/customerRating';
import { ACTIVE_STATUSES } from '../../../src/domain/escrow';
import { extensionClashes, pendingExtension, validateExtension } from '../../../src/domain/extensions';
import { artisanInsights } from '../../../src/domain/insights';
import { applyPreferences, DEFAULT_PREFS } from '../../../src/domain/matching';
import { moderateMessage } from '../../../src/domain/moderation';
import { DEFAULT_NOTIFICATION_PREFS } from '../../../src/domain/notifications';
import { autoPayoutDue, DEFAULT_SCHEDULE } from '../../../src/domain/payouts';
import { protectionCover, protectionEligible, protectionWindow } from '../../../src/domain/protection';
import { searchAvailable } from '../../../src/domain/ranking';
import { isValidReferralCode, makeReferralCode, referralQualifies, REFERRAL_REWARD } from '../../../src/domain/referrals';
import { canMarkEnRoute } from '../../../src/domain/timeline';
import { validateTip } from '../../../src/domain/tips';
import { categoryName } from '../../../src/data/categories';
import type { Artisan, BusinessDetails, Customer, CustomerReview, Job, LedgerEntry, MatchingPrefs, NotificationCategory, NotificationPrefs, PayoutSchedule, Review, SafetyAlert, SafetyAlertKind, TimeWindow } from '../../../src/domain/types';
import type { Session } from '../auth';
import type { Deps } from '../context';
import { badRequest, conflict, forbidden, notFound, ruleViolation } from '../errors';
import { newId } from '../ids';
import { adminIds, audit, capacityJobs, getArtisan, getJob, getUser, listArtisans, notify, saveJob, saveUser, systemMessage } from '../repo';
import { publicArtisan, requestPayout } from './artisans';
import { issueRefund, jobView } from './jobs';

const iso = (deps: Deps) => new Date(deps.now()).toISOString();
const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

async function lockedJobFor(deps: Deps, c: PoolClient, s: Session, jobId: string, as: 'customer' | 'artisan') {
  const job = await getJob(deps, jobId, c, true);
  if ((as === 'customer' ? job.customerId : job.artisanId) !== s.userId) throw forbidden(`Only the ${as} can do this.`);
  return job;
}
const tl = (deps: Deps, j: Job, label: string, by: Job['timeline'][number]['by']) => (j.timeline = [...j.timeline, { at: iso(deps), label, by }]);

// ---- job progress -------------------------------------------------------------
export async function markEnRoute(deps: Deps, s: Session, jobId: string) {
  return deps.db.tx(async (c) => {
    const job = await lockedJobFor(deps, c, s, jobId, 'artisan');
    if (!canMarkEnRoute(job, deps.now())) throw ruleViolation('You can mark “on my way” from 3 hours before the job, once Sleek Hold is funded.', 'cannot_en_route');
    job.enRouteAt = iso(deps);
    tl(deps, job, 'Artisan is on the way', 'artisan');
    await saveJob(deps, job, c);
    await systemMessage(deps, jobId, 'The artisan is on the way.', c);
    await notify(deps, job.customerId, 'Your artisan is on the way', `For “${job.title}”.`, `/job/${jobId}`, c, 'job_progress');
    return jobView(job, s);
  });
}

export async function requestExtension(deps: Deps, s: Session, jobId: string, extraMinutes: number, reason: string) {
  const m = moderateMessage(reason);
  if (!m.allowed) throw ruleViolation(m.warning!, 'message_blocked');
  return deps.db.tx(async (c) => {
    const job = await lockedJobFor(deps, c, s, jobId, 'artisan');
    const err = validateExtension(job, extraMinutes, reason);
    if (err) throw ruleViolation(err, 'extension');
    if (extensionClashes(job, extraMinutes, await capacityJobs(deps, [job.artisanId], c))) throw ruleViolation('That would overlap your next booking. Ask for less time.', 'extension_clash');
    const newEnd = new Date(new Date(job.window.end).getTime() + extraMinutes * 60_000).toISOString();
    job.extensions = [...(job.extensions ?? []), { id: newId('ext'), extraMinutes, newEnd, reason: reason.trim(), status: 'pending', at: iso(deps) }];
    tl(deps, job, `Artisan asked for ${extraMinutes} more minutes`, 'artisan');
    await saveJob(deps, job, c);
    await systemMessage(deps, jobId, `The artisan is asking for ${extraMinutes} more minutes: “${reason.trim()}”.`, c);
    await notify(deps, job.customerId, 'Artisan needs more time', `${extraMinutes} more minutes for “${job.title}”.`, `/job/${jobId}`, c, 'job_progress');
    return jobView(job, s);
  });
}

export async function decideExtension(deps: Deps, s: Session, jobId: string, approve: boolean) {
  return deps.db.tx(async (c) => {
    const j0 = await getJob(deps, jobId, c);
    if (j0.customerId !== s.userId) throw forbidden('Only the customer can approve more time.');
    await getArtisan(deps, j0.artisanId, c, true); // serialise against new bookings for this artisan
    const job = await getJob(deps, jobId, c, true);
    const req = pendingExtension(job);
    if (!req) throw notFound('There is no request waiting.');
    if (approve && extensionClashes(job, req.extraMinutes, await capacityJobs(deps, [job.artisanId], c))) throw ruleViolation('The artisan has another booking right after — decline and agree a follow-up job instead.', 'extension_clash');
    if (approve) {
      job.window = { ...job.window, end: req.newEnd };
      await deps.db.query('UPDATE jobs SET window_end = $2 WHERE id = $1', [job.id, req.newEnd], c);
    }
    job.extensions = (job.extensions ?? []).map((e) => (e.id === req.id ? { ...e, status: approve ? 'approved' : 'declined', decidedAt: iso(deps) } : e));
    tl(deps, job, approve ? `More time approved (+${req.extraMinutes} min)` : 'More time declined', 'customer');
    await saveJob(deps, job, c);
    await systemMessage(deps, jobId, approve ? `Customer approved ${req.extraMinutes} more minutes. The price stays the same.` : 'Customer declined the request for more time.', c);
    await notify(deps, job.artisanId, approve ? 'More time approved' : 'More time declined', `“${job.title}”`, `/job/${jobId}`, c, 'job_progress');
    return jobView(job, s);
  });
}

// ---- tips (paid through the PSP; credited when the charge is confirmed) ---------
export async function initTip(deps: Deps, s: Session, jobId: string, amount: number) {
  const job = await getJob(deps, jobId);
  if (job.customerId !== s.userId) throw forbidden('Only the customer can tip.');
  const err = validateTip(job, amount);
  if (err) throw ruleViolation(err, 'tip');
  const reference = newId('tip');
  await deps.db.query("INSERT INTO payments (reference, kind, target_id, user_id, amount, status) VALUES ($1, 'tip', $2, $3, $4, 'pending')", [reference, jobId, s.userId, amount]);
  const checkout = await deps.payments.initializeCharge({ reference, amount, email: `${s.userId}@${deps.cfg.customerEmailDomain}`, callbackUrl: deps.cfg.paystackCallbackUrl, metadata: { jobId, kind: 'tip' } });
  return { reference, amount, authorizationUrl: checkout.authorizationUrl };
}

/** Called from handleChargeSuccess for kind = 'tip'. 100% to the artisan; the ledger index allows one tip per job. */
export async function creditTip(deps: Deps, c: PoolClient, reference: string, jobId: string, amount: number) {
  const job = await getJob(deps, jobId, c, true);
  if (job.tip) return 'already_tipped';
  job.tip = { amount, at: iso(deps), reference };
  tl(deps, job, `Customer added a ${naira(amount)} tip`, 'customer');
  await saveJob(deps, job, c);
  await deps.db.query("INSERT INTO ledger (id, artisan_id, job_id, type, amount, note) VALUES ($1, $2, $3, 'tip', $4, $5)", [newId('led'), job.artisanId, jobId, amount, `Tip: ${job.title}`], c);
  await notify(deps, job.artisanId, 'You received a tip 🎉', `${naira(amount)} tip for “${job.title}”. Tips are 100% yours.`, '/earnings', c, 'payments');
  return 'tip_credited';
}

// ---- two-way reviews ------------------------------------------------------------
export async function rateCustomer(deps: Deps, s: Session, jobId: string, r: { professionalism: number; clarity: number; payment: number; comment: string }) {
  const err = validateCustomerReview(r);
  if (err) throw badRequest(err);
  if (!moderateMessage(r.comment).allowed) throw ruleViolation('Ratings can’t include contact details.', 'message_blocked');
  return deps.db.tx(async (c) => {
    const job = await lockedJobFor(deps, c, s, jobId, 'artisan');
    if (job.status !== 'completed' && job.status !== 'resolved') throw ruleViolation('You can rate the customer once the job is complete.');
    if (job.customerReviewId) throw conflict('You already rated this customer.');
    const rev: CustomerReview = { id: newId('crev'), jobId, customerId: job.customerId, artisanId: job.artisanId, professionalism: r.professionalism, clarity: r.clarity, payment: r.payment, comment: r.comment.trim(), at: iso(deps) };
    await deps.db.query('INSERT INTO customer_reviews (id, job_id, customer_id, artisan_id, data) VALUES ($1, $2, $3, $4, $5)', [rev.id, jobId, job.customerId, job.artisanId, JSON.stringify(rev)], c);
    job.customerReviewId = rev.id;
    await saveJob(deps, job, c);
    const cu = await getUser<Customer>(deps, job.customerId, c, true);
    const st = cu.customerStats ?? { ratingCount: 0, professionalismSum: 0, claritySum: 0, paymentSum: 0 };
    cu.customerStats = { ratingCount: st.ratingCount + 1, professionalismSum: st.professionalismSum + r.professionalism, claritySum: st.claritySum + r.clarity, paymentSum: st.paymentSum + r.payment };
    await saveUser(deps, cu, c);
    return rev;
  });
}

// ---- safety ------------------------------------------------------------------------
export async function raiseSafetyAlert(deps: Deps, s: Session, kind: SafetyAlertKind, note: string, jobId?: string) {
  if (jobId) {
    const j = await getJob(deps, jobId);
    if (j.customerId !== s.userId && j.artisanId !== s.userId) throw forbidden();
  }
  const a: SafetyAlert = { id: newId('sos'), userId: s.userId, role: s.role === 'artisan' ? 'artisan' : 'customer', jobId, kind, note: note.trim().slice(0, 500), at: iso(deps), status: 'open' };
  await deps.db.query('INSERT INTO safety_alerts (id, user_id, job_id, status, data) VALUES ($1, $2, $3, $4, $5)', [a.id, s.userId, jobId ?? null, 'open', JSON.stringify(a)]);
  if (kind !== 'shared_with_contact') {
    for (const id of await adminIds(deps)) await notify(deps, id, kind === 'sos' ? '🚨 SOS from a user' : 'Safety concern reported', `${s.userId}${jobId ? ` · job ${jobId.slice(-6).toUpperCase()}` : ''}`, '/safety-queue', undefined, 'safety');
    await notify(deps, s.userId, 'Sleek Safety has been alerted', 'A safety agent will contact you in the app within minutes. If you are in danger, call 112.', '/trust-safety', undefined, 'safety');
  }
  await audit(deps, s.userId, `safety.${kind}`, jobId ?? null, {});
  return a;
}

export async function listSafety(deps: Deps, s: Session) {
  if (s.role !== 'admin') throw forbidden();
  return (await deps.db.query<{ data: SafetyAlert; status: string }>("SELECT data, status FROM safety_alerts ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END, created_at DESC LIMIT 200")).map((r) => ({ ...r.data, status: r.status }));
}

export async function updateSafety(deps: Deps, s: Session, id: string, status: SafetyAlert['status']) {
  if (s.role !== 'admin') throw forbidden();
  const row = await deps.db.one<{ user_id: string }>("UPDATE safety_alerts SET status = $2, data = data || jsonb_build_object('status', $2::text, 'handledBy', $3::text, 'handledAt', $4::text) WHERE id = $1 RETURNING user_id", [id, status, s.userId, iso(deps)]);
  if (!row) throw notFound('Alert not found');
  if (status === 'acknowledged') await notify(deps, row.user_id, 'Sleek Safety is on it', 'A safety agent has seen your alert and is following up.', '/trust-safety', undefined, 'safety');
  await audit(deps, s.userId, `safety.${status}`, id);
}

// ---- customer profile: favourites, preferences, trusted contact -------------------
async function mutateCustomer(deps: Deps, s: Session, fn: (cu: Customer) => void) {
  if (s.role !== 'customer') throw forbidden('Customers only.');
  return deps.db.tx(async (c) => {
    const cu = await getUser<Customer>(deps, s.userId, c, true);
    fn(cu);
    await saveUser(deps, cu, c);
    return cu;
  });
}

export async function setFavourite(deps: Deps, s: Session, artisanId: string, on: boolean) {
  await getArtisan(deps, artisanId);
  const cu = await mutateCustomer(deps, s, (x) => {
    const set = new Set(x.favourites ?? []);
    if (on) set.add(artisanId);
    else set.delete(artisanId);
    x.favourites = [...set];
  });
  return { favourites: cu.favourites };
}

export async function listFavourites(deps: Deps, s: Session) {
  const cu = await getUser<Customer>(deps, s.userId);
  if (!cu.favourites?.length) return [];
  const rows = await deps.db.query<{ data: Artisan }>("SELECT data FROM users WHERE id = ANY($1) AND role = 'artisan' AND NOT suspended", [cu.favourites]);
  return rows.map((r) => publicArtisan(r.data, deps.now()));
}

export const setPreferences = (deps: Deps, s: Session, p: Partial<MatchingPrefs>) => mutateCustomer(deps, s, (x) => (x.prefs = { ...DEFAULT_PREFS, ...x.prefs, ...p })).then((x) => x.prefs);

export async function setTrustedContact(deps: Deps, s: Session, contact: { name: string; phone: string } | null) {
  if (contact && !/^(0[789][01]\d{8}|234[789][01]\d{8})$/.test(contact.phone.replace(/\D/g, ''))) throw badRequest('Enter a valid Nigerian mobile number.');
  await mutateCustomer(deps, s, (x) => (x.trustedContact = contact ?? undefined));
  return { ok: true };
}

/** Ranked, available-only search with the customer's saved matching preferences applied on top. */
export async function personalisedSearch(deps: Deps, s: Session, q: { categoryId?: string; city?: string; text?: string; window?: TimeWindow; limit?: number }) {
  const cu = await getUser<Customer>(deps, s.userId);
  const city = q.city ?? cu.city;
  const artisans = await listArtisans(deps, city);
  const jobs = await capacityJobs(deps, artisans.map((a) => a.id));
  const now = deps.now();
  const ranked = searchAvailable(artisans, jobs, { categoryId: q.categoryId, text: q.text, window: q.window, categoryName }, now);
  const filtered = applyPreferences(ranked, { ...DEFAULT_PREFS, ...cu.prefs }, { categoryId: q.categoryId, customer: { area: cu.area, city }, jobs, now });
  return {
    hiddenByPreferences: ranked.length - filtered.length,
    results: filtered.slice(0, Math.min(50, q.limit ?? 20)).map((r, i) => ({ rank: i + 1, score: r.score.total, distanceKm: r.distanceKm, freeWorkers: r.freeWorkers?.length, artisan: publicArtisan(r.artisan, now) })),
  };
}

// ---- notification preferences --------------------------------------------------------
export async function getNotificationPrefs(deps: Deps, s: Session): Promise<NotificationPrefs> {
  const row = await deps.db.one<{ notification_prefs: NotificationPrefs }>('SELECT notification_prefs FROM users WHERE id = $1', [s.userId]);
  return row?.notification_prefs && Object.keys(row.notification_prefs).length ? row.notification_prefs : DEFAULT_NOTIFICATION_PREFS;
}

export async function setNotificationPrefs(deps: Deps, s: Session, p: { enabled?: Partial<Record<NotificationCategory, boolean>>; quietHours?: NotificationPrefs['quietHours'] }) {
  const cur = await getNotificationPrefs(deps, s);
  const next: NotificationPrefs = { enabled: { ...cur.enabled, ...p.enabled }, quietHours: p.quietHours ?? cur.quietHours };
  await deps.db.query('UPDATE users SET notification_prefs = $2 WHERE id = $1', [s.userId, JSON.stringify(next)]);
  return next;
}

// ---- referrals ---------------------------------------------------------------------------
export async function referralCodeFor(deps: Deps, userId: string) {
  const u = await getUser(deps, userId);
  return makeReferralCode(u.name, u.id);
}

/** Link a new user to a referrer at sign-up. */
export async function applyReferral(deps: Deps, refereeId: string, refereeName: string, role: 'customer' | 'artisan', code: string) {
  const clean = code.trim().toUpperCase();
  if (!isValidReferralCode(clean)) throw badRequest('That referral code isn’t valid.');
  const prefix = clean.replace(/\d+$/, '');
  const candidates = await deps.db.query<{ id: string; name: string }>("SELECT id, data->>'name' AS name FROM users WHERE role <> 'admin' AND id <> $1 AND upper(regexp_replace(data->>'name', '[^a-zA-Z]', '', 'g')) LIKE $2", [refereeId, `${prefix}%`]);
  const ref = candidates.find((u) => makeReferralCode(u.name, u.id) === clean);
  if (!ref) throw badRequest('That referral code wasn’t found.');
  const data = { id: newId('ref'), code: clean, referrerId: ref.id, refereeId, refereeName, refereeRole: role, status: 'pending', reward: REFERRAL_REWARD[role], at: iso(deps) };
  await deps.db.query("INSERT INTO referrals (id, referrer_id, referee_id, status, data) VALUES ($1, $2, $3, 'pending', $4) ON CONFLICT (referee_id) DO NOTHING", [data.id, ref.id, refereeId, JSON.stringify(data)]);
  await notify(deps, ref.id, 'Your friend joined Sleek', `${refereeName} signed up with your code.`, '/referrals', undefined, 'referrals');
}

/** Inside the release transaction: reward the referrer once the referee qualifies. */
export async function qualifyReferral(deps: Deps, c: PoolClient, refereeId: string, role: 'customer' | 'artisan', completedJobs: number) {
  if (!referralQualifies(role, completedJobs)) return;
  const row = await deps.db.one<{ id: string; referrer_id: string; data: { reward: number; refereeName: string } }>("UPDATE referrals SET status = 'qualified', data = data || jsonb_build_object('status', 'qualified', 'qualifiedAt', $2::text) WHERE referee_id = $1 AND status = 'pending' RETURNING id, referrer_id, data", [refereeId, iso(deps)], c);
  if (!row) return;
  const referrer = await deps.db.one<{ role: string }>('SELECT role FROM users WHERE id = $1', [row.referrer_id], c);
  if (referrer?.role === 'artisan') {
    await deps.db.query("INSERT INTO ledger (id, artisan_id, type, amount, note) VALUES ($1, $2, 'referral_bonus', $3, $4)", [newId('led'), row.referrer_id, row.data.reward, `Referral bonus: ${row.data.refereeName}`], c);
  } else {
    const cu = await getUser<Customer>(deps, row.referrer_id, c, true);
    cu.credit = (cu.credit ?? 0) + row.data.reward;
    await saveUser(deps, cu, c);
  }
  await notify(deps, row.referrer_id, 'You earned a referral reward', `${row.data.refereeName} qualified — ${naira(row.data.reward)} added.`, '/referrals', c, 'referrals');
}

export async function listReferrals(deps: Deps, s: Session) {
  const rows = await deps.db.query<{ data: object }>('SELECT data FROM referrals WHERE referrer_id = $1 ORDER BY created_at DESC', [s.userId]);
  return { code: await referralCodeFor(deps, s.userId), referrals: rows.map((r) => r.data) };
}

// ---- artisan: time off, payout schedule, workers, business, certificate, insights -----
async function mutateArtisan(deps: Deps, s: Session, fn: (a: Artisan, c: PoolClient) => void | Promise<void>) {
  if (s.role !== 'artisan') throw forbidden('Artisan accounts only.');
  return deps.db.tx(async (c) => {
    const a = await getArtisan(deps, s.userId, c, true);
    await fn(a, c);
    await saveUser(deps, a, c);
    return a;
  });
}

export const addTimeOff = (deps: Deps, s: Session, t: { start: string; end: string; reason: string }) =>
  mutateArtisan(deps, s, async (a, c) => {
    if (!(new Date(t.end).getTime() > new Date(t.start).getTime())) throw badRequest('The end must be after the start.');
    const clash = (await capacityJobs(deps, [a.id], c)).find((j) => new Date(j.window.start) < new Date(t.end) && new Date(j.window.end) > new Date(t.start));
    if (clash) throw ruleViolation(`You have a funded job then (“${clash.title}”). Finish or cancel it first.`, 'time_off_clash');
    a.timeOff = [...(a.timeOff ?? []), { id: newId('off'), ...t }];
  }).then((a) => a.timeOff);

export const removeTimeOff = (deps: Deps, s: Session, id: string) => mutateArtisan(deps, s, (a) => void (a.timeOff = (a.timeOff ?? []).filter((t) => t.id !== id))).then((a) => a.timeOff);

export const setPayoutSchedule = (deps: Deps, s: Session, sched: PayoutSchedule) =>
  mutateArtisan(deps, s, (a) => {
    if (sched.mode !== 'manual' && !a.payoutAccount?.verified) throw ruleViolation('Automatic payouts need a verified payout account.', 'no_payout_account');
    a.payoutSchedule = { ...sched, lastAutoPayoutAt: a.payoutSchedule?.lastAutoPayoutAt };
  }).then((a) => a.payoutSchedule);

export const updateWorker = (deps: Deps, s: Session, workerId: string, p: { role?: 'member' | 'supervisor'; ownerNote?: string }) =>
  mutateArtisan(deps, s, (a) => {
    const w = a.workers.find((x) => x.id === workerId);
    if (!w) throw notFound('Worker not found');
    Object.assign(w, p);
  });

export const removeWorker = (deps: Deps, s: Session, workerId: string) =>
  mutateArtisan(deps, s, async (a, c) => {
    const busy = await deps.db.one("SELECT 1 FROM jobs WHERE artisan_id = $1 AND data->>'workerId' = $2 AND status = ANY($3)", [a.id, workerId, ACTIVE_STATUSES], c);
    if (busy) throw ruleViolation('This worker has active jobs. Reassign them first.', 'worker_busy');
    a.workers = a.workers.filter((w) => w.id !== workerId);
  });

export const completeBusiness = (deps: Deps, s: Session, d: BusinessDetails) =>
  mutateArtisan(deps, s, (a) => {
    if (a.accountType === 'individual') throw forbidden('Team and Agency accounts only.');
    if (a.accountType === 'agency' && !/^(RC|BN)?\s?\d{5,8}$/i.test((d.cacNumber ?? '').trim())) throw badRequest('Agencies need a valid CAC registration number (e.g. RC 1234567).');
    if (!d.serviceAreas.length) throw badRequest('Add at least one area you serve.');
    a.business = { ...d, completedOnboarding: true };
  }).then((a) => a.business);

export async function submitCertificate(deps: Deps, s: Session, categoryId: string, mediaId: string, workerId?: string) {
  const media = await deps.db.one<{ data: { uri: string; capturedAt: string; claimed?: boolean } }>("SELECT data FROM media WHERE id = $1 AND user_id = $2 AND purpose = 'certificate'", [mediaId, s.userId]);
  if (!media || media.data.claimed) throw badRequest('Photograph the certificate in the app.');
  await deps.db.query('UPDATE media SET data = data || \'{"claimed":true}\' WHERE id = $1', [mediaId]);
  await mutateArtisan(deps, s, (a) => {
    const skills = workerId ? a.workers.find((w) => w.id === workerId)?.skills : a.skills;
    const k = skills?.find((x) => x.categoryId === categoryId);
    if (!k) throw notFound('Skill not found');
    k.certificate = { id: mediaId, uri: media.data.uri, purpose: 'certificate', capturedAt: media.data.capturedAt, loggedBy: s.userId };
    if (k.status === 'needs_more' || k.status === 'rejected') k.status = 'in_review';
  });
  for (const id of await adminIds(deps)) await notify(deps, id, 'Certificate uploaded', `${s.userId} — ${category(categoryId).name}`, '/admin/verifications', undefined, 'verification');
  return { ok: true };
}

export async function insights(deps: Deps, s: Session) {
  if (s.role !== 'artisan') throw forbidden();
  const jobs = (await deps.db.query<{ data: Job }>('SELECT data FROM jobs WHERE artisan_id = $1', [s.userId])).map((r) => r.data);
  const reviews = (await deps.db.query<{ data: Review }>('SELECT data FROM reviews WHERE artisan_id = $1', [s.userId])).map((r) => r.data);
  const ledger = (await deps.db.query<{ id: string; job_id: string | null; type: LedgerEntry['type']; amount: string; note: string; created_at: Date }>('SELECT * FROM ledger WHERE artisan_id = $1', [s.userId])).map((l): LedgerEntry => ({ id: l.id, artisanId: s.userId, jobId: l.job_id ?? undefined, type: l.type, amount: Number(l.amount), note: l.note, at: new Date(l.created_at).toISOString() }));
  return artisanInsights(s.userId, jobs, reviews, ledger, deps.now());
}

/** Scheduler: run automatic payout schedules. */
export async function runScheduledPayouts(deps: Deps): Promise<string[]> {
  const rows = await deps.db.query<{ id: string }>("SELECT id FROM users WHERE role = 'artisan' AND NOT suspended AND data->'payoutSchedule'->>'mode' IN ('daily','weekly')");
  const paid: string[] = [];
  for (const { id } of rows) {
    const s: Session = { userId: id, role: 'artisan', scope: 'user' };
    const a = await getArtisan(deps, id);
    const [bal] = await deps.db.query<{ b: string }>('SELECT COALESCE(SUM(amount),0) AS b FROM ledger WHERE artisan_id = $1', [id]);
    const due = autoPayoutDue(a.payoutSchedule ?? DEFAULT_SCHEDULE, Number(bal.b), deps.now());
    if (due <= 0) continue;
    await mutateArtisan(deps, s, (x) => void (x.payoutSchedule = { ...(x.payoutSchedule ?? DEFAULT_SCHEDULE), lastAutoPayoutAt: iso(deps) }));
    await requestPayout(deps, s, due).catch((e) => audit(deps, null, 'payout.scheduled_failed', id, { error: (e as Error).message }));
    paid.push(id);
  }
  return paid;
}

// ---- protection claims ------------------------------------------------------------------
export async function submitProtectionClaim(deps: Deps, s: Session, jobId: string, details: string) {
  if (details.trim().length < 20) throw badRequest('Describe what went wrong (at least 20 characters).');
  return deps.db.tx(async (c) => {
    const job = await lockedJobFor(deps, c, s, jobId, 'customer');
    const a = await getArtisan(deps, job.artisanId, c);
    if (!protectionEligible(job, a, category(job.categoryId), deps.now()).eligible) throw ruleViolation('This job is not covered by Sleek Protection.', 'not_protected');
    const w = protectionWindow(job);
    if (!w.open || new Date(w.until!).getTime() < deps.now()) throw ruleViolation('The 7-day protection window for this job has closed.', 'protection_closed');
    if (job.guaranteeClaimId) throw conflict('You already made a claim for this job.');
    const claim = { id: newId('gc'), jobId, customerId: s.userId, details: details.trim(), evidence: [], status: 'submitted', at: iso(deps) };
    await deps.db.query("INSERT INTO guarantee_claims (id, job_id, customer_id, status, data) VALUES ($1, $2, $3, 'submitted', $4)", [claim.id, jobId, s.userId, JSON.stringify(claim)], c);
    job.guaranteeClaimId = claim.id;
    tl(deps, job, 'Sleek Protection claim submitted', 'customer');
    await saveJob(deps, job, c);
    for (const id of await adminIds(deps)) await notify(deps, id, 'Protection claim', `${job.title} — up to ${naira(protectionCover(job))}`, '/safety-queue', c, 'disputes');
    return claim;
  });
}

export async function decideProtectionClaim(deps: Deps, s: Session, id: string, approve: boolean, payout: number) {
  if (s.role !== 'admin') throw forbidden();
  const out = await deps.db.tx(async (c) => {
    const row = await deps.db.one<{ job_id: string; customer_id: string; status: string }>('SELECT job_id, customer_id, status FROM guarantee_claims WHERE id = $1 FOR UPDATE', [id], c);
    if (!row) throw notFound('Claim not found');
    if (row.status !== 'submitted') throw conflict('Already decided.');
    const job = await getJob(deps, row.job_id, c);
    const amount = approve ? Math.min(protectionCover(job), Math.max(0, Math.round(payout))) : 0;
    await deps.db.query("UPDATE guarantee_claims SET status = $2, data = data || jsonb_build_object('status', $2::text, 'payout', $3::int) WHERE id = $1", [id, approve ? 'approved' : 'declined', amount], c);
    await notify(deps, row.customer_id, approve ? 'Protection claim approved' : 'Protection claim declined', approve ? `Sleek will pay ${naira(amount)} to your original payment method.` : 'After review, this issue isn’t covered.', `/job/${job.id}`, c, 'disputes');
    await audit(deps, s.userId, approve ? 'protection.approved' : 'protection.declined', id, { amount }, c);
    return { amount, chargeRef: job.escrow.paymentRef, jobId: job.id };
  });
  // Paid out of the Sleek protection fund, back to the customer's original payment method.
  if (out.amount > 0 && out.chargeRef) await issueRefund(deps, out.chargeRef, out.amount, out.jobId, 'Sleek Protection claim');
  return { ok: true, payout: out.amount };
}

// ---- admin notes & dispute evidence ---------------------------------------------------------
export async function addAdminNote(deps: Deps, s: Session, targetType: string, targetId: string, text: string) {
  if (s.role !== 'admin') throw forbidden();
  if (text.trim().length < 3) throw badRequest('Write a note.');
  const n = { id: newId('an'), targetType, targetId, by: s.userId, text: text.trim(), at: iso(deps) };
  await deps.db.query('INSERT INTO admin_notes (id, target_type, target_id, author_id, data) VALUES ($1, $2, $3, $4, $5)', [n.id, targetType, targetId, s.userId, JSON.stringify(n)]);
  return n;
}

export async function listAdminNotes(deps: Deps, s: Session, targetType: string, targetId: string) {
  if (s.role !== 'admin') throw forbidden();
  return (await deps.db.query<{ data: object }>('SELECT data FROM admin_notes WHERE target_type = $1 AND target_id = $2 ORDER BY created_at', [targetType, targetId])).map((r) => r.data);
}

export async function addDisputeEvidence(deps: Deps, s: Session, disputeId: string, mediaId: string) {
  return deps.db.tx(async (c) => {
    const row = await deps.db.one<{ data: { jobId: string; status: string; evidence: unknown[] } }>('SELECT data FROM disputes WHERE id = $1 FOR UPDATE', [disputeId], c);
    if (!row) throw notFound('Dispute not found');
    const job = await getJob(deps, row.data.jobId, c);
    if (job.customerId !== s.userId && job.artisanId !== s.userId) throw forbidden();
    if (row.data.status === 'resolved') throw ruleViolation('This dispute is closed.');
    const m = await deps.db.one<{ data: { uri: string; capturedAt: string; claimed?: boolean } }>("SELECT data FROM media WHERE id = $1 AND user_id = $2 AND purpose = 'dispute_evidence' FOR UPDATE", [mediaId, s.userId], c);
    if (!m || m.data.claimed) throw badRequest('Take the evidence photo in the app.');
    await deps.db.query('UPDATE media SET data = data || \'{"claimed":true}\' WHERE id = $1', [mediaId], c);
    const evidence = [...row.data.evidence, { id: mediaId, uri: m.data.uri, purpose: 'dispute_evidence', capturedAt: m.data.capturedAt, loggedBy: s.userId }];
    await deps.db.query("UPDATE disputes SET data = jsonb_set(data, '{evidence}', $2::jsonb) WHERE id = $1", [disputeId, JSON.stringify(evidence)], c);
    return { evidence };
  });
}

