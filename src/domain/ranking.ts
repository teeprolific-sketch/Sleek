import { availabilityNow, bookableFor } from './availability';
import { approvedSkills, bayesianRating, identityVerified, recentViolation } from './trust';
import type { Artisan, Job, TimeWindow } from './types';

/**
 * Ranking: best → last, using verification strength, completed jobs,
 * ratings, reliability and proof-of-work quality. Only AVAILABLE artisans are
 * ever returned for search and dashboards.
 */

export interface RankBreakdown {
  verification: number; // 0..30
  experience: number; // 0..20
  rating: number; // 0..25
  reliability: number; // 0..15
  proofQuality: number; // 0..10
  penalties: number; // <= 0
  total: number;
}

export function rankScore(a: Artisan, categoryId: string | undefined, now: number): RankBreakdown {
  const s = a.stats;
  const skill = categoryId ? a.skills.find((k) => k.categoryId === categoryId) : undefined;
  const teamSkill = categoryId
    ? a.workers.flatMap((w) => w.skills).find((k) => k.categoryId === categoryId && k.status === 'approved')
    : undefined;

  let verification = 0;
  if (identityVerified(a.identity)) verification += 12;
  if (a.identity.faceMatchScore) verification += Math.min(4, (a.identity.faceMatchScore - 0.8) * 20);
  if (skill?.status === 'approved' || teamSkill) verification += 10;
  verification += Math.min(4, approvedSkills(a.skills).length);

  const experience = Math.min(20, Math.log2(1 + s.completedJobs) * 3);
  const rating = s.ratingCount ? (bayesianRating(s.ratingSum, s.ratingCount) / 5) * 25 : 10;
  const jobsBase = Math.max(1, s.completedJobs + s.cancelledByArtisan);
  const reliability = Math.max(0, 15 * s.onTimeRate - (s.cancelledByArtisan / jobsBase) * 15);
  const quality = skill?.qualityScore ?? teamSkill?.qualityScore ?? 3;
  const proofQuality = (quality / 5) * 10;
  let penalties = -s.disputesLost * 3 - s.ruleViolations * 2;
  if (recentViolation(a, now)) penalties -= 5;

  const total = Math.round((verification + experience + rating + reliability + proofQuality + penalties) * 10) / 10;
  return { verification, experience, rating, reliability, proofQuality, penalties, total };
}

export interface SearchQuery {
  categoryId?: string;
  text?: string;
  city?: string;
  window?: TimeWindow;
  categoryName?: (id: string) => string;
}

export interface RankedArtisan {
  artisan: Artisan;
  score: RankBreakdown;
  freeWorkers?: string[];
}

export function searchAvailable(artisans: Artisan[], jobs: Job[], q: SearchQuery, now: number): RankedArtisan[] {
  const text = q.text?.trim().toLowerCase();
  return artisans
    .filter((a) => {
      if (q.city && a.city !== q.city) return false;
      const hasSkill = (cid: string) =>
        a.skills.some((s) => s.categoryId === cid && s.status === 'approved') ||
        a.workers.some((w) => w.active && w.skills.some((s) => s.categoryId === cid && s.status === 'approved'));
      if (q.categoryId && !hasSkill(q.categoryId)) return false;
      if (!q.categoryId && approvedSkills(a.skills).length === 0 && !a.workers.some((w) => approvedSkills(w.skills).length)) return false;
      if (text) {
        const skillNames = a.skills.filter((s) => s.status === 'approved').map((s) => q.categoryName?.(s.categoryId) ?? s.categoryId);
        const hay = [a.name, a.businessName, a.area, a.city, ...skillNames].join(' ').toLowerCase();
        if (!hay.includes(text)) return false;
      }
      if (q.window && q.categoryId) return bookableFor(jobs, a, q.categoryId, q.window).ok;
      return availabilityNow(jobs, a, now) === 'available';
    })
    .map((a) => ({
      artisan: a,
      score: rankScore(a, q.categoryId, now),
      freeWorkers: q.window && q.categoryId ? bookableFor(jobs, a, q.categoryId, q.window).workers : undefined,
    }))
    .sort((x, y) => y.score.total - x.score.total);
}
