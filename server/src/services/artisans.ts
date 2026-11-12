/** Artisan search & profile, availability, verification, team workers, earnings and payouts. */
import { category, categoryName } from '../../../src/data/categories';
import { bookableFor, suggestSlots } from '../../../src/domain/availability';
import { moderateMessage } from '../../../src/domain/moderation';
import { searchAvailable } from '../../../src/domain/ranking';
import { badgesFor, displayRating, trustScore } from '../../../src/domain/trust';
import type { Artisan, IdentityVerification, Review, SkillVerification, TimeWindow, Worker } from '../../../src/domain/types';
import { checkSkillVideo, emptyIdentity, FACE_MATCH_THRESHOLD, isValidNIN, pickChallenges, statusAfterAutoCheck } from '../../../src/domain/verification';
import type { Session } from '../auth';
import type { Deps } from '../context';
import { badRequest, forbidden, notFound, ruleViolation } from '../errors';
import { newId, sha256 } from '../ids';
import { adminIds, audit, capacityJobs, getArtisan, listArtisans, notify, saveUser } from '../repo';

const iso = (deps: Deps) => new Date(deps.now()).toISOString();

/** What customers (and Ugent) may see. No phone, no payout details, no NIN digits. */
export function publicArtisan(a: Artisan, now: number) {
  return {
    id: a.id,
    accountType: a.accountType,
    name: a.name,
    businessName: a.businessName,
    bio: a.bio,
    area: a.area,
    city: a.city,
    yearsExperience: a.yearsExperience,
    online: a.online,
    avatarColor: a.avatarColor,
    joinedAt: a.joinedAt,
    startingPrices: a.startingPrices,
    rating: Number(displayRating(a).toFixed(2)),
    ratingCount: a.stats.ratingCount,
    completedJobs: a.stats.completedJobs,
    onTimeRate: a.stats.onTimeRate,
    trustScore: trustScore(a, now),
    badges: badgesFor(a, now, categoryName),
    identity: { nin: a.identity.nin, liveness: a.identity.liveness, faceMatch: a.identity.faceMatch, faceMatchScore: a.identity.faceMatchScore },
    skills: a.skills.map((s) => ({ categoryId: s.categoryId, status: s.status, qualityScore: s.qualityScore })),
    workers: a.workers.filter((w) => w.active).map((w) => ({ id: w.id, name: w.name, avatarColor: w.avatarColor, identityVerified: w.identity.faceMatch === 'passed', skills: w.skills.filter((s) => s.status === 'approved').map((s) => s.categoryId) })),
    workingHours: a.workingHours,
  };
}

export async function search(deps: Deps, q: { categoryId?: string; city?: string; text?: string; window?: TimeWindow; limit?: number }) {
  const artisans = await listArtisans(deps, q.city);
  const jobs = await capacityJobs(deps, artisans.map((a) => a.id));
  const now = deps.now();
  return searchAvailable(artisans, jobs, { categoryId: q.categoryId, text: q.text, window: q.window, categoryName }, now)
    .slice(0, Math.min(50, q.limit ?? 20))
    .map((r, i) => ({ rank: i + 1, score: r.score.total, freeWorkers: r.freeWorkers?.length, artisan: publicArtisan(r.artisan, now) }));
}

export async function profile(deps: Deps, id: string) {
  const a = await getArtisan(deps, id);
  const reviews = (await deps.db.query<{ data: Review }>('SELECT data FROM reviews WHERE artisan_id = $1 ORDER BY created_at DESC LIMIT 20', [id])).map((r) => r.data);
  return { artisan: publicArtisan(a, deps.now()), reviews };
}

export async function availability(deps: Deps, id: string, categoryId: string, window: TimeWindow) {
  const a = await getArtisan(deps, id);
  const jobs = await capacityJobs(deps, [id]);
  const b = bookableFor(jobs, a, categoryId, window);
  const dur = (new Date(window.end).getTime() - new Date(window.start).getTime()) / 60_000;
  return { available: b.ok, reason: b.reason, suggestedSlots: suggestSlots(jobs, a, categoryId, new Date(window.start), dur, deps.now()) };
}

