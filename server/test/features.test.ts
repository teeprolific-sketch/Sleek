import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeReferralCode } from '../../src/domain/referrals';
import { fund, setup, upload, weekdayAt, type Harness } from './helpers';

const H = 3_600_000;

async function register(h: Harness, phone: string, name: string, role: 'customer' | 'artisan', extra: Record<string, string> = {}) {
  const otp = await h.call('POST', '/v1/auth/otp', undefined, { phone });
  const ver = await h.call('POST', '/v1/auth/verify', undefined, { phone, code: otp.body.devCode });
  const reg = await h.call('POST', '/v1/auth/register', undefined, { registrationToken: ver.body.registrationToken, name, role, city: 'Lagos', area: 'Yaba', ...extra });
  assert.equal(reg.status, 200, JSON.stringify(reg.body));
  if (role === 'customer') await h.call('POST', '/v1/me/addresses', reg.body.token, { label: 'Home', line1: '2 Test Close', area: 'Yaba', city: 'Lagos', state: 'Lagos' });
  return { token: reg.body.token as string, id: reg.body.userId as string };
}

/** Book Tunde, lock price, fund escrow. */
async function fundedJob(h: Harness, cust: string, window: { start: string; end: string }, amount = 20000) {
  const tunde = h.token('art_tunde', 'artisan');
  const j = await h.call('POST', '/v1/jobs', cust, { artisanId: 'art_tunde', categoryId: 'mechanic', description: 'Engine light is on and car jerks.', window });
  assert.equal(j.status, 201, JSON.stringify(j.body));
  await h.call('POST', `/v1/jobs/${j.body.id}/price-offers`, tunde, { amount });
  await h.call('POST', `/v1/jobs/${j.body.id}/price-offers/accept`, cust);
  await fund(h, j.body.id, cust);
  return j.body.id as string;
}

async function complete(h: Harness, cust: string, jobId: string, window: { start: string }) {
  const tunde = h.token('art_tunde', 'artisan');
  h.clock.t = new Date(window.start).getTime();
  await h.call('POST', `/v1/jobs/${jobId}/start`, tunde);
  const p = await upload(h, tunde, 'proof_of_work', jobId);
  await h.call('POST', `/v1/jobs/${jobId}/proof`, tunde, { mediaIds: [p] });
  const ap = await h.call('POST', `/v1/jobs/${jobId}/approve`, cust);
  assert.equal(ap.body.status, 'completed', JSON.stringify(ap.body));
}

