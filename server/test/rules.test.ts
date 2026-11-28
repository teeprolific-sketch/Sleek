import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { sweep } from '../src/scheduler';
import { fund, setup, upload, weekdayAt, type Harness } from './helpers';

const H = 3_600_000;

async function newCustomer(h: Harness, phone: string, name = 'Test Customer') {
  const otp = await h.call('POST', '/v1/auth/otp', undefined, { phone });
  const ver = await h.call('POST', '/v1/auth/verify', undefined, { phone, code: otp.body.devCode });
  const reg = await h.call('POST', '/v1/auth/register', undefined, { registrationToken: ver.body.registrationToken, name, role: 'customer', city: 'Lagos', area: 'Surulere' });
  await h.call('POST', '/v1/me/addresses', reg.body.token, { label: 'Home', line1: '1 Test Street', area: 'Surulere', city: 'Lagos', state: 'Lagos' });
  return reg.body.token as string;
}

/** Create a job and lock its price, ready to fund. */
async function lockedJob(h: Harness, cust: string, artisanTok: string, artisanId: string, categoryId: string, window: { start: string; end: string }, amount = 20000) {
  const j = await h.call('POST', '/v1/jobs', cust, { artisanId, categoryId, description: 'Please help with this job today.', window });
  assert.equal(j.status, 201, JSON.stringify(j.body));
  await h.call('POST', `/v1/jobs/${j.body.id}/price-offers`, artisanTok, { amount });
  const acc = await h.call('POST', `/v1/jobs/${j.body.id}/price-offers/accept`, cust);
  assert.equal(acc.body.status, 'price_agreed');
  return j.body.id as string;
}

