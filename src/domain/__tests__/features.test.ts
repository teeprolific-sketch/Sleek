import { seedArtisans } from '../../data/seed';
import { category } from '../../data/categories';
import { bookableFor } from '../availability';
import { customerBadge, customerScore, validateCustomerReview } from '../customerRating';
import { canRequestExtension, extensionClashes, validateExtension } from '../extensions';
import { areaDistanceKm } from '../geo';
import { artisanInsights } from '../insights';
import { activePreferenceCount, applyPreferences, DEFAULT_PREFS } from '../matching';
import { DEFAULT_NOTIFICATION_PREFS, shouldPush } from '../notifications';
import { autoPayoutDue } from '../payouts';
import { protectionEligible, protectionWindow } from '../protection';
import { searchAvailable } from '../ranking';
import { isValidReferralCode, makeReferralCode, referralQualifies } from '../referrals';
import { canMarkEnRoute, jobTimeline } from '../timeline';
import { validateTip } from '../tips';
import type { Job } from '../types';

const H = 3_600_000;
const base = new Date(2026, 5, 3, 7, 0, 0, 0).getTime(); // Wednesday 07:00
const w = (s: number, e: number) => ({ start: new Date(base + s * H).toISOString(), end: new Date(base + e * H).toISOString() });

function job(over: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    customerId: 'c1',
    artisanId: 'art_tunde',
    categoryId: 'mechanic',
    title: 'Brakes',
    description: '',
    window: w(3, 5),
    address: { label: '', line1: '', area: 'Yaba', city: 'Lagos', state: 'Lagos' },
    size: 'short',
    status: 'requested',
    pricePool: { offers: [] },
    escrow: { state: 'none', amount: 0 },
    issuePhotos: [],
    createdAt: new Date(base).toISOString(),
    updatedAt: '',
    timeline: [],
    origin: 'app',
    ...over,
  };
}

describe('job timeline', () => {
  it('walks Booked → En route → Started → Proof → Approved → Paid', () => {
    const funded = job({ status: 'funded', pricePool: { offers: [], locked: { amount: 10000, lockedAt: 'x', offerId: 'o' } }, escrow: { state: 'held', amount: 10000, fundedAt: 'f' } });
    let t = jobTimeline(funded);
    expect(t.stages.find((s) => s.key === 'booked')!.state).toBe('done');
    expect(t.stages.find((s) => s.key === 'en_route')!.state).toBe('current');
    t = jobTimeline({ ...funded, status: 'in_progress', enRouteAt: 'e', startedAt: 's' });
    expect(t.stages.find((s) => s.key === 'proof')!.state).toBe('current');
    t = jobTimeline({ ...funded, status: 'completed', startedAt: 's', proof: { photos: [], note: '', submittedAt: 'p', autoReleaseAt: 'a' }, escrow: { state: 'released', amount: 10000, releasedAt: 'r', releaseReason: 'auto_release' } });
    expect(t.stages.every((s) => s.state === 'done')).toBe(true);
    expect(t.stages.find((s) => s.key === 'en_route')!.detail).toBe('Not marked');
    expect(t.stages.find((s) => s.key === 'approved')!.detail).toMatch(/Auto-approved/);
  });

  it('shows where a disputed job halted', () => {
    const t = jobTimeline(job({ status: 'disputed', escrow: { state: 'frozen', amount: 1, fundedAt: 'f' }, startedAt: 's', proof: { photos: [], note: '', submittedAt: 'p', autoReleaseAt: 'a' } }));
    expect(t.halted?.reason).toBe('disputed');
    expect(t.stages.find((s) => s.key === 'approved')!.state).toBe('halted');
  });

  it('allows "on my way" from 3 hours before the start', () => {
    const j = job({ status: 'funded', escrow: { state: 'held', amount: 1, fundedAt: 'f' } });
    expect(canMarkEnRoute(j, base - H)).toBe(false);
    expect(canMarkEnRoute(j, base + 0.5 * H)).toBe(true);
  });
});