// ---------------------------------------------------------------------------
// Own account
// ---------------------------------------------------------------------------
async function mutate(deps: Deps, s: Session, fn: (a: Artisan) => void | Promise<void>) {
  if (s.role !== 'artisan') throw forbidden('Artisan accounts only.');
  return deps.db.tx(async (c) => {
    const a = await getArtisan(deps, s.userId, c, true);
    await fn(a);
    await saveUser(deps, a, c);
    return a;
  });
}

export const setOnline = (deps: Deps, s: Session, online: boolean) =>
  mutate(deps, s, (a) => {
    if (online && a.identity.faceMatch !== 'passed') throw ruleViolation('Complete identity verification before going online.', 'not_verified');
    const hasSkill = a.skills.some((k) => k.status === 'approved') || a.workers.some((w) => w.skills.some((k) => k.status === 'approved'));
    if (online && !hasSkill) throw ruleViolation('Get at least one skill verified before going online.', 'not_verified');
    a.online = online;
  });

export const setWorkingHours = (deps: Deps, s: Session, day: number, hours: { start: number; end: number } | null) =>
  mutate(deps, s, (a) => {
    if (day < 0 || day > 6) throw badRequest('Day must be 0–6.');
    if (hours && !(hours.start >= 0 && hours.end <= 24 && hours.end > hours.start)) throw badRequest('Invalid hours.');
    a.workingHours = { ...a.workingHours, [day]: hours };
  });

export const updateProfile = (deps: Deps, s: Session, p: Partial<Pick<Artisan, 'bio' | 'area' | 'yearsExperience' | 'businessName' | 'startingPrices' | 'calendarMode'>>) =>
  mutate(deps, s, (a) => {
    for (const text of [p.bio, p.businessName]) {
      if (text && !moderateMessage(text).allowed) throw ruleViolation('Your profile can’t include phone numbers, emails, links or social handles.', 'message_blocked');
    }
    Object.assign(a, p);
  });

// ---------------------------------------------------------------------------
// Verification (owner or a team worker)
// ---------------------------------------------------------------------------
function identityOf(a: Artisan, workerId?: string): { get: () => IdentityVerification; set: (i: IdentityVerification) => void; skills: () => SkillVerification[]; setSkills: (k: SkillVerification[]) => void } {
  if (!workerId) return { get: () => a.identity, set: (i) => (a.identity = i), skills: () => a.skills, setSkills: (k) => (a.skills = k) };
  const w = a.workers.find((x) => x.id === workerId);
  if (!w) throw notFound('Worker not found');
  return { get: () => w.identity, set: (i) => (w.identity = i), skills: () => w.skills, setSkills: (k) => (w.skills = k) };
}

export async function verifyNin(deps: Deps, s: Session, nin: string, name: string, workerId?: string) {
  const clean = nin.replace(/\s/g, '');
  if (!isValidNIN(clean)) throw badRequest('Your NIN has 11 digits. Dial *346# to retrieve it.');
  const res = await deps.identity.lookupNIN(clean, name);
  // Detect one NIN being used by several accounts (a classic fake-identity pattern).
  const ninHash = sha256(`nin:${clean}`);
  const dupe = await deps.db.one<{ id: string }>("SELECT id FROM users WHERE id <> $1 AND (data->'identity'->>'ninHash' = $2 OR data->'workers' @> $3::jsonb)", [s.userId, ninHash, JSON.stringify([{ identity: { ninHash } }])]);
  await mutate(deps, s, (a) => {
    const id = identityOf(a, workerId);
    id.set({ ...id.get(), nin: res.ok && !dupe ? 'passed' : 'failed', ninLast4: clean.slice(-4), fullNameOnRecord: res.fullName, ...({ ninHash, recordPhotoRef: res.recordPhotoRef } as object) });
  });
  if (dupe) {
    await audit(deps, s.userId, 'verification.nin_reused', s.userId, { otherAccount: dupe.id });
    throw ruleViolation('This NIN is already linked to another Sleek account. Contact support.', 'nin_in_use');
  }
  if (!res.ok) throw ruleViolation(res.error ?? 'NIN verification failed.', 'nin_failed');
  return { ok: true };
}

/** The server picks the random challenges, so the app can't replay an old recording. */
export async function startLiveness(deps: Deps, s: Session, workerId?: string) {
  if (s.role !== 'artisan') throw forbidden();
  const id = newId('liv');
  const challenges = pickChallenges(Number.parseInt(sha256(id).slice(0, 8), 16));
  await deps.db.query('INSERT INTO liveness_sessions (id, user_id, worker_id, challenges, expires_at) VALUES ($1, $2, $3, $4, $5)', [id, s.userId, workerId ?? null, JSON.stringify(challenges), new Date(deps.now() + 10 * 60_000)]);
  return { sessionId: id, challenges };
}

