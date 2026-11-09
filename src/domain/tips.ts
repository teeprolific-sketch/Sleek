import type { Job } from './types';

/** Optional tip after release. 100% goes to the artisan — Sleek takes no commission on tips. */
export const TIP_MIN = 200;
export const TIP_MAX = 50_000;
export const TIP_PRESETS = [500, 1000, 2000, 5000];

export function canTip(job: Job): string | null {
  if (job.status !== 'completed' && job.status !== 'resolved') return 'You can add a tip after the job is complete.';
  if (!(job.escrow.releasedToArtisan && job.escrow.releasedToArtisan > 0)) return 'Tips are for jobs where the artisan was paid.';
  if (job.tip) return 'You already tipped for this job. Thank you!';
  return null;
}

export function validateTip(job: Job, amount: number): string | null {
  const block = canTip(job);
  if (block) return block;
  if (!Number.isInteger(amount) || amount < TIP_MIN || amount > TIP_MAX) return `Tips are between ₦${TIP_MIN.toLocaleString('en-NG')} and ₦${TIP_MAX.toLocaleString('en-NG')}.`;
  return null;
}