describe('trust rules on the server', () => {
  let h: Harness;
  let c1: string;
  let c2: string;
  let musa: string;
  let admin: string;

  before(async () => {
    h = await setup();
    c1 = await newCustomer(h, '08031110001', 'Ada Obi');
    c2 = await newCustomer(h, '08031110002', 'Bola Ade');
    musa = h.token('art_musa', 'artisan');
    admin = h.token('adm_sleek', 'admin');
  });
  after(() => h.close());

  it('never double-books a worker, even when two payments land at the same time', async () => {
    const w = weekdayAt(h.clock.t, 10);
    const overlapping = { start: new Date(new Date(w.start).getTime() + H).toISOString(), end: new Date(new Date(w.end).getTime() + H).toISOString() };
    const j1 = await lockedJob(h, c1, musa, 'art_musa', 'plumber', w);
    const j2 = await lockedJob(h, c2, musa, 'art_musa', 'plumber', overlapping); // both requests allowed: nothing funded yet
    const i1 = await h.call('POST', `/v1/jobs/${j1}/escrow`, c1);
    const i2 = await h.call('POST', `/v1/jobs/${j2}/escrow`, c2);
    const w1 = h.gw.completeCharge(i1.body.reference);
    const w2 = h.gw.completeCharge(i2.body.reference);
    const [r1, r2] = await Promise.all([
      h.call('POST', '/v1/webhooks/paystack', undefined, w1.body, { 'x-paystack-signature': w1.signature }),
      h.call('POST', '/v1/webhooks/paystack', undefined, w2.body, { 'x-paystack-signature': w2.signature }),
    ]);
    const outcomes = [r1.body.outcome, r2.body.outcome].sort();
    assert.deepEqual(outcomes, ['funded', 'refunded_slot_taken']);
    assert.equal(h.gw.refunds.length, 1, 'the losing payment is refunded automatically');
    assert.equal(h.gw.refunds[0].amount, 20000);
    // and a third customer can't even start a booking for that slot now
    const j3 = await h.call('POST', '/v1/jobs', c2, { artisanId: 'art_musa', categoryId: 'plumber', description: 'Leaking tap in the kitchen.', window: w });
    assert.equal(j3.status, 422);
  });

  it('rejects a webhook whose amount does not match the locked price', async () => {
    const id = await lockedJob(h, c1, musa, 'art_musa', 'plumber', weekdayAt(h.clock.t, 15, 3, 1), 15000);
    const init = await h.call('POST', `/v1/jobs/${id}/escrow`, c1);
    const wh = h.gw.completeCharge(init.body.reference, { amount: 100 });
    h.gw.charges.get(init.body.reference)!.amount = 100; // PSP says only ₦100 was paid
    const r = await h.call('POST', '/v1/webhooks/paystack', undefined, wh.body, { 'x-paystack-signature': wh.signature });
    assert.equal(r.body.outcome, 'amount_mismatch');
    assert.equal((await h.call('GET', `/v1/jobs/${id}`, c1)).body.status, 'price_agreed');
  });

  it('refunds 90% when the customer cancels less than 24h before the job', async () => {
    const w = weekdayAt(h.clock.t, 16, 4, 1); // 4pm: never overlaps the 10am booking above, whatever weekday the suite runs on
    const id = await lockedJob(h, c2, musa, 'art_musa', 'plumber', w, 30000);
    await fund(h, id, c2);
    h.clock.t = new Date(w.start).getTime() - 5 * H;
    const before = h.gw.refunds.length;
    const r = await h.call('POST', `/v1/jobs/${id}/cancel`, c2, { reason: 'Travelling' });
    assert.equal(r.body.status, 'cancelled');
    assert.deepEqual(h.gw.refunds.slice(before).map((x) => x.amount), [27000]);
    const earn = await h.call('GET', '/v1/earnings', musa);
    assert.ok(earn.body.ledger.some((l: any) => l.type === 'cancellation_fee' && l.amount === 3000));
  });

  it('freezes escrow on dispute; admin split refunds the customer and pays the artisan', async () => {
    h.clock.t = Date.now();
    const w = weekdayAt(h.clock.t, 11, 8, 2);
    const id = await lockedJob(h, c1, musa, 'art_musa', 'plumber', w, 40000);
    await fund(h, id, c1);
    h.clock.t = new Date(w.start).getTime();
    await h.call('POST', `/v1/jobs/${id}/start`, musa);
    const proof = await upload(h, musa, 'proof_of_work', id);
    await h.call('POST', `/v1/jobs/${id}/proof`, musa, { mediaIds: [proof], note: 'Fixed the leak' });
    const ev = await upload(h, c1, 'dispute_evidence', id);
    const d = await h.call('POST', `/v1/jobs/${id}/disputes`, c1, { reason: 'poor_quality', details: 'Still leaking an hour after he left.', evidenceMediaIds: [ev] });
    assert.equal(d.status, 201);
    assert.equal((await h.call('GET', `/v1/jobs/${id}`, c1)).body.escrow.state, 'frozen');
    assert.equal((await h.call('POST', `/v1/jobs/${id}/approve`, c1)).status, 422, 'no approval while disputed');
    assert.equal((await h.call('POST', `/v1/disputes/${d.body.id}/response`, musa, { text: 'Leak was from a different pipe.' })).status, 200);
    assert.equal((await h.call('POST', `/v1/admin/disputes/${d.body.id}/resolve`, musa, { outcome: 'split', note: 'nope nope nope' })).status, 403);
    const refundsBefore = h.gw.refunds.length;
    const res = await h.call('POST', `/v1/admin/disputes/${d.body.id}/resolve`, admin, { outcome: 'split', artisanShare: 0.5, note: 'Partial fix confirmed by photos; splitting.' });
    assert.equal(res.status, 200);
    assert.equal(res.body.job.escrow.refundedToCustomer, 20000);
    assert.deepEqual(h.gw.refunds.slice(refundsBefore).map((x) => x.amount), [20000]);
    assert.equal((await h.call('POST', `/v1/admin/disputes/${d.body.id}/resolve`, admin, { outcome: 'refund_customer', note: 'second attempt here' })).status, 409);
  });

  it('auto-releases after the window, and expires unpaid locked prices after 24h', async () => {
    h.clock.t = Date.now();
    const w = weekdayAt(h.clock.t, 14, 5, 1);
    const id = await lockedJob(h, c2, musa, 'art_musa', 'plumber', w, 12000);
    await fund(h, id, c2);
    h.clock.t = new Date(w.start).getTime();
    await h.call('POST', `/v1/jobs/${id}/start`, musa);
    const proof = await upload(h, musa, 'proof_of_work', id);
    const sub = await h.call('POST', `/v1/jobs/${id}/proof`, musa, { mediaIds: [proof] });
    const unpaid = await lockedJob(h, c1, musa, 'art_musa', 'plumber', weekdayAt(h.clock.t, 9, 3, 1), 5000);
    h.clock.t = new Date(sub.body.proof.autoReleaseAt).getTime() + 60_000;
    const out = await sweep(h.deps);
    assert.ok(!('skipped' in out));
    assert.ok(out.released!.includes(id));
    assert.ok(out.expired!.includes(unpaid));
    assert.equal((await h.call('GET', `/v1/jobs/${id}`, c2)).body.escrow.releaseReason, 'auto_release');
    assert.equal((await h.call('GET', `/v1/jobs/${unpaid}`, c1)).body.status, 'cancelled');
  });

  it('Ugent: reads freely, but every booking waits for the user’s own confirmation', async () => {
    h.clock.t = Date.now();
    const link = await h.call('POST', '/v1/agent/link', c1);
    const agentTok = link.body.agentToken;
    const search = await h.call('POST', '/v1/agent/actions/search_available_artisans', agentTok, { category_id: 'mechanic', city: 'Lagos' });
    assert.equal(search.body.status, 'ok');
    assert.equal((await h.call('GET', '/v1/jobs', agentTok)).status, 403, 'agent tokens are limited to agent endpoints');
    const w = weekdayAt(h.clock.t, 13, 3, 1);
    const book = await h.call('POST', '/v1/agent/actions/initiate_booking', agentTok, { artisan_id: 'art_tunde', category_id: 'mechanic', description: 'Car battery keeps dying', start: w.start, end: w.end });
    assert.equal(book.body.status, 'requires_confirmation');
    assert.equal((await h.call('POST', `/v1/agent/requests/${book.body.request_id}/confirm`, agentTok)).status, 403, 'Ugent cannot confirm for the user');
    const ok = await h.call('POST', `/v1/agent/requests/${book.body.request_id}/confirm`, c1);
    assert.equal(ok.body.status, 'confirmed');
    const job = await h.call('GET', `/v1/jobs/${ok.body.result.job_id}`, c1);
    assert.equal(job.body.origin, 'ugent');
    await h.call('POST', '/v1/agent/unlink', c1);
    assert.equal((await h.call('POST', '/v1/agent/actions/list_my_jobs', agentTok, {})).status, 401, 'unlinking revokes the agent token');
  });

  it('verifies a new artisan end to end and blocks NIN reuse', async () => {
    const otp = await h.call('POST', '/v1/auth/otp', undefined, { phone: '07031234567' });
    const ver = await h.call('POST', '/v1/auth/verify', undefined, { phone: '07031234567', code: otp.body.devCode });
    const reg = await h.call('POST', '/v1/auth/register', undefined, { registrationToken: ver.body.registrationToken, name: 'Kemi Bello', role: 'artisan', city: 'Lagos', area: 'Ikeja' });
    const a = reg.body.token;
    assert.equal((await h.call('POST', '/v1/artisan/online', a, { online: true })).status, 422, 'cannot go online unverified');
    assert.equal((await h.call('POST', '/v1/verification/nin', a, { nin: '12345678901', name: 'Kemi Bello' })).status, 200);
    const sess = await h.call('POST', '/v1/verification/liveness/session', a, {});
    assert.equal(sess.body.challenges.length, 3);
    const frames = [];
    for (let i = 0; i < 3; i++) frames.push(await upload(h, a, 'liveness_frame'));
    const live = await h.call('POST', '/v1/verification/liveness', a, { sessionId: sess.body.sessionId, mediaIds: frames });
    assert.equal(live.status, 200, JSON.stringify(live.body));
    assert.equal((await h.call('POST', '/v1/verification/liveness', a, { sessionId: sess.body.sessionId, mediaIds: frames })).status, 422, 'a liveness session is single-use');
    assert.equal((await h.call('POST', '/v1/media', a, { purpose: 'skill_video', contentType: 'image/jpeg' })).status, 400, 'skill proof must be a video');
    const short = await upload(h, a, 'skill_video', undefined, 'video/mp4');
    assert.equal((await h.call('POST', '/v1/verification/skills', a, { categoryId: 'cleaner', mediaId: short, durationSec: 10 })).status, 422);
    const vid = await upload(h, a, 'skill_video', undefined, 'video/mp4');
    const sk = await h.call('POST', '/v1/verification/skills', a, { categoryId: 'cleaner', mediaId: vid, durationSec: 60 });
    assert.equal(sk.body.status, 'approved', 'a video that passes every automated check goes live immediately');
    assert.equal((await h.call('POST', '/v1/artisan/online', a, { online: true })).body.online, true, 'the dashboard is live straight away');
    const queue = await h.call('GET', '/v1/admin/verifications', admin);
    assert.ok(queue.body.some((q: any) => q.artisanId === reg.body.userId), 'the Trust team still audits it afterwards');
    assert.equal((await h.call('POST', '/v1/admin/verifications/decision', admin, { artisanId: reg.body.userId, categoryId: 'cleaner', decision: 'approved', quality: 4 })).status, 200);
    // a second account with the same NIN is refused
    const otp2 = await h.call('POST', '/v1/auth/otp', undefined, { phone: '07031234568' });
    const ver2 = await h.call('POST', '/v1/auth/verify', undefined, { phone: '07031234568', code: otp2.body.devCode });
    const reg2 = await h.call('POST', '/v1/auth/register', undefined, { registrationToken: ver2.body.registrationToken, name: 'Kemi Bello', role: 'artisan', city: 'Lagos', area: 'Ikeja' });
    const dup = await h.call('POST', '/v1/verification/nin', reg2.body.token, { nin: '12345678901', name: 'Kemi Bello' });
    assert.equal(dup.body.error.code, 'nin_in_use');
  });

  it('high-risk skills need a certificate check; repeat rule-breakers are auto-suspended', async () => {
    const q = await h.call('GET', '/v1/admin/verifications', admin);
    const elec = q.body.find((x: any) => x.artisanId === 'art_tunde' && x.skill.categoryId === 'electrician');
    assert.ok(elec?.highRisk);
    const noCert = await h.call('POST', '/v1/admin/verifications/decision', admin, { artisanId: 'art_tunde', categoryId: 'electrician', decision: 'approved' });
    assert.equal(noCert.body.error.code, 'certificate_required');

    const sola = h.token('art_sola', 'artisan');
    const w = weekdayAt(Date.now(), 16, 6, 1);
    const j = await h.call('POST', '/v1/jobs', c2, { artisanId: 'art_sola', categoryId: 'mechanic', description: 'Car will not start in the morning.', window: w });
    for (let i = 0; i < 5; i++) await h.call('POST', `/v1/jobs/${j.body.id}/messages`, sola, { text: `whatsapp me ${i}` });
    const out = await sweep(h.deps);
    assert.ok(out.suspended!.includes('art_sola'));
    assert.equal((await h.call('GET', '/v1/me', sola)).status, 403);
    const search = await h.call('GET', '/v1/artisans/search?category=mechanic&city=Lagos', c2);
    assert.ok(!search.body.some((r: any) => r.artisan.id === 'art_sola'), 'suspended artisans never appear in search');
  });
});
