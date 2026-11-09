import type { Artisan, IdentityVerification, SkillVerification } from './types';

/**
 * Ongoing trust. Completed escrow jobs push trust up; disputes lost,
 * artisan cancellations and chat rule violations pull it down.
 */

export type BadgeKind = 'identity' | 'skill' | 'trusted' | 'team' | 'agency';

export interface Badge {
  kind: BadgeKind;
  label: string;
  categoryId?: string;
}

export function identityVerified(id?: IdentityVerification): boolean {
  return !!id && id.nin === 'passed' && id.liveness === 'passed' && id.faceMatch === 'passed';
}

export function approvedSkills(skills: SkillVerification[]): SkillVerification[] {
  return skills.filter((s) => s.status === 'approved');
}

/** Bayesian average so a single 5★ review doesn't outrank 80 reviews at 4.8★. */
export function bayesianRating(sum: number, count: number, prior = 4.2, weight = 5): number {
  return (prior * weight + sum) / (weight + count);
}

export function displayRating(a: Artisan): number {
  return a.stats.ratingCount ? a.stats.ratingSum / a.stats.ratingCount : 0;
}

const DAY = 86_400_000;

export function recentViolation(a: Artisan, now: number, days = 30): boolean {
  return !!a.stats.lastViolationAt && now - new Date(a.stats.lastViolationAt).getTime() < days * DAY;
}

/** Trust score 0..100. */
export function trustScore(a: Artisan, now: number): number {
  const s = a.stats;
  let score = 0;
  if (identityVerified(a.identity)) score += 30;
  score += Math.min(15, approvedSkills(a.skills).length * 5);
  score += Math.min(25, Math.log2(1 + s.completedJobs) * 4);
  if (s.ratingCount) score += (bayesianRating(s.ratingSum, s.ratingCount) / 5) * 20;
  score += s.onTimeRate * 10;
  const jobsBase = Math.max(1, s.completedJobs + s.cancelledByArtisan);
  score -= (s.cancelledByArtisan / jobsBase) * 25;
  score -= s.disputesLost * 6;
  score -= s.ruleViolations * 4;
  if (recentViolation(a, now)) score -= 10;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function isTrusted(a: Artisan, now: number): boolean {
  const s = a.stats;
  const rating = s.ratingCount ? s.ratingSum / s.ratingCount : 0;
  const disputeRate = s.completedJobs ? s.disputesLost / s.completedJobs : 1;
  return (
    identityVerified(a.identity) &&
    s.completedJobs >= 10 &&
    rating >= 4.5 &&
    disputeRate < 0.05 &&
    !recentViolation(a, now) &&
    trustScore(a, now) >= 70
  );
}

export function badgesFor(a: Artisan, now: number, categoryName: (id: string) => string): Badge[] {
  const out: Badge[] = [];
  if (identityVerified(a.identity)) out.push({ kind: 'identity', label: 'Identity Verified' });
  for (const s of approvedSkills(a.skills)) out.push({ kind: 'skill', label: `${categoryName(s.categoryId)} Verified`, categoryId: s.categoryId });
  if (isTrusted(a, now)) out.push({ kind: 'trusted', label: 'Trusted' });
  if (a.accountType === 'team') out.push({ kind: 'team', label: `Team · ${a.workers.filter((w) => w.active).length} workers` });
  if (a.accountType === 'agency') out.push({ kind: 'agency', label: `Agency · ${a.workers.filter((w) => w.active).length} workers` });
  return out;
}