describe('more-time requests', () => {
  const funded = job({ status: 'in_progress', escrow: { state: 'held', amount: 1, fundedAt: 'f' } });
  it('validates and limits requests', () => {
    expect(validateExtension(funded, 60, 'Need to fetch a part')).toBeNull();
    expect(validateExtension(funded, 5, 'too short')).toMatch(/15 minutes/);
    expect(canRequestExtension({ ...funded, extensions: [{ id: 'e', extraMinutes: 30, newEnd: '', reason: '', status: 'pending', at: '' }] })).toMatch(/waiting/);
    expect(canRequestExtension({ ...funded, status: 'proof_submitted' })).toMatch(/before the work/);
  });
  it('refuses an extension that would collide with the next booking', () => {
    const next = job({ id: 'j2', status: 'funded', window: w(6, 7), escrow: { state: 'held', amount: 1, fundedAt: 'f' } });
    expect(extensionClashes(funded, 30, [next])).toBe(false); // ends exactly at the 30-min travel buffer
    expect(extensionClashes(funded, 60, [next])).toBe(true);
    expect(extensionClashes(funded, 30, [{ ...next, window: w(8, 9) }])).toBe(false);
  });
});

describe('tips', () => {
  it('only after a paid job, once, within limits', () => {
    const done = job({ status: 'completed', escrow: { state: 'released', amount: 10000, releasedToArtisan: 9000 } });
    expect(validateTip(done, 1000)).toBeNull();
    expect(validateTip(done, 100)).toMatch(/between/);
    expect(validateTip({ ...done, tip: { amount: 500, at: '', reference: '' } }, 500)).toMatch(/already/);
    expect(validateTip(job({ status: 'funded' }), 500)).toMatch(/after the job/);
  });
});

describe('two-way reviews', () => {
  it('scores customers and awards a badge', () => {
    expect(validateCustomerReview({ professionalism: 5, clarity: 0, payment: 5 })).toMatch(/1 to 5/);
    const stats = { ratingCount: 4, professionalismSum: 19, claritySum: 19, paymentSum: 20 };
    expect(customerScore(stats)!.overall).toBe(4.8);
    expect(customerBadge(stats)).toBe('Great customer');
    expect(customerBadge({ ...stats, ratingCount: 2 })).toBeNull();
  });
});

describe('smart matching preferences', () => {
  const artisans = seedArtisans();
  const now = base + 2 * H;
  const ctx = (categoryId?: string) => ({ categoryId, customer: { area: 'Yaba', city: 'Lagos' }, jobs: [], now });

  it('measures area-level distance', () => {
    expect(areaDistanceKm({ area: 'Yaba', city: 'Lagos' }, { area: 'Yaba', city: 'Lagos' })).toBe(0);
    const d = areaDistanceKm({ area: 'Yaba', city: 'Lagos' }, { area: 'Ajah', city: 'Lagos' })!;
    expect(d).toBeGreaterThan(15);
    expect(d % 0.5).toBe(0);
  });

  it('filters by gender only for relevant trades, rating, distance and price', () => {
    const all = searchAvailable(artisans, [], { city: 'Lagos' }, now);
    const female = applyPreferences(all, { ...DEFAULT_PREFS, genderPreference: 'female' }, ctx('makeup'));
    expect(female.every((r) => r.artisan.gender === 'female')).toBe(true);
    const mech = searchAvailable(artisans, [], { city: 'Lagos', categoryId: 'mechanic' }, now);
    expect(applyPreferences(mech, { ...DEFAULT_PREFS, genderPreference: 'female' }, ctx('mechanic')).length).toBe(mech.length); // not gender-relevant
    expect(applyPreferences(mech, { ...DEFAULT_PREFS, minRating: 4.5 }, ctx('mechanic')).map((r) => r.artisan.id)).toEqual(['art_tunde']);
    const near = applyPreferences(all, { ...DEFAULT_PREFS, maxDistanceKm: 5 }, ctx());
    expect(near.every((r) => (r.distanceKm ?? 99) <= 5)).toBe(true);
    expect(near.some((r) => r.artisan.id === 'art_tunde')).toBe(true); // Yaba → Yaba
    expect(applyPreferences(mech, { ...DEFAULT_PREFS, priceMax: 12500 }, ctx('mechanic')).map((r) => r.artisan.id)).toEqual(['art_sola']);
    expect(activePreferenceCount({ ...DEFAULT_PREFS, trustedOnly: true, minRating: 4 })).toBe(2);
  });

  it('time off blocks bookings', () => {
    const t = { ...artisans.find((a) => a.id === 'art_tunde')!, timeOff: [{ id: 't', start: w(0, 0).start, end: w(24, 24).start, reason: 'Travel' }] };
    expect(bookableFor([], t, 'mechanic', w(3, 4))).toMatchObject({ ok: false, reason: expect.stringMatching(/time off/) });
  });
});

