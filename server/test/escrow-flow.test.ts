import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { signWebhook } from '../src/providers/payments';
import { fund, setup, upload, weekdayAt, type Harness } from './helpers';

describe('customer ↔ artisan escrow flow (HTTP)', () => {
  let h: Harness;
  let cust: string;
  let tunde: string;
  let jobId: string;
  const win = () => weekdayAt(h.clock.t, 10);
  let window: { start: string; end: string };

  before(async () => {
    h = await setup();
    tunde = h.token('art_tunde', 'artisan');
    window = win();
  });
  after(() => h.close());

  it('signs up a new customer with phone OTP', async () => {
    const bad = await h.call('POST', '/v1/auth/otp', undefined, { phone: '12345' });
    assert.equal(bad.status, 400);
    const otp = await h.call('POST', '/v1/auth/otp', undefined, { phone: '0803 555 1234' });
    assert.equal(otp.status, 200);
    const wrong = await h.call('POST', '/v1/auth/verify', undefined, { phone: '08035551234', code: otp.body.devCode === '000000' ? '111111' : '000000' });
    assert.equal(wrong.status, 401);
    const ver = await h.call('POST', '/v1/auth/verify', undefined, { phone: '08035551234', code: otp.body.devCode });
    assert.ok(ver.body.registrationToken);
    const reg = await h.call('POST', '/v1/auth/register', undefined, { registrationToken: ver.body.registrationToken, name: 'Ngozi Ade', role: 'customer', city: 'Lagos', area: 'Yaba' });
    assert.equal(reg.status, 200);
    cust = reg.body.token;
    const addr = await h.call('POST', '/v1/me/addresses', cust, { label: 'Home', line1: '5 Montgomery Road', area: 'Yaba', city: 'Lagos', state: 'Lagos' });
    assert.equal(addr.status, 200);
  });

  it('searches available artisans ranked best first', async () => {
    const r = await h.call('GET', '/v1/artisans/search?category=mechanic&city=Lagos', cust);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.map((x: any) => x.artisan.id), ['art_tunde', 'art_sola']);
    assert.equal(r.body[0].artisan.phone, undefined, 'phone never exposed');
  });

  it('creates a job; the artisan cannot see the exact address yet', async () => {
    const photo = await upload(h, cust, 'issue_photo');
    const r = await h.call('POST', '/v1/jobs', cust, { artisanId: 'art_tunde', categoryId: 'mechanic', title: 'Brakes squeal', description: 'Front brakes squeal when stopping.', window, issueMediaIds: [photo] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    jobId = r.body.id;
    const asArtisan = await h.call('GET', `/v1/jobs/${jobId}`, tunde);
    assert.equal(asArtisan.body.address.line1, '');
    assert.equal(asArtisan.body.address.area, 'Yaba');
    const reuse = await h.call('POST', '/v1/jobs', cust, { artisanId: 'art_tunde', categoryId: 'mechanic', description: 'Another job using the same photo', window: weekdayAt(h.clock.t, 15), issueMediaIds: [photo] });
    assert.equal(reuse.status, 422, 'a photo can only be used once');
  });

  it('blocks contact sharing in chat and logs it', async () => {
    const blocked = await h.call('POST', `/v1/jobs/${jobId}/messages`, tunde, { text: 'call me on zero eight zero three one two three four five six seven' });
    assert.equal(blocked.status, 422);
    assert.equal(blocked.body.error.code, 'message_blocked');
    const ok = await h.call('POST', `/v1/jobs/${jobId}/messages`, tunde, { text: 'I can come with new pads. ₦20,000 total.' });
    assert.equal(ok.status, 201);
    const me = await h.call('GET', '/v1/me', tunde);
    assert.equal(me.body.stats.ruleViolations, 1);
    const outsider = await h.call('GET', `/v1/jobs/${jobId}/messages`, h.token('art_chioma', 'artisan'));
    assert.equal(outsider.status, 403);
  });

  it('negotiates in the Price Pool and locks the price', async () => {
    assert.equal((await h.call('POST', `/v1/jobs/${jobId}/escrow`, cust)).status, 422, 'cannot fund before price lock');
    assert.equal((await h.call('POST', `/v1/jobs/${jobId}/price-offers`, tunde, { amount: 22000 })).status, 200);
    assert.equal((await h.call('POST', `/v1/jobs/${jobId}/price-offers/accept`, tunde)).status, 422, 'cannot accept own offer');
    assert.equal((await h.call('POST', `/v1/jobs/${jobId}/price-offers`, cust, { amount: 20000 })).status, 200);
    const acc = await h.call('POST', `/v1/jobs/${jobId}/price-offers/accept`, tunde);
    assert.equal(acc.body.status, 'price_agreed');
    assert.equal(acc.body.pricePool.locked.amount, 20000);
    assert.equal((await h.call('POST', `/v1/jobs/${jobId}/price-offers`, cust, { amount: 1000 })).status, 422, 'locked price is permanent');
  });

  it('funds escrow only through a correctly signed, verified webhook', async () => {
    const init = await h.call('POST', `/v1/jobs/${jobId}/escrow`, cust);
    assert.equal(init.status, 200);
    assert.equal(init.body.amount, 20000);
    const wh = h.gw.completeCharge(init.body.reference);
    const forged = await h.call('POST', '/v1/webhooks/paystack', undefined, wh.body, { 'x-paystack-signature': signWebhook(wh.body, 'wrong-secret') });
    assert.equal(forged.status, 401);
    const good = await h.call('POST', '/v1/webhooks/paystack', undefined, wh.body, { 'x-paystack-signature': wh.signature });
    assert.equal(good.body.outcome, 'funded');
    const again = await h.call('POST', '/v1/webhooks/paystack', undefined, wh.body, { 'x-paystack-signature': wh.signature });
    assert.equal(again.body.outcome, 'already_success', 'webhooks are idempotent');
    const asArtisan = await h.call('GET', `/v1/jobs/${jobId}`, tunde);
    assert.equal(asArtisan.body.status, 'funded');
    assert.equal(asArtisan.body.address.line1, '5 Montgomery Road', 'address unlocked after escrow');
  });

  it('starts only near the agreed time, then takes proof of work and approval', async () => {
    assert.equal((await h.call('POST', `/v1/jobs/${jobId}/start`, tunde)).status, 422);
    h.clock.t = new Date(window.start).getTime() - 30 * 60_000;
    assert.equal((await h.call('POST', `/v1/jobs/${jobId}/start`, tunde)).body.status, 'in_progress');
    const wrongPurpose = await upload(h, tunde, 'site_before', jobId);
    assert.equal((await h.call('POST', `/v1/jobs/${jobId}/proof`, tunde, { mediaIds: [wrongPurpose] })).status, 422);
    const proof = await upload(h, tunde, 'proof_of_work', jobId);
    const sub = await h.call('POST', `/v1/jobs/${jobId}/proof`, tunde, { mediaIds: [proof], note: 'Replaced front pads, cleaned discs.' });
    assert.equal(sub.body.status, 'proof_submitted');
    assert.equal((await h.call('POST', `/v1/jobs/${jobId}/approve`, tunde)).status, 403);
    const ap = await h.call('POST', `/v1/jobs/${jobId}/approve`, cust);
    assert.equal(ap.body.status, 'completed');
    assert.equal(ap.body.escrow.releasedToArtisan + ap.body.escrow.commission, 20000);
    assert.equal((await h.call('POST', `/v1/jobs/${jobId}/approve`, cust)).status, 422, 'no double release');
    const earn = await h.call('GET', '/v1/earnings', tunde);
    assert.equal(earn.body.balance, ap.body.escrow.releasedToArtisan);
  });

  it('takes one review per completed job', async () => {
    assert.equal((await h.call('POST', `/v1/jobs/${jobId}/reviews`, cust, { rating: 5, comment: 'Neat and on time' })).status, 200);
    assert.equal((await h.call('POST', `/v1/jobs/${jobId}/reviews`, cust, { rating: 4, comment: 'again' })).status, 409);
  });

  it('pays out to a verified account and restores the balance if the transfer fails', async () => {
    const before = (await h.call('GET', '/v1/earnings', tunde)).body.balance;
    assert.equal((await h.call('PUT', '/v1/payout-account', tunde, { accountNumber: '0123456789', bankCode: '058', bankName: 'GTBank' })).status, 200);
    assert.equal((await h.call('POST', '/v1/payouts', tunde, { amount: before + 1 })).status, 422);
    const po = await h.call('POST', '/v1/payouts', tunde, { amount: 10000 });
    assert.equal(po.body.status, 'processing');
    assert.equal((await h.call('GET', '/v1/earnings', tunde)).body.balance, before - 10000);
    const ref = h.gw.transfers.at(-1)!.reference;
    const body = JSON.stringify({ event: 'transfer.failed', data: { reference: ref, amount: 1000000 } });
    await h.call('POST', '/v1/webhooks/paystack', undefined, body, { 'x-paystack-signature': signWebhook(body, h.gw.secret) });
    assert.equal((await h.call('GET', '/v1/earnings', tunde)).body.balance, before);
  });
});
