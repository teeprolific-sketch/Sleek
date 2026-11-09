import type { CancellationRecord, Escrow, Job, JobSize, JobStatus } from './types';

/**
 * Escrow & job lifecycle rules.
 *
 * requested ─(price locked)→ price_agreed ─(customer funds)→ funded
 *   funded ─(artisan starts, at/after window start)→ in_progress
 *   in_progress ─(proof uploaded)→ proof_submitted
 *   proof_submitted ─(customer approves | auto-release timer)→ completed
 *   proof_submitted|in_progress ─(customer disputes)→ disputed ─(Sleek decides)→ resolved
 *   requested|price_agreed|funded ─(cancel)→ cancelled (refund per policy)
 *   requested ─(artisan declines)→ declined
 */

export const COMMISSION_RATE = 0.1; // 10% standard
export const TRUSTED_COMMISSION_RATE = 0.08; // Trusted artisans pay less

export const AUTO_RELEASE_HOURS: Record<JobSize, number> = {
  short: 24,
  normal: 48,
  large: 72,
};

const HOUR = 3_600_000;

export const STATUS_LABEL: Record<JobStatus, string> = {
  requested: 'Negotiating',
  price_agreed: 'Awaiting Payment',
  funded: 'Upcoming',
  in_progress: 'On Job',
  proof_submitted: 'Pending Approval',
  completed: 'Completed',
  disputed: 'In Dispute',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
  declined: 'Declined',
};

export type StatusTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'primary';

export const STATUS_TONE: Record<JobStatus, StatusTone> = {
  requested: 'info',
  price_agreed: 'warning',
  funded: 'primary',
  in_progress: 'primary',
  proof_submitted: 'warning',
  completed: 'success',
  disputed: 'danger',
  resolved: 'neutral',
  cancelled: 'neutral',
  declined: 'neutral',
};

export const ACTIVE_STATUSES: JobStatus[] = ['requested', 'price_agreed', 'funded', 'in_progress', 'proof_submitted', 'disputed'];
/** Statuses that hold the artisan's time slot. */
export const BLOCKING_STATUSES: JobStatus[] = ['funded', 'in_progress', 'proof_submitted'];

export class EscrowRuleError extends Error {}

/** Classify a job for its auto-release window. */
export function classifyJobSize(amount: number, windowStart: string, windowEnd: string, categoryDefault: JobSize): JobSize {
  const hours = (new Date(windowEnd).getTime() - new Date(windowStart).getTime()) / HOUR;
  if (amount >= 250_000 || hours > 10) return 'large';
  if (amount <= 30_000 && hours <= 3) return categoryDefault === 'large' ? 'normal' : 'short';
  return categoryDefault === 'short' && amount <= 60_000 ? 'short' : categoryDefault === 'large' ? 'large' : 'normal';
}

export function autoReleaseAt(submittedAt: string, size: JobSize): string {
  return new Date(new Date(submittedAt).getTime() + AUTO_RELEASE_HOURS[size] * HOUR).toISOString();
}

export function commissionFor(amount: number, trusted: boolean): { commission: number; payout: number } {
  const rate = trusted ? TRUSTED_COMMISSION_RATE : COMMISSION_RATE;
  const commission = Math.round(amount * rate);
  return { commission, payout: amount - commission };
}

/** Location is shown to the artisan only after escrow is funded (and hidden again if the job is cancelled). */
export function isLocationDisclosed(job: Pick<Job, 'escrow' | 'status'>): boolean {
  const disclosedStatuses: JobStatus[] = ['funded', 'in_progress', 'proof_submitted', 'disputed', 'completed', 'resolved'];
  return !!job.escrow.fundedAt && disclosedStatuses.includes(job.status);
}

export function canFund(job: Job): boolean {
  return job.status === 'price_agreed' && !!job.pricePool.locked && job.escrow.state === 'none';
}

export function fundEscrow(job: Job, paymentRef: string, at: string): Escrow {
  if (!canFund(job)) throw new EscrowRuleError('Agree a price in the Price Pool before paying into escrow.');
  return { state: 'held', amount: job.pricePool.locked!.amount, fundedAt: at, paymentRef };
}

/** Artisan may start from 1 hour before the agreed window. */
export function canStart(job: Job, now: number): boolean {
  return job.status === 'funded' && job.escrow.state === 'held' && now >= new Date(job.window.start).getTime() - HOUR;
}

export function canSubmitProof(job: Job): boolean {
  return job.status === 'in_progress' && job.escrow.state === 'held';
}

export function canApprove(job: Job): boolean {
  return job.status === 'proof_submitted' && job.escrow.state === 'held';
}

export function canDispute(job: Job): boolean {
  return (job.status === 'in_progress' || job.status === 'proof_submitted' || job.status === 'funded') && job.escrow.state === 'held';
}

