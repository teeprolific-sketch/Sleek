import { displayRating, isTrusted } from './trust';
import type { Artisan, Category, Job } from './types';

/**
 * Sleek Protection (service guarantee) — optional cover on eligible jobs:
 * if something goes wrong within 7 days of approval, the customer can claim
 * up to ₦50,000 (or the job price, if lower). Claims are reviewed by Sleek.
 */
export const PROTECTION_DAYS = 7;
export const PROTECTION_CAP = 50_000;
export const PROTECTION_MAX_JOB = 300_000;

export function protectionEligible(job: Pick<Job, 'pricePool' | 'escrow'>, artisan: Artisan, category: Category, now: number): { eligible: boolean; reason?: string } {
  const amount = job.pricePool.locked?.amount ?? job.escrow.amount;
  if (amount > PROTECTION_MAX_JOB) return { eligible: false, reason: 'Jobs above ₦300,000 need a custom contract.' };
  const strong = isTrusted(artisan, now) || (artisan.stats.completedJobs >= 20 && displayRating(artisan) >= 4.5);
  if (!strong) return { eligible: false, reason: 'Available with Trusted or highly rated artisans.' };
  if (category.risk === 'high') {
    const skill = artisan.skills.find((s) => s.categoryId === category.id);
    if (!skill?.certificateProvided) return { eligible: false, reason: 'High-risk trades need a verified certificate for protection.' };
  }
  return { eligible: true };
}

export function protectionWindow(job: Job): { open: boolean; until?: string } {
  if (job.status !== 'completed' || !job.escrow.releasedAt) return { open: false };
  const until = new Date(new Date(job.escrow.releasedAt).getTime() + PROTECTION_DAYS * 86_400_000).toISOString();
  return { open: true, until };
}

export function protectionCover(job: Job): number {
  return Math.min(PROTECTION_CAP, job.escrow.amount);
}
