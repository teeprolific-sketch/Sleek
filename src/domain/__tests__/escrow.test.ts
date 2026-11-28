import {
  applyCancellation,
  autoReleaseAt,
  canFund,
  canStart,
  classifyJobSize,
  commissionFor,
  dueForAutoRelease,
  fundEscrow,
  isLocationDisclosed,
  quoteCancellation,
  release,
  resolveDisputeEscrow,
} from '../escrow';
import { accept, propose } from '../pricePool';
import type { Job } from '../types';

const H = 3_600_000;
const NOW = new Date('2026-06-01T08:00:00Z').getTime();

function job(over: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    customerId: 'c1',
    artisanId: 'a1',
    categoryId: 'mechanic',
    title: 't',
    description: 'd',
    window: { start: new Date(NOW + 48 * H).toISOString(), end: new Date(NOW + 50 * H).toISOString() },
    address: { label: 'Home', line1: '1 St', area: 'Yaba', city: 'Lagos', state: 'Lagos' },
    size: 'normal',
    status: 'requested',
    pricePool: { offers: [] },
    escrow: { state: 'none', amount: 0 },
    issuePhotos: [],
    createdAt: '',
    updatedAt: '',
    timeline: [],
    origin: 'app',
    ...over,
  };
}

function lockedJob(amount = 20000): Job {
  let pool = propose({ offers: [] }, 'artisan', amount, 'o1', 'now');
  pool = accept(pool, 'customer', 'now');
  return job({ status: 'price_agreed', pricePool: pool });
}

describe('escrow funding & location disclosure', () => {
  it('cannot fund before the price is locked', () => {
    expect(canFund(job())).toBe(false);
    expect(() => fundEscrow(job(), 'ref', 'now')).toThrow(/Price Pool/);
  });

  it('funds the locked amount exactly', () => {
    const j = lockedJob(25000);
    const e = fundEscrow(j, 'ref', 'now');
    expect(e).toMatchObject({ state: 'held', amount: 25000 });
  });

  it('hides the address until escrow is funded', () => {
    const j = lockedJob();
    expect(isLocationDisclosed(j)).toBe(false);
    const funded = { ...j, status: 'funded' as const, escrow: fundEscrow(j, 'ref', new Date(NOW).toISOString()) };
    expect(isLocationDisclosed(funded)).toBe(true);
    expect(isLocationDisclosed({ ...funded, status: 'cancelled' })).toBe(false);
  });
});

describe('job start', () => {
  it('allows starting from 1 hour before the window', () => {
    const j = { ...lockedJob(), status: 'funded' as const, escrow: { state: 'held' as const, amount: 1, fundedAt: 'x' } };
    expect(canStart(j, NOW)).toBe(false);
    expect(canStart(j, NOW + 47 * H)).toBe(true);
  });
});

describe('release & commission', () => {
  it('takes a flat 20% commission', () => {
    expect(commissionFor(20000, false)).toEqual({ commission: 4000, payout: 16000 });
    expect(commissionFor(20000, true)).toEqual({ commission: 4000, payout: 16000 });
  });

  it('releases to artisan minus commission', () => {
    const e = release({ state: 'held', amount: 50000 }, false, 'customer_approved', 'now');
    expect(e).toMatchObject({ state: 'released', releasedToArtisan: 40000, commission: 10000 });
  });

  it('auto-release windows are 24/48/72h', () => {
    const t0 = '2026-01-01T00:00:00.000Z';
    expect(autoReleaseAt(t0, 'short')).toBe('2026-01-02T00:00:00.000Z');
    expect(autoReleaseAt(t0, 'normal')).toBe('2026-01-03T00:00:00.000Z');
    expect(autoReleaseAt(t0, 'large')).toBe('2026-01-04T00:00:00.000Z');
  });

  it('detects jobs due for auto-release', () => {
    const j = job({
      status: 'proof_submitted',
      escrow: { state: 'held', amount: 100 },
      proof: { photos: [], note: '', submittedAt: '', autoReleaseAt: new Date(NOW).toISOString() },
    });
    expect(dueForAutoRelease(j, NOW - 1)).toBe(false);
    expect(dueForAutoRelease(j, NOW)).toBe(true);
    expect(dueForAutoRelease({ ...j, status: 'disputed' }, NOW)).toBe(false);
  });

  it('classifies job sizes', () => {
    const s = new Date(NOW).toISOString();
    expect(classifyJobSize(15000, s, new Date(NOW + 2 * H).toISOString(), 'short')).toBe('short');
    expect(classifyJobSize(80000, s, new Date(NOW + 5 * H).toISOString(), 'normal')).toBe('normal');
    expect(classifyJobSize(300000, s, new Date(NOW + 5 * H).toISOString(), 'normal')).toBe('large');
    expect(classifyJobSize(50000, s, new Date(NOW + 30 * H).toISOString(), 'normal')).toBe('large');
  });
});

describe('cancellation policy', () => {
  const funded = () => ({ ...lockedJob(20000), status: 'funded' as const, escrow: { state: 'held' as const, amount: 20000, fundedAt: 'x' } });

  it('is free before escrow', () => {
    expect(quoteCancellation(lockedJob(), 'customer', NOW)).toMatchObject({ allowed: true, refundAmount: 0 });
  });

  it('full refund when ≥24h before start', () => {
    expect(quoteCancellation(funded(), 'customer', NOW)).toMatchObject({ allowed: true, refundAmount: 20000, artisanCompensation: 0 });
  });

  it('90% refund when <24h before start', () => {
    expect(quoteCancellation(funded(), 'customer', NOW + 30 * H)).toMatchObject({ refundAmount: 18000, artisanCompensation: 2000 });
  });

  it('artisan cancelling refunds fully and penalises trust', () => {
    expect(quoteCancellation(funded(), 'artisan', NOW + 30 * H)).toMatchObject({ refundAmount: 20000, trustPenalty: true });
  });

  it('cannot cancel once work has started', () => {
    const j = { ...funded(), status: 'in_progress' as const };
    expect(quoteCancellation(j, 'customer', NOW).allowed).toBe(false);
    expect(() => applyCancellation(j, 'customer', 'x', NOW)).toThrow(/dispute/);
  });

  it('applies partial refund to escrow', () => {
    const { escrow } = applyCancellation(funded(), 'customer', 'changed plans', NOW + 30 * H);
    expect(escrow).toMatchObject({ state: 'partially_refunded', refundedToCustomer: 18000, releasedToArtisan: 2000 });
  });
});

describe('dispute resolution', () => {
  it('splits escrow and charges commission only on the artisan share', () => {
    const e = resolveDisputeEscrow({ state: 'frozen', amount: 40000 }, 0.5, false, 'now');
    expect(e).toMatchObject({ state: 'partially_refunded', refundedToCustomer: 20000, releasedToArtisan: 16000, commission: 4000 });
  });
  it('full refund', () => {
    expect(resolveDisputeEscrow({ state: 'frozen', amount: 40000 }, 0, false, 'now')).toMatchObject({ state: 'refunded', refundedToCustomer: 40000, releasedToArtisan: 0 });
  });
});
