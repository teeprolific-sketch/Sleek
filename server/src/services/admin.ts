/** Admin: verification decisions, disputes queue, rule-breaking monitor, suspensions, metrics. */
import { category } from '../../../src/data/categories';
import type { Artisan, SkillVerification } from '../../../src/domain/types';
import type { Session } from '../auth';
import type { Deps } from '../context';
import { badRequest, forbidden, notFound, ruleViolation } from '../errors';
import { audit, getArtisan, notify, saveUser } from '../repo';

const iso = (deps: Deps) => new Date(deps.now()).toISOString();
function requireAdmin(s: Session) {
  if (s.role !== 'admin' || s.scope !== 'user') throw forbidden('Admins only.');
}

export async function verificationQueue(deps: Deps, s: Session) {
  requireAdmin(s);
  const rows = await deps.db.query<{ data: Artisan }>("SELECT data FROM users WHERE role = 'artisan' AND (data::text LIKE '%\"in_review\"%' OR data::text LIKE '%\"postReview\": \"pending\"%' OR data::text LIKE '%\"postReview\":\"pending\"%')");
  const waiting = (k: SkillVerification) => k.status === 'in_review' || (k.status === 'approved' && k.postReview === 'pending');
  const out: { artisanId: string; name: string; workerId?: string; workerName?: string; skill: SkillVerification; highRisk: boolean }[] = [];
  for (const { data: a } of rows) {
    for (const k of a.skills) if (waiting(k)) out.push({ artisanId: a.id, name: a.businessName ?? a.name, skill: k, highRisk: category(k.categoryId).risk === 'high' });
    for (const w of a.workers) for (const k of w.skills) if (waiting(k)) out.push({ artisanId: a.id, name: a.businessName ?? a.name, workerId: w.id, workerName: w.name, skill: k, highRisk: category(k.categoryId).risk === 'high' });
  }
  return out.sort((x, y) => (x.skill.submittedAt ?? '').localeCompare(y.skill.submittedAt ?? ''));
}

export async function reviewSkill(deps: Deps, s: Session, i: { artisanId: string; workerId?: string; categoryId: string; decision: 'approved' | 'rejected' | 'needs_more'; quality?: number; note: string; certificateChecked?: boolean }) {
  requireAdmin(s);
  const cat = category(i.categoryId);
  if (i.decision === 'approved' && cat.risk === 'high' && !i.certificateChecked) throw ruleViolation(`${cat.name} is high-risk: confirm the certificate check before approving.`, 'certificate_required');
  if (i.decision !== 'approved' && i.note.trim().length < 8) throw badRequest('Tell the artisan what to fix.');
  await deps.db.tx(async (c) => {
    const a = await getArtisan(deps, i.artisanId, c, true);
    const list = i.workerId ? a.workers.find((w) => w.id === i.workerId)?.skills : a.skills;
    const k = list?.find((x) => x.categoryId === i.categoryId);
    const isAudit = k?.status === "approved" && k.postReview === "pending";
    if (!k || (k.status !== "in_review" && !isAudit)) throw notFound('No skill video waiting for review.');
    Object.assign(k, { postReview: i.decision === 'approved' ? 'confirmed' : 'revoked', status: i.decision, qualityScore: i.decision === 'approved' ? Math.min(5, Math.max(1, i.quality ?? 4)) : undefined, reviewerNote: i.note.trim() || undefined, decidedAt: iso(deps), certificateProvided: k.certificateRequired ? !!i.certificateChecked : undefined });
    await saveUser(deps, a, c);
    const msg = { approved: `You are now verified for ${cat.name}.`, rejected: `Your ${cat.name} video was not approved. ${i.note}`, needs_more: `We need another ${cat.name} video. ${i.note}` }[i.decision];
    await notify(deps, a.id, i.decision === 'approved' ? 'Skill verified' : 'Skill review update', msg, '/verify', c);
    await audit(deps, s.userId, `skill.${i.decision}`, a.id, { categoryId: i.categoryId, workerId: i.workerId }, c);
  });
  return { ok: true };
}

