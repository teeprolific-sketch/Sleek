import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { setup, weekdayAt, type Harness } from './helpers';

describe('server blocks numbers and emails everywhere', () => {
  let h: Harness;
  let cust: string;
  let jobId: string;
  const tunde = () => h.token('art_tunde', 'artisan');

  before(async () => {
    h = await setup();
    const otp = await h.call('POST', '/v1/auth/otp', undefined, { phone: '08075550000' });
    const ver = await h.call('POST', '/v1/auth/verify', undefined, { phone: '08075550000', code: otp.body.devCode });
    const reg = await h.call('POST', '/v1/auth/register', undefined, { registrationToken: ver.body.registrationToken, name: 'Ada Eze', role: 'customer', city: 'Lagos', area: 'Yaba' });
    cust = reg.body.token;
    await h.call('POST', '/v1/me/addresses', cust, { label: 'Home', line1: '9 Herbert Macaulay Way', area: 'Yaba', city: 'Lagos', state: 'Lagos' });
    const j = await h.call('POST', '/v1/jobs', cust, { artisanId: 'art_tunde', categoryId: 'mechanic', description: 'Car will not start in the morning.', window: weekdayAt(h.clock.t, 11) });
    jobId = j.body.id;
  });
  after(() => h.close());

  it('blocks a phone number split across several messages', async () => {
    assert.equal((await h.call('POST', `/v1/jobs/${jobId}/messages`, tunde(), { text: '803' })).status, 201);
    assert.equal((await h.call('POST', `/v1/jobs/${jobId}/messages`, tunde(), { text: '123' })).status, 201);
    const third = await h.call('POST', `/v1/jobs/${jobId}/messages`, tunde(), { text: '4567' });
    assert.equal(third.status, 422);
    assert.equal(third.body.error.code, 'message_blocked');
  });

  it('blocks disguised numbers and emails', async () => {
    for (const text of ['０８０３１２３４５６７', 'zero8zero3one2three4five6seven', '0803', 'a.m.a.k.a@g.m.a.i.l.com', 'amaka gmail', 'email me']) {
      const r = await h.call('POST', `/v1/jobs/${jobId}/messages`, cust, { text });
      assert.equal(r.status, 422, text);
    }
    assert.equal((await h.call('POST', `/v1/jobs/${jobId}/messages`, cust, { text: 'Please come by 10am, the fee is ₦15,000' })).status, 201);
  });

  it('keeps contact details out of addresses, dispute details and worker names', async () => {
    const addr = await h.call('POST', '/v1/me/addresses', cust, { label: 'Office', line1: '3 Ikorodu Road', area: 'Yaba', city: 'Lagos', state: 'Lagos', landmark: 'call 0803 123 4567 at the gate' });
    assert.equal(addr.status, 422);
    const team = h.token('art_brightclean', 'artisan');
    assert.equal((await h.call('POST', '/v1/team/workers', team, { name: 'Joy amaka@gmail.com' })).status, 422);
  });
});
