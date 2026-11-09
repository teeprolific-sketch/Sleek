import type { PriceOffer, PricePool } from './types';

/**
 * Price Pool — the in-chat price agreement.
 *
 * - Either party can propose or counter.
 * - Only the *other* party can accept the latest pending offer.
 * - Once accepted the price is locked forever for that job.
 */

export const MIN_JOB_PRICE = 1_000;
export const MAX_JOB_PRICE = 50_000_000;

export type Party = 'customer' | 'artisan';

export class PricePoolError extends Error {}

export function latestPending(pool: PricePool): PriceOffer | undefined {
  for (let i = pool.offers.length - 1; i >= 0; i--) {
    if (pool.offers[i].status === 'pending') return pool.offers[i];
  }
  return undefined;
}

export function validateAmount(amount: number): string | null {
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) return 'Enter a whole Naira amount.';
  if (amount < MIN_JOB_PRICE) return `The minimum job price is ₦${MIN_JOB_PRICE.toLocaleString('en-NG')}.`;
  if (amount > MAX_JOB_PRICE) return 'That amount is above the single-job limit. Contact support for large contracts.';
  return null;
}

export function propose(pool: PricePool, by: Party, amount: number, id: string, at: string, note?: string): PricePool {
  if (pool.locked) throw new PricePoolError('The price is already locked for this job.');
  const err = validateAmount(amount);
  if (err) throw new PricePoolError(err);
  const offers = pool.offers.map((o) => (o.status === 'pending' ? { ...o, status: 'superseded' as const } : o));
  return { ...pool, offers: [...offers, { id, by, amount, at, note, status: 'pending' }] };
}

export function withdraw(pool: PricePool, by: Party): PricePool {
  if (pool.locked) throw new PricePoolError('The price is already locked for this job.');
  const pending = latestPending(pool);
  if (!pending || pending.by !== by) throw new PricePoolError('You have no pending offer to withdraw.');
  return { ...pool, offers: pool.offers.map((o) => (o.id === pending.id ? { ...o, status: 'withdrawn' } : o)) };
}

export function canAccept(pool: PricePool, by: Party): boolean {
  const pending = latestPending(pool);
  return !pool.locked && !!pending && pending.by !== by;
}

export function accept(pool: PricePool, by: Party, at: string): PricePool {
  if (pool.locked) throw new PricePoolError('The price is already locked for this job.');
  const pending = latestPending(pool);
  if (!pending) throw new PricePoolError('There is no offer to accept.');
  if (pending.by === by) throw new PricePoolError('You can’t accept your own offer. Wait for the other party.');
  return {
    offers: pool.offers.map((o) => (o.id === pending.id ? { ...o, status: 'accepted' } : o)),
    locked: { amount: pending.amount, lockedAt: at, offerId: pending.id },
  };
}

export function emptyPool(): PricePool {
  return { offers: [] };
}