export async function completeLiveness(deps: Deps, s: Session, sessionId: string, mediaIds: string[]) {
  const sess = await deps.db.one<{ user_id: string; worker_id: string | null; challenges: { id: string }[]; used: boolean; expires_at: Date }>('SELECT * FROM liveness_sessions WHERE id = $1', [sessionId]);
  if (!sess || sess.user_id !== s.userId) throw notFound('Liveness session not found');
  if (sess.used || new Date(sess.expires_at).getTime() < deps.now()) throw ruleViolation('This face check expired. Start again.', 'liveness_expired');
  await deps.db.query('UPDATE liveness_sessions SET used = TRUE WHERE id = $1', [sessionId]);
  const media = await deps.db.query<{ data: { uri: string } }>("SELECT data FROM media WHERE id = ANY($1) AND user_id = $2 AND purpose = 'liveness_frame'", [mediaIds, s.userId]);
  const workerId = sess.worker_id ?? undefined;
  const a0 = await getArtisan(deps, s.userId);
  const before = identityOf(a0, workerId).get();
  if (before.nin !== 'passed') throw ruleViolation('Verify your NIN first.', 'nin_required');
  const live = await deps.identity.checkLiveness({ mediaUris: media.map((m) => m.data.uri), challenges: sess.challenges.map((c) => c.id) });
  let score = 0;
  if (live.passed) score = (await deps.identity.faceMatch({ selfieRef: live.selfieRef!, referenceRef: (before as unknown as { recordPhotoRef?: string }).recordPhotoRef ?? '' })).score;
  const passed = live.passed && score >= FACE_MATCH_THRESHOLD;
  await mutate(deps, s, (a) => {
    const id = identityOf(a, workerId);
    id.set({ ...id.get(), liveness: live.passed ? 'passed' : 'failed', faceMatch: passed ? 'passed' : 'failed', faceMatchScore: score || undefined, verifiedAt: passed ? iso(deps) : undefined, ...({ selfieRef: live.selfieRef } as object) });
  });
  if (!live.passed) throw ruleViolation(live.reason ?? 'Liveness check failed.', 'liveness_failed');
  if (!passed) throw ruleViolation('Your face did not match your NIN record photo.', 'face_mismatch');
  await notify(deps, s.userId, 'Identity verified', workerId ? 'Your worker’s identity is verified.' : 'You now have the Identity Verified badge. Next: verify your skills.', '/verify');
  return { ok: true, faceMatchScore: score };
}

export async function submitSkillVideo(deps: Deps, s: Session, i: { categoryId: string; mediaId: string; durationSec: number; workerId?: string }) {
  const cat = category(i.categoryId);
  if (cat.id !== i.categoryId) throw badRequest('Unknown trade.');
  const media = await deps.db.one<{ data: { uri: string; capturedAt: string; claimed?: boolean } }>("SELECT data FROM media WHERE id = $1 AND user_id = $2 AND purpose = 'skill_video'", [i.mediaId, s.userId]);
  if (!media) throw badRequest('Record the video in the app first.');
  const a0 = await getArtisan(deps, s.userId);
  const ident = identityOf(a0, i.workerId);
  if (ident.get().faceMatch !== 'passed') throw ruleViolation('Finish identity verification first.', 'not_verified');
  const current = ident.skills().find((k) => k.categoryId === i.categoryId);
  if (current && ['approved', 'submitted', 'in_review'].includes(current.status)) throw ruleViolation('This skill is already verified or being reviewed.');
  const analysis = await deps.identity.analyseSkillVideo({ uri: media.data.uri, durationSec: i.durationSec, referenceRef: (ident.get() as unknown as { selfieRef?: string }).selfieRef ?? '' });
  const video = { id: i.mediaId, uri: media.data.uri, durationSec: i.durationSec, recordedInApp: true as const, livenessPassed: analysis.livenessPassed, faceMatchScore: analysis.faceMatchScore, recordedAt: media.data.capturedAt, captureHash: sha256(media.data.uri).slice(0, 16) };
  // A recording can back exactly one skill submission.
  const reused = !!media.data.claimed;
  await deps.db.query('UPDATE media SET data = data || \'{"claimed":true}\' WHERE id = $1', [i.mediaId]);
  const check = checkSkillVideo(video);
  if (reused) check.problems.push('This video was already submitted before.');
  const ok = check.ok && !reused;
  const entry: SkillVerification = {
    categoryId: i.categoryId,
    status: ok ? statusAfterAutoCheck(cat, check) : 'rejected',
    video,
    submittedAt: iso(deps),
    reviewerNote: ok ? undefined : check.problems.join(' '),
    certificateRequired: cat.risk === 'high',
  };
  await mutate(deps, s, (a) => {
    const id = identityOf(a, i.workerId);
    id.setSkills([...id.skills().filter((k) => k.categoryId !== i.categoryId), entry]);
  });
  if (!ok) throw ruleViolation(check.problems.join(' '), 'video_rejected');
  for (const admin of await adminIds(deps)) await notify(deps, admin, 'Skill video to review', `${a0.businessName ?? a0.name} — ${cat.name}${cat.risk === 'high' ? ' (high-risk)' : ''}`, '/admin/verifications');
  return { status: entry.status };
}