describe('v2 features on the server', () => {
  let h: Harness;
  let tunde: string;
  let admin: string;
  let cust: { token: string; id: string };

  before(async () => {
    h = await setup();
    tunde = h.token('art_tunde', 'artisan');
    admin = h.token('adm_sleek', 'admin');
    // The seeded demo customer's referral code
    const amakaCode = makeReferralCode('Amaka Johnson', 'cus_amaka');
    cust = await register(h, '08061112222', 'Zainab Musa', 'customer', { referralCode: amakaCode });
  });
  after(() => h.close());

  it('en route → more time requested → customer approves; clashes are refused', async () => {
    const w = weekdayAt(h.clock.t, 10, 2, 2);
    const id = await fundedJob(h, cust.token, w);
    assert.equal((await h.call('POST', `/v1/jobs/${id}/en-route`, tunde)).status, 422, 'too early');
    h.clock.t = new Date(w.start).getTime() - H;
    const er = await h.call('POST', `/v1/jobs/${id}/en-route`, tunde);
    assert.ok(er.body.enRouteAt);
    // another funded job right after: 13:00–14:00
    const next = { start: new Date(new Date(w.end).getTime() + H).toISOString(), end: new Date(new Date(w.end).getTime() + 2 * H).toISOString() };
    h.clock.t = Date.now();
    const other = await register(h, '08061113333', 'Femi Bayo', 'customer');
    await fundedJob(h, other.token, next);
    h.clock.t = new Date(w.start).getTime() - H;
    assert.equal((await h.call('POST', `/v1/jobs/${id}/extensions`, tunde, { extraMinutes: 120, reason: 'Need a spare part' })).body.error.code, 'extension_clash');
    const ok = await h.call('POST', `/v1/jobs/${id}/extensions`, tunde, { extraMinutes: 30, reason: 'Need a spare part' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((await h.call('POST', `/v1/jobs/${id}/extensions/decision`, tunde, { approve: true })).status, 403);
    const dec = await h.call('POST', `/v1/jobs/${id}/extensions/decision`, cust.token, { approve: true });
    assert.equal(new Date(dec.body.window.end).getTime(), new Date(w.end).getTime() + 30 * 60_000);
  });

  it('tips go 100% to the artisan, once, only after a paid job', async () => {
    h.clock.t = Date.now();
    const w = weekdayAt(h.clock.t, 9, 9, 1);
    const id = await fundedJob(h, cust.token, w, 15000);
    assert.equal((await h.call('POST', `/v1/jobs/${id}/tip`, cust.token, { amount: 1000 })).status, 422, 'no tip before completion');
    await complete(h, cust.token, id, w);
    const before = (await h.call('GET', '/v1/earnings', tunde)).body.balance;
    const t = await h.call('POST', `/v1/jobs/${id}/tip`, cust.token, { amount: 2000 });
    const wh = h.gw.completeCharge(t.body.reference);
    const r = await h.call('POST', '/v1/webhooks/paystack', undefined, wh.body, { 'x-paystack-signature': wh.signature });
    assert.equal(r.body.outcome, 'tip_credited');
    assert.equal((await h.call('GET', '/v1/earnings', tunde)).body.balance, before + 2000);
    assert.equal((await h.call('POST', `/v1/jobs/${id}/tip`, cust.token, { amount: 500 })).status, 422, 'one tip per job');
  });

  it('referral rewards the referrer when the new customer completes their first escrow job', async () => {
    const amaka = h.token('cus_amaka', 'customer');
    const refs = await h.call('GET', '/v1/me/referrals', amaka);
    assert.equal(refs.body.code, makeReferralCode('Amaka Johnson', 'cus_amaka'));
    const mine = refs.body.referrals.find((r: any) => r.refereeId === cust.id);
    assert.equal(mine.status, 'qualified', 'Zainab completed a job in the previous test');
    const me = await h.call('GET', '/v1/me', amaka);
    assert.equal(me.body.credit, 1000);
  });

  it('two-way reviews: the artisan rates the customer once', async () => {
    const jobs = await h.call('GET', '/v1/jobs?filter=completed', tunde);
    const id = jobs.body[0].id;
    assert.equal((await h.call('POST', `/v1/jobs/${id}/customer-review`, tunde, { professionalism: 5, clarity: 4, payment: 5, comment: 'Clear and kind' })).status, 200);
    assert.equal((await h.call('POST', `/v1/jobs/${id}/customer-review`, tunde, { professionalism: 5, clarity: 5, payment: 5 })).status, 409);
    const me = await h.call('GET', '/v1/me', cust.token);
    assert.equal(me.body.customerStats.ratingCount, 1);
  });

  it('Sleek Protection: a claim within 7 days, decided by admin, paid back to the customer', async () => {
    const jobs = await h.call('GET', '/v1/jobs?filter=completed', cust.token);
    const id = jobs.body[0].id;
    assert.equal((await h.call('POST', `/v1/jobs/${id}/protection-claims`, cust.token, { details: 'short' })).status, 400);
    const claim = await h.call('POST', `/v1/jobs/${id}/protection-claims`, cust.token, { details: 'The new part stopped working two days later.' });
    assert.equal(claim.status, 200, JSON.stringify(claim.body));
    const refunds = h.gw.refunds.length;
    const d = await h.call('POST', `/v1/admin/protection-claims/${claim.body.id}`, admin, { approve: true, payout: 999999 });
    assert.ok(d.body.payout <= 50000, 'capped at the protection cover');
    assert.equal(h.gw.refunds.length, refunds + 1);
  });

  it('safety alerts reach admins and are acknowledged', async () => {
    const a = await h.call('POST', '/v1/safety/alerts', cust.token, { kind: 'sos', note: 'Someone is following me' });
    assert.equal(a.status, 201);
    const list = await h.call('GET', '/v1/admin/safety', admin);
    assert.equal(list.body[0].id, a.body.id);
    assert.equal((await h.call('GET', '/v1/admin/safety', cust.token)).status, 403);
    await h.call('POST', `/v1/admin/safety/${a.body.id}`, admin, { status: 'acknowledged' });
    const notes = await h.call('GET', '/v1/notifications', cust.token);
    assert.ok(notes.body.some((n: any) => n.title === 'Sleek Safety is on it' && n.category === 'safety'));
    await h.call('POST', '/v1/admin/notes', admin, { targetType: 'safety', targetId: a.body.id, text: 'Called the user, she is safe.' });
    assert.equal((await h.call('GET', `/v1/admin/notes/safety/${a.body.id}`, admin)).body.length, 1);
  });

  it('favourites and saved matching preferences shape search', async () => {
    assert.deepEqual((await h.call('PUT', '/v1/me/favourites/art_tunde', cust.token)).body.favourites, ['art_tunde']);
    assert.equal((await h.call('GET', '/v1/me/favourites', cust.token)).body[0].id, 'art_tunde');
    const all = await h.call('GET', '/v1/me/search?category=cleaner', cust.token);
    await h.call('PUT', '/v1/me/preferences', cust.token, { maxDistanceKm: 5 });
    const near = await h.call('GET', '/v1/me/search?category=cleaner', cust.token);
    assert.ok(near.body.results.length < all.body.results.length || all.body.results.length === 0);
    assert.ok(near.body.results.every((r: any) => r.distanceKm <= 5));
    assert.equal(near.body.hiddenByPreferences, all.body.results.length - near.body.results.length);
  });

  it('notification preferences mute pushes but keep the inbox', async () => {
    await h.call('PUT', '/v1/me/notification-preferences', cust.token, { enabled: { price_offers: false } });
    const w = weekdayAt(Date.now(), 15, 12, 1);
    h.clock.t = Date.now();
    const j = await h.call('POST', '/v1/jobs', cust.token, { artisanId: 'art_tunde', categoryId: 'mechanic', description: 'Check the brakes please.', window: w });
    await h.call('POST', `/v1/jobs/${j.body.id}/price-offers`, tunde, { amount: 9000 });
    const n = (await h.call('GET', '/v1/notifications', cust.token)).body.find((x: any) => x.title === 'New price offer');
    assert.equal(n.silent, true);
  });

  it('time off blocks bookings and cannot cover a funded job', async () => {
    const start = new Date(weekdayAt(Date.now(), 0, 20).start);
    const end = new Date(start.getTime() + 24 * H);
    const off = await h.call('POST', '/v1/artisan/time-off', tunde, { start: start.toISOString(), end: end.toISOString(), reason: 'Holiday' });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    const w = { start: new Date(start.getTime() + 10 * H).toISOString(), end: new Date(start.getTime() + 11 * H).toISOString() };
    assert.equal((await h.call('POST', '/v1/jobs', cust.token, { artisanId: 'art_tunde', categoryId: 'mechanic', description: 'Oil change on Friday.', window: w })).status, 422);
    const funded = (await h.call('GET', '/v1/jobs?filter=active', tunde)).body.find((j: any) => j.status === 'funded');
    assert.equal((await h.call('POST', '/v1/artisan/time-off', tunde, { start: funded.window.start, end: funded.window.end, reason: 'Sick' })).body.error.code, 'time_off_clash');
  });
});
