import { seedArtisans } from '../../data/seed';
import { availabilityNow, bookableFor, overlaps, workerFreeFor } from '../availability';
import { accept, canAccept, latestPending, propose, PricePoolError, withdraw } from '../pricePool';
import { rankScore, searchAvailable } from '../ranking';
import { badgesFor, isTrusted, trustScore } from '../trust';
import type { Artisan, Job, SkillVideo } from '../types';
import { checkSkillVideo, isValidNIN, nextIdentityStep, pickChallenges } from '../verification';

const H = 3_600_000;
// A Wednesday at 07:00 local time so working hours (08–18) apply.
const base = new Date(2026, 5, 3, 7, 0, 0, 0).getTime();
const w = (startH: number, endH: number) => ({ start: new Date(base + startH * H).toISOString(), end: new Date(base + endH * H).toISOString() });

function bookedJob(artisanId: string, window: { start: string; end: string }, over: Partial<Job> = {}): Job {
  return {
    id: Math.random().toString(),
    customerId: 'c',
    artisanId,
    categoryId: 'mechanic',
    title: '',
    description: '',
    window,
    address: { label: '', line1: '', area: '', city: '', state: '' },
    size: 'short',
    status: 'funded',
    pricePool: { offers: [] },
    escrow: { state: 'held', amount: 10000, fundedAt: 'x' },
    issuePhotos: [],
    createdAt: '',
    updatedAt: '',
    timeline: [],
    origin: 'app',
    ...over,
  };
}

describe('price pool', () => {
  it('propose → counter → accept locks the price', () => {
    let p = propose({ offers: [] }, 'customer', 10000, 'o1', 't1');
    expect(canAccept(p, 'customer')).toBe(false);
    expect(canAccept(p, 'artisan')).toBe(true);
    p = propose(p, 'artisan', 14000, 'o2', 't2');
    expect(p.offers[0].status).toBe('superseded');
    expect(latestPending(p)?.amount).toBe(14000);
    p = accept(p, 'customer', 't3');
    expect(p.locked).toEqual({ amount: 14000, lockedAt: 't3', offerId: 'o2' });
  });

  it('cannot accept your own offer, or change a locked price', () => {
    const p = propose({ offers: [] }, 'artisan', 5000, 'o1', 't');
    expect(() => accept(p, 'artisan', 't')).toThrow(PricePoolError);
    const locked = accept(p, 'customer', 't');
    expect(() => propose(locked, 'artisan', 9000, 'o2', 't')).toThrow(/locked/);
    expect(() => withdraw(locked, 'artisan')).toThrow(/locked/);
  });

  it('rejects invalid amounts', () => {
    expect(() => propose({ offers: [] }, 'artisan', 500, 'o', 't')).toThrow(/minimum/);
    expect(() => propose({ offers: [] }, 'artisan', 1000.5, 'o', 't')).toThrow(/whole/);
  });
});

describe('availability', () => {
  const tunde = () => seedArtisans().find((a) => a.id === 'art_tunde')!;

  it('detects overlap including the 30 min buffer', () => {
    expect(overlaps(w(2, 4), w(3, 5))).toBe(true);
    expect(overlaps(w(2, 4), w(4.25, 6))).toBe(true); // inside buffer
    expect(overlaps(w(2, 4), w(5, 6))).toBe(false);
  });

  it('allows multiple non-overlapping jobs on the same day', () => {
    const jobs = [bookedJob('art_tunde', w(2, 4))];
    expect(bookableFor(jobs, tunde(), 'mechanic', w(5, 7)).ok).toBe(true);
    expect(bookableFor(jobs, tunde(), 'mechanic', w(3, 5)).ok).toBe(false);
  });

  it('a future funded booking does not hide the artisan now', () => {
    const jobs = [bookedJob('art_tunde', w(26, 28))];
    expect(availabilityNow(jobs, tunde(), base + 2 * H)).toBe('available');
  });

  it('an active booking right now makes an individual unavailable', () => {
    const jobs = [bookedJob('art_tunde', w(1, 4), { status: 'in_progress' })];
    expect(availabilityNow(jobs, tunde(), base + 2 * H)).toBe('on_job');
  });

  it('teams stay available while any worker is free; each worker respects timing', () => {
    const team = seedArtisans().find((a) => a.id === 'art_brightclean')!;
    const jobs = [bookedJob(team.id, w(2, 5), { workerId: 'wk_bc_1', categoryId: 'cleaner' })];
    expect(workerFreeFor(jobs, team, 'wk_bc_1', w(3, 4))).toBe(false);
    expect(workerFreeFor(jobs, team, 'wk_bc_2', w(3, 4))).toBe(true);
    expect(bookableFor(jobs, team, 'cleaner', w(3, 4)).workers).not.toContain('wk_bc_1');
    expect(availabilityNow(jobs, team, base + 3 * H)).toBe('available');
    // Worker still in review for cleaning is never offered.
    expect(bookableFor([], team, 'cleaner', w(3, 4)).workers).not.toContain('wk_bc_4');
  });

  it('cannot book a skill that is not verified', () => {
    expect(bookableFor([], tunde(), 'electrician', w(2, 3))).toMatchObject({ ok: false, reason: expect.stringMatching(/skill-verified/) });
  });
});