export async function addWorker(deps: Deps, s: Session, name: string) {
  if (name.trim().length < 3) throw badRequest('Enter the worker’s full name.');
  if (!moderateMessage(name).allowed) throw ruleViolation('A name can’t include phone numbers, emails or links.', 'message_blocked');
  let id = '';
  await mutate(deps, s, (a) => {
    if (a.accountType === 'individual') throw forbidden('Only Team and Agency accounts can add workers.');
    const w: Worker = { id: newId('wk'), name: name.trim(), identity: emptyIdentity(), skills: [], active: true, avatarColor: '#0284C7' };
    id = w.id;
    a.workers = [...a.workers, w];
  });
  return { workerId: id };
}

export const setWorkerActive = (deps: Deps, s: Session, workerId: string, active: boolean) =>
  mutate(deps, s, (a) => {
    const w = a.workers.find((x) => x.id === workerId);
    if (!w) throw notFound('Worker not found');
    w.active = active;
  });

// ---------------------------------------------------------------------------
// Earnings & payouts
// ---------------------------------------------------------------------------
export async function earnings(deps: Deps, s: Session) {
  if (s.role !== 'artisan') throw forbidden();
  const [bal] = await deps.db.query<{ balance: string }>('SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger WHERE artisan_id = $1', [s.userId]);
  const ledger = await deps.db.query('SELECT id, job_id, type, amount::int AS amount, note, created_at FROM ledger WHERE artisan_id = $1 ORDER BY created_at DESC LIMIT 100', [s.userId]);
  const [held] = await deps.db.query<{ held: string }>("SELECT COALESCE(SUM((data->'escrow'->>'amount')::bigint), 0) AS held FROM jobs WHERE artisan_id = $1 AND data->'escrow'->>'state' IN ('held','frozen')", [s.userId]);
  const payouts = (await deps.db.query<{ data: unknown }>('SELECT data FROM payouts WHERE artisan_id = $1 ORDER BY created_at DESC LIMIT 50', [s.userId])).map((r) => r.data);
  return { balance: Number(bal.balance), heldInEscrow: Number(held.held), ledger, payouts };
}

/** Payouts only go to a bank account whose name matches the verified identity. */
export async function setPayoutAccount(deps: Deps, s: Session, accountNumber: string, bankCode: string, bankName: string) {
  if (!/^\d{10}$/.test(accountNumber)) throw badRequest('NUBAN account numbers have 10 digits.');
  const a = await getArtisan(deps, s.userId);
  if (a.identity.faceMatch !== 'passed') throw ruleViolation('Verify your identity before adding a payout account.', 'not_verified');
  const { accountName } = await deps.payments.resolveAccount({ accountNumber, bankCode });
  const expected = (a.identity.fullNameOnRecord ?? a.name).toUpperCase().split(/\s+/).filter(Boolean);
  const got = accountName.toUpperCase();
  const matches = expected.filter((p) => got.includes(p)).length >= Math.min(2, expected.length) || deps.payments.name === 'mock';
  if (!matches) throw ruleViolation(`This account is in the name “${accountName}”. Payouts can only go to an account in your verified name.`, 'name_mismatch');
  const { recipientCode } = await deps.payments.createRecipient({ name: accountName, accountNumber, bankCode });
  await mutate(deps, s, (x) => {
    x.payoutAccount = { bankName, accountNumberLast4: accountNumber.slice(-4), accountName, verified: true };
    (x as Artisan & { payoutRecipient?: string }).payoutRecipient = recipientCode;
  });
  await audit(deps, s.userId, 'payout_account.set', s.userId, { bankCode, last4: accountNumber.slice(-4) });
  return { accountName };
}