export function release(escrow: Escrow, trusted: boolean, reason: NonNullable<Escrow['releaseReason']>, at: string): Escrow {
  if (escrow.state !== 'held' && escrow.state !== 'frozen') throw new EscrowRuleError('No funds are held for this job.');
  const { commission, payout } = commissionFor(escrow.amount, trusted);
  return { ...escrow, state: 'released', releasedAt: at, commission, releasedToArtisan: payout, releaseReason: reason, refundedToCustomer: 0 };
}

/** Jobs whose auto-release timer has elapsed with no response from the customer. */
export function dueForAutoRelease(job: Job, now: number): boolean {
  return canApprove(job) && !!job.proof && new Date(job.proof.autoReleaseAt).getTime() <= now;
}

// ---------------------------------------------------------------------------
// Cancellation policy
// ---------------------------------------------------------------------------

export interface CancellationQuote {
  allowed: boolean;
  reason?: string;
  refundAmount: number;
  artisanCompensation: number;
  trustPenalty: boolean;
  summary: string;
}

/**
 * - Before escrow: free, nothing to refund.
 * - Customer cancels after funding, ≥24h before start: 100% refund.
 * - Customer cancels after funding, <24h before start: 90% refund, 10% to artisan for the reserved slot.
 * - Artisan cancels after funding: 100% refund, artisan trust penalty.
 * - Once work has started, cancellation is not possible — open a dispute instead.
 */
export function quoteCancellation(job: Job, by: 'customer' | 'artisan', now: number): CancellationQuote {
  if (['completed', 'resolved', 'cancelled', 'declined'].includes(job.status)) {
    return { allowed: false, reason: 'This job is already closed.', refundAmount: 0, artisanCompensation: 0, trustPenalty: false, summary: '' };
  }
  if (job.status === 'in_progress' || job.status === 'proof_submitted' || job.status === 'disputed') {
    return {
      allowed: false,
      reason: 'Work has already started. If something is wrong, open a dispute so Sleek can review it.',
      refundAmount: 0,
      artisanCompensation: 0,
      trustPenalty: false,
      summary: '',
    };
  }
  if (job.escrow.state !== 'held') {
    return { allowed: true, refundAmount: 0, artisanCompensation: 0, trustPenalty: false, summary: 'No payment has been made, so there is nothing to refund.' };
  }
  const amount = job.escrow.amount;
  if (by === 'artisan') {
    return { allowed: true, refundAmount: amount, artisanCompensation: 0, trustPenalty: true, summary: 'The customer gets a full refund. Cancelling a funded job lowers your trust score.' };
  }
  const hoursToStart = (new Date(job.window.start).getTime() - now) / HOUR;
  if (hoursToStart >= 24) {
    return { allowed: true, refundAmount: amount, artisanCompensation: 0, trustPenalty: false, summary: 'You will get a full refund to your original payment method.' };
  }
  const artisanCompensation = Math.round(amount * 0.1);
  return {
    allowed: true,
    refundAmount: amount - artisanCompensation,
    artisanCompensation,
    trustPenalty: false,
    summary: 'Less than 24 hours to the job: 90% is refunded and 10% compensates the artisan for the reserved time.',
  };
}

export function applyCancellation(job: Job, by: 'customer' | 'artisan' | 'admin', reason: string, now: number): { escrow: Escrow; record: CancellationRecord } {
  const q = by === 'admin' ? { allowed: true, refundAmount: job.escrow.amount, artisanCompensation: 0 } : quoteCancellation(job, by, now);
  if (!q.allowed) throw new EscrowRuleError((q as CancellationQuote).reason ?? 'Cancellation not allowed.');
  const at = new Date(now).toISOString();
  const escrow: Escrow =
    job.escrow.state === 'held'
      ? {
          ...job.escrow,
          state: q.artisanCompensation > 0 ? 'partially_refunded' : 'refunded',
          refundedToCustomer: q.refundAmount,
          releasedToArtisan: q.artisanCompensation,
          commission: 0,
          releasedAt: at,
        }
      : job.escrow;
  return { escrow, record: { by, reason, at, refundAmount: q.refundAmount, artisanCompensation: q.artisanCompensation } };
}

/** Resolve a dispute: artisanShare is the fraction of escrow paid to the artisan (commission applies to that part). */
export function resolveDisputeEscrow(escrow: Escrow, artisanShare: number, trusted: boolean, at: string): Escrow {
  if (escrow.state !== 'frozen' && escrow.state !== 'held') throw new EscrowRuleError('No funds are held for this job.');
  const share = Math.min(1, Math.max(0, artisanShare));
  const gross = Math.round(escrow.amount * share);
  const { commission, payout } = commissionFor(gross, trusted);
  const refund = escrow.amount - gross;
  return {
    ...escrow,
    state: share === 1 ? 'released' : share === 0 ? 'refunded' : 'partially_refunded',
    releasedAt: at,
    releasedToArtisan: payout,
    commission,
    refundedToCustomer: refund,
    releaseReason: 'dispute_resolution',
  };
}