describe('ranking & trust', () => {
  const artisans = seedArtisans();

  it('never returns offline artisans', () => {
    const res = searchAvailable(artisans, [], {}, base + 2 * H);
    expect(res.find((r) => r.artisan.id === 'art_offline')).toBeUndefined();
  });

  it('ranks best to last', () => {
    const res = searchAvailable(artisans, [], { categoryId: 'mechanic' }, base + 2 * H);
    expect(res.map((r) => r.artisan.id)).toEqual(['art_tunde', 'art_sola']);
    const scores = res.map((r) => r.score.total);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('rule violations lower trust and rank', () => {
    const a = artisans.find((x) => x.id === 'art_tunde')!;
    const bad: Artisan = { ...a, stats: { ...a.stats, ruleViolations: 3, lastViolationAt: new Date(base).toISOString() } };
    expect(trustScore(bad, base)).toBeLessThan(trustScore(a, base));
    expect(rankScore(bad, 'mechanic', base).total).toBeLessThan(rankScore(a, 'mechanic', base).total);
    expect(isTrusted(a, base)).toBe(true);
    expect(isTrusted(bad, base)).toBe(false);
  });

  it('awards per-skill badges only for approved skills', () => {
    const a = artisans.find((x) => x.id === 'art_tunde')!;
    const labels = badgesFor(a, base, (id) => id).map((b) => b.label);
    expect(labels).toEqual(expect.arrayContaining(['Identity Verified', 'mechanic Verified', 'Trusted']));
    expect(labels).not.toContain('electrician Verified');
  });
});

describe('verification', () => {
  it('validates NIN', () => {
    expect(isValidNIN('12345678901')).toBe(true);
    expect(isValidNIN('1234')).toBe(false);
  });

  it('walks identity steps in order', () => {
    expect(nextIdentityStep({ nin: 'passed', liveness: 'not_started', faceMatch: 'not_started' })).toBe('liveness');
    expect(nextIdentityStep({ nin: 'passed', liveness: 'passed', faceMatch: 'passed' })).toBe('done');
  });

  it('randomises liveness challenges', () => {
    const a = pickChallenges(1).map((c) => c.id).join();
    const b = pickChallenges(99).map((c) => c.id).join();
    expect(pickChallenges(1)).toHaveLength(3);
    expect(a).not.toEqual(b);
  });

  it('rejects skill videos that are short, not live, or face mismatched', () => {
    const v: SkillVideo = { id: 'v', uri: 'x', durationSec: 45, recordedInApp: true, livenessPassed: true, faceMatchScore: 0.9, recordedAt: '', captureHash: 'h' };
    expect(checkSkillVideo(v).ok).toBe(true);
    expect(checkSkillVideo({ ...v, durationSec: 10 }).ok).toBe(false);
    expect(checkSkillVideo({ ...v, faceMatchScore: 0.5 }).problems.join()).toMatch(/face/i);
    expect(checkSkillVideo({ ...v, livenessPassed: false }).ok).toBe(false);
  });
});