export async function requestPayout(deps: Deps, s: Session, amount: number) {
  if (!Number.isInteger(amount) || amount < 1000) throw badRequest('Minimum payout is ₦1,000.');
  const reference = newId('pay');
  const payoutId = newId('po');
  const recipient = await deps.db.tx(async (c) => {
    const a = await getArtisan(deps, s.userId, c, true); // serialises payouts per artisan
    const rcp = (a as Artisan & { payoutRecipient?: string }).payoutRecipient;
    if (!a.payoutAccount?.verified || !rcp) throw ruleViolation('Add and verify a payout bank account first.', 'no_payout_account');
    const [bal] = await deps.db.query<{ balance: string }>('SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger WHERE artisan_id = $1', [a.id], c);
    if (amount > Number(bal.balance)) throw ruleViolation(`You can withdraw up to ₦${Number(bal.balance).toLocaleString('en-NG')}.`, 'insufficient_balance');
    await deps.db.query("INSERT INTO ledger (id, artisan_id, type, amount, note) VALUES ($1, $2, 'payout', $3, $4)", [newId('led'), a.id, -amount, `Payout to ${a.payoutAccount.bankName} ••${a.payoutAccount.accountNumberLast4}`], c);
    await deps.db.query("INSERT INTO payouts (id, artisan_id, status, data) VALUES ($1, $2, 'processing', $3)", [payoutId, a.id, JSON.stringify({ id: payoutId, artisanId: a.id, amount, status: 'processing', requestedAt: iso(deps), reference })], c);
    await deps.db.query("INSERT INTO payments (reference, kind, target_id, user_id, amount, status) VALUES ($1, 'payout', $2, $3, $4, 'processing')", [reference, payoutId, a.id, amount], c);
    return rcp;
  });
  const t = await deps.payments.transfer({ amount, recipientCode: recipient, reference, reason: 'Sleek earnings payout' });
  if (t.status === 'failed') await settlePayout(deps, reference, false, t.error);
  else if (t.status === 'success') await settlePayout(deps, reference, true);
  return { payoutId, status: t.status === 'failed' ? 'failed' : t.status === 'success' ? 'paid' : 'processing' };
}

/** Transfer webhook / immediate result. A failed transfer credits the money back to the ledger. */
export async function settlePayout(deps: Deps, reference: string, success: boolean, error?: string) {
  await deps.db.tx(async (c) => {
    const p = await deps.db.one<{ target_id: string; user_id: string; amount: string; status: string }>("SELECT * FROM payments WHERE reference = $1 AND kind = 'payout' FOR UPDATE", [reference], c);
    if (!p || p.status !== 'processing') return;
    const status = success ? 'paid' : 'failed';
    await deps.db.query('UPDATE payments SET status = $2, updated_at = now() WHERE reference = $1', [reference, status], c);
    await deps.db.query("UPDATE payouts SET status = $2, data = data || jsonb_build_object('status', $2::text, 'paidAt', $3::text) WHERE id = $1", [p.target_id, status, success ? iso(deps) : null], c);
    if (!success) {
      await deps.db.query("INSERT INTO ledger (id, artisan_id, type, amount, note) VALUES ($1, $2, 'payout_reversal', $3, $4)", [newId('led'), p.user_id, Number(p.amount), `Payout failed${error ? `: ${error}` : ''} — returned to balance`], c);
      await notify(deps, p.user_id, 'Payout failed', 'Your payout could not be sent and the money is back in your balance. Check your bank details.', '/earnings', c);
    } else {
      await notify(deps, p.user_id, 'Payout sent', `₦${Number(p.amount).toLocaleString('en-NG')} has been paid to your bank.`, '/earnings', c);
    }
  });
}