describe('payout schedule', () => {
  const evening = new Date(2026, 5, 5, 19).getTime(); // Friday 7pm
  it('pays out on schedule above the minimum, once a day', () => {
    expect(autoPayoutDue({ mode: 'manual', minimum: 5000 }, 50000, evening)).toBe(0);
    expect(autoPayoutDue({ mode: 'daily', minimum: 5000 }, 4000, evening)).toBe(0);
    expect(autoPayoutDue({ mode: 'daily', minimum: 5000 }, 8000, evening)).toBe(8000);
    expect(autoPayoutDue({ mode: 'daily', minimum: 5000, lastAutoPayoutAt: new Date(evening - H).toISOString() }, 8000, evening)).toBe(0);
    expect(autoPayoutDue({ mode: 'weekly', weekday: 1, minimum: 5000 }, 8000, evening)).toBe(0);
    expect(autoPayoutDue({ mode: 'weekly', weekday: 5, minimum: 5000 }, 8000, evening)).toBe(8000);
    expect(autoPayoutDue({ mode: 'daily', minimum: 5000 }, 8000, new Date(2026, 5, 5, 10).getTime())).toBe(0);
  });
});

describe('referrals', () => {
  it('makes valid codes and qualifies on completed jobs', () => {
    const code = makeReferralCode('Amaka Johnson', 'cus_amaka');
    expect(isValidReferralCode(code)).toBe(true);
    expect(code.startsWith('AMAKA')).toBe(true);
    expect(referralQualifies('customer', 1)).toBe(true);
    expect(referralQualifies('artisan', 2)).toBe(false);
  });
});

describe('Sleek Protection', () => {
  const a = seedArtisans().find((x) => x.id === 'art_tunde')!;
  it('covers trusted artisans on standard jobs under the cap', () => {
    const j = job({ pricePool: { offers: [], locked: { amount: 20000, lockedAt: '', offerId: '' } } });
    expect(protectionEligible(j, a, category('mechanic'), base).eligible).toBe(true);
    expect(protectionEligible({ ...j, pricePool: { offers: [], locked: { amount: 400000, lockedAt: '', offerId: '' } } }, a, category('mechanic'), base).eligible).toBe(false);
    const sola = seedArtisans().find((x) => x.id === 'art_sola')!;
    expect(protectionEligible(j, sola, category('mechanic'), base).eligible).toBe(false);
    expect(protectionWindow(job({ status: 'completed', escrow: { state: 'released', amount: 1, releasedAt: new Date(base).toISOString() } })).open).toBe(true);
  });
});

describe('performance insights', () => {
  it('computes acceptance and completion', () => {
    const jobs = [
      job({ id: 'a', status: 'declined' }),
      job({ id: 'b', status: 'completed', pricePool: { offers: [], locked: { amount: 1, lockedAt: '', offerId: '' } }, escrow: { state: 'released', amount: 10000, fundedAt: 'f', commission: 1000, releasedToArtisan: 9000 } }),
      job({ id: 'c', status: 'cancelled', cancellation: { by: 'artisan', reason: '', at: '', refundAmount: 1, artisanCompensation: 0 }, pricePool: { offers: [], locked: { amount: 1, lockedAt: '', offerId: '' } }, escrow: { state: 'refunded', amount: 1, fundedAt: 'f' } }),
      job({ id: 'd', status: 'requested' }),
    ];
    const ins = artisanInsights('art_tunde', jobs, [], [], base);
    expect(ins.acceptanceRate).toBeCloseTo(2 / 3);
    expect(ins.completionRate).toBe(0.5);
    expect(ins.cancelledByArtisan).toBe(1);
    expect(ins.commissionPaid).toBe(1000);
    expect(ins.ratingTrend).toHaveLength(6);
  });
});

