import type { Job } from './types';

/**
 * The single job timeline both sides see:
 * Booked → Artisan En Route → Work Started → Proof Submitted → Approved → Paid
 * (with "Requested" and "Price agreed" as lead-in steps before escrow).
 */
export type StageKey = 'requested' | 'price_agreed' | 'booked' | 'en_route' | 'started' | 'proof' | 'approved' | 'paid';
export type StageState = 'done' | 'current' | 'upcoming' | 'halted';

export interface Stage {
  key: StageKey;
  label: string;
  at?: string;
  state: StageState;
  detail?: string;
}

export const STAGE_LABEL: Record<StageKey, string> = {
  requested: 'Requested',
  price_agreed: 'Price agreed',
  booked: 'Booked · escrow funded',
  en_route: 'Artisan en route',
  started: 'Work started',
  proof: 'Proof submitted',
  approved: 'Approved',
  paid: 'Paid',
};

export interface TimelineResult {
  stages: Stage[];
  /** Why the flow stopped, if it did. */
  halted?: { reason: 'cancelled' | 'declined' | 'disputed' | 'resolved'; label: string };
  /** Index of the stage the job is waiting on. */
  currentIndex: number;
}

export function jobTimeline(job: Job): TimelineResult {
  const lockedAt = job.pricePool.locked?.lockedAt;
  const released = job.escrow.state === 'released' || (job.status === 'resolved' && (job.escrow.releasedToArtisan ?? 0) > 0);
  const startedReached = !!job.startedAt || ['in_progress', 'proof_submitted', 'completed'].includes(job.status) || !!job.proof;
  const at: Record<StageKey, string | undefined> = {
    requested: job.createdAt,
    price_agreed: lockedAt,
    booked: job.escrow.fundedAt,
    en_route: job.enRouteAt,
    started: job.startedAt,
    proof: job.proof?.submittedAt,
    approved: released ? job.escrow.releasedAt : undefined,
    paid: released ? job.escrow.releasedAt : undefined,
  };
  const done: Record<StageKey, boolean> = {
    requested: true,
    price_agreed: !!lockedAt,
    booked: !!job.escrow.fundedAt,
    en_route: !!job.enRouteAt || startedReached,
    started: startedReached,
    proof: !!job.proof,
    approved: released,
    paid: released,
  };
  const keys: StageKey[] = ['requested', 'price_agreed', 'booked', 'en_route', 'started', 'proof', 'approved', 'paid'];
  let lastDone = -1;
  keys.forEach((k, i) => {
    if (done[k]) lastDone = i;
  });
  const halted =
    job.status === 'cancelled'
      ? { reason: 'cancelled' as const, label: job.cancellation ? `Cancelled by ${job.cancellation.by}` : 'Cancelled' }
      : job.status === 'declined'
        ? { reason: 'declined' as const, label: 'Declined by artisan' }
        : job.status === 'disputed'
          ? { reason: 'disputed' as const, label: 'In dispute — escrow frozen while Sleek reviews' }
          : job.status === 'resolved'
            ? { reason: 'resolved' as const, label: 'Dispute resolved by Sleek' }
            : undefined;
  const currentIndex = Math.min(keys.length - 1, lastDone + 1);
  const detail: Partial<Record<StageKey, string>> = {
    en_route: done.en_route && !job.enRouteAt ? 'Not marked' : undefined,
    approved: job.escrow.releaseReason === 'auto_release' ? 'Auto-approved (no response in time)' : job.escrow.releaseReason === 'dispute_resolution' ? 'Decided by Sleek' : undefined,
    paid: released ? 'To the artisan’s Sleek balance' : undefined,
  };
  const stages = keys.map((k, i): Stage => ({
    key: k,
    label: STAGE_LABEL[k],
    at: at[k],
    detail: detail[k],
    state: i <= lastDone ? 'done' : i === currentIndex ? (halted ? 'halted' : 'current') : 'upcoming',
  }));
  return { stages, halted, currentIndex: lastDone === keys.length - 1 ? keys.length : currentIndex };
}

/** Artisan can mark "on my way" once escrow is funded, from 3 hours before the start. */
export function canMarkEnRoute(job: Job, now: number): boolean {
  return job.status === 'funded' && !job.enRouteAt && now >= new Date(job.window.start).getTime() - 3 * 3_600_000;
}
