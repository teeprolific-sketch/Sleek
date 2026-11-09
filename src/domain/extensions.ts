import { overlaps } from './availability';
import type { ExtensionRequest, Job } from './types';

/** Artisan asks for more time; the customer approves. Extensions must not collide with the worker's next job. */
export const MAX_EXTENSIONS = 2;
export const EXTENSION_OPTIONS_MIN = [30, 60, 120, 240];

export function canRequestExtension(job: Job): string | null {
  if (job.status !== 'funded' && job.status !== 'in_progress') return 'More time can only be requested before the work is finished.';
  const ext = job.extensions ?? [];
  if (ext.some((e) => e.status === 'pending')) return 'You already have a request waiting for the customer.';
  if (ext.filter((e) => e.status === 'approved').length >= MAX_EXTENSIONS) return `A job can be extended at most ${MAX_EXTENSIONS} times. Agree a new job instead.`;
  return null;
}

export function validateExtension(job: Job, extraMinutes: number, reason: string): string | null {
  const block = canRequestExtension(job);
  if (block) return block;
  if (!Number.isInteger(extraMinutes) || extraMinutes < 15 || extraMinutes > 8 * 60) return 'Ask for between 15 minutes and 8 hours.';
  if (reason.trim().length < 5) return 'Tell the customer why you need more time.';
  return null;
}

export function extendedWindow(job: Job, extraMinutes: number) {
  return { start: job.window.start, end: new Date(new Date(job.window.end).getTime() + extraMinutes * 60_000).toISOString() };
}

/** Would the extension overlap another booking of the same worker? */
export function extensionClashes(job: Job, extraMinutes: number, otherJobs: Job[]): boolean {
  const w = extendedWindow(job, extraMinutes);
  const worker = job.workerId ?? job.artisanId;
  return otherJobs.some(
    (o) => o.id !== job.id && o.artisanId === job.artisanId && (o.workerId ?? o.artisanId) === worker && ['funded', 'in_progress', 'proof_submitted'].includes(o.status) && overlaps(o.window, w),
  );
}

export function pendingExtension(job: Job): ExtensionRequest | undefined {
  return job.extensions?.find((e) => e.status === 'pending');
}