describe('notification preferences', () => {
  const night = new Date(2026, 5, 3, 23).getTime();
  it('respects toggles and quiet hours but never mutes safety', () => {
    const p = { ...DEFAULT_NOTIFICATION_PREFS, quietHours: { enabled: true, start: 22, end: 7 } };
    expect(shouldPush(DEFAULT_NOTIFICATION_PREFS, 'promotions', base)).toBe(false);
    expect(shouldPush(p, 'price_offers', night)).toBe(false);
    expect(shouldPush(p, 'safety', night)).toBe(true);
    expect(shouldPush(p, 'payments', night)).toBe(true);
    expect(shouldPush({ ...p, enabled: { safety: false } }, 'safety', base)).toBe(true);
  });
});

import { hashNIN, namesMatch, statusAfterAutoCheck as autoStatus } from '../verification';
import { category as cat } from '../../data/categories';

describe('instant verification and anti-fake rules', () => {
  it('approves a skill video instantly when every automated check passes', () => {
    expect(autoStatus(cat('mechanic'), { ok: true, problems: [] })).toBe('approved');
    expect(autoStatus(cat('electrician'), { ok: false, problems: ['x'] })).toBe('rejected');
  });
  it('requires the NIN name to contain the account first and last name', () => {
    expect(namesMatch('Tunde Bakare', 'BAKARE Tunde Adewale')).toBe(true);
    expect(namesMatch('Tunde Bakare', 'Femi Bakare')).toBe(false);
    expect(namesMatch('Tunde', 'Tunde Bakare')).toBe(false);
  });
  it('hashes a NIN the same way every time so reuse across accounts is caught', () => {
    expect(hashNIN('123 4567 8901')).toBe(hashNIN('12345678901'));
    expect(hashNIN('12345678901')).not.toBe(hashNIN('12345678902'));
  });
});

import { feeExpired, feeFor, feeSplit, releasesOn, validateFee } from '../fees';
import { CATEGORIES, defaultFeeType } from '../../data/categories';

describe('100 trades and upfront fees', () => {
  it('has exactly 100 unique trades', () => {
    expect(CATEGORIES).toHaveLength(100);
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(100);
  });
  it('uses Sleek’s default fee type per trade unless the artisan or admin sets one', () => {
    expect(defaultFeeType('mechanic')).toBe('inspection');
    expect(defaultFeeType('interior_designer')).toBe('consultancy');
    expect(defaultFeeType('barber')).toBe('booking');
    expect(feeFor({ fees: undefined }, 'mechanic')).toEqual({ type: 'inspection', amount: 5000 });
    expect(feeFor({ fees: undefined }, 'mechanic', { mechanic: 'booking' })).toEqual({ type: 'booking', amount: 2000 });
    expect(feeFor({ fees: { mechanic: { type: 'consultancy', amount: 10000 } } }, 'mechanic')).toEqual({ type: 'consultancy', amount: 10000 });
  });
  it('takes Sleek’s 20% from every fee', () => {
    expect(feeSplit(5000, 0.2)).toEqual({ commission: 1000, toArtisan: 4000 });
  });
  it('validates amounts', () => {
    expect(validateFee({ type: 'inspection', amount: 100 })).toMatch(/at least/);
    expect(validateFee({ type: 'inspection', amount: 5000 })).toBeNull();
  });
  it('releases inspection fees only after the inspection, others when the artisan engages', () => {
    const held = { type: 'inspection' as const, amount: 5000, status: 'held' as const };
    expect(releasesOn(held, 'engaged')).toBe(false);
    expect(releasesOn(held, 'inspected')).toBe(true);
    expect(releasesOn({ ...held, type: 'booking' }, 'engaged')).toBe(true);
    expect(releasesOn({ ...held, status: 'released' }, 'price_agreed')).toBe(false);
  });
  it('refunds a fee when the artisan never responds', () => {
    const j = { status: 'requested', fee: { type: 'booking', amount: 2000, status: 'held', paidAt: new Date(0).toISOString() }, pricePool: { offers: [] } } as never;
    expect(feeExpired(j, 25 * 3_600_000)).toBe(true);
    expect(feeExpired(j, 2 * 3_600_000)).toBe(false);
  });
});