export async function disputes(deps: Deps, s: Session) {
  requireAdmin(s);
  return (await deps.db.query<{ data: object }>("SELECT data FROM disputes ORDER BY CASE status WHEN 'resolved' THEN 1 ELSE 0 END, created_at")).map((r) => r.data);
}

export async function startDisputeReview(deps: Deps, s: Session, id: string) {
  requireAdmin(s);
  await deps.db.query("UPDATE disputes SET status = 'under_review', data = jsonb_set(data, '{status}', '\"under_review\"') WHERE id = $1 AND status = 'open'", [id]);
}

export async function violations(deps: Deps, s: Session, onlyOpen: boolean) {
  requireAdmin(s);
  const rows = await deps.db.query<{ data: object; reviewed: boolean; total: string }>(
    `SELECT v.data, v.reviewed, (SELECT count(*) FROM violations x WHERE x.user_id = v.user_id) AS total
       FROM violations v ${onlyOpen ? 'WHERE NOT v.reviewed' : ''} ORDER BY v.created_at DESC LIMIT 200`,
  );
  return rows.map((r) => ({ ...r.data, reviewed: r.reviewed, totalForUser: Number(r.total) }));
}

export async function markViolationReviewed(deps: Deps, s: Session, id: string) {
  requireAdmin(s);
  await deps.db.query('UPDATE violations SET reviewed = TRUE WHERE id = $1', [id]);
}

export async function setSuspended(deps: Deps, s: Session, userId: string, suspended: boolean, reason: string) {
  requireAdmin(s);
  await deps.db.query('UPDATE users SET suspended = $2, online = CASE WHEN $2 THEN FALSE ELSE online END WHERE id = $1', [userId, suspended]);
  await audit(deps, s.userId, suspended ? 'user.suspended' : 'user.unsuspended', userId, { reason });
}

/** Scheduler: 5+ blocked off-app attempts in 30 days → automatic suspension pending review. */
export async function autoSuspendRepeatOffenders(deps: Deps): Promise<string[]> {
  const since = new Date(deps.now() - 30 * 86_400_000).toISOString();
  const rows = await deps.db.query<{ user_id: string }>(
    "SELECT v.user_id FROM violations v JOIN users u ON u.id = v.user_id WHERE v.created_at >= $1 AND NOT u.suspended AND u.role <> 'admin' GROUP BY v.user_id HAVING count(*) >= 5",
    [since],
  );
  for (const r of rows) {
    await deps.db.query('UPDATE users SET suspended = TRUE, online = FALSE WHERE id = $1', [r.user_id]);
    await audit(deps, null, 'user.auto_suspended', r.user_id, { reason: '5+ chat rule violations in 30 days' });
    for (const a of await deps.db.query<{ id: string }>("SELECT id FROM users WHERE role = 'admin'")) await notify(deps, a.id, 'User auto-suspended', `${r.user_id} made 5+ off-app attempts in 30 days. Review the account.`, '/admin/violations');
  }
  return rows.map((r) => r.user_id);
}

export async function metrics(deps: Deps, s: Session) {
  requireAdmin(s);
  const [m] = await deps.db.query<Record<string, string>>(`
    SELECT
      (SELECT COALESCE(SUM((data->'escrow'->>'amount')::bigint),0) FROM jobs WHERE data->'escrow'->>'state' IN ('held','frozen')) AS in_escrow,
      (SELECT COALESCE(SUM((data->'escrow'->>'commission')::bigint),0) FROM jobs) AS commission,
      (SELECT count(*) FROM jobs WHERE status IN ('requested','price_agreed','funded','in_progress','proof_submitted','disputed')) AS active_jobs,
      (SELECT count(*) FROM users WHERE role = 'artisan') AS artisans,
      (SELECT count(*) FROM users WHERE role = 'artisan' AND online) AS online,
      (SELECT count(*) FROM disputes WHERE status <> 'resolved') AS open_disputes,
      (SELECT count(*) FROM violations WHERE NOT reviewed) AS unreviewed_violations,
      (SELECT count(*) FROM payments WHERE kind = 'refund' AND status = 'failed') AS failed_refunds`);
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Number(v)]));
}
