process.env.TZ = 'Africa/Lagos';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import type { Deps } from '../src/context';
import { createDeps } from '../src/deps';
import { sign } from '../src/jwt';
import { MockGateway } from '../src/providers/payments';
import { seed } from '../src/seed';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://sleek@localhost:5433/sleek_test?host=/tmp';

export interface Harness {
  app: FastifyInstance;
  deps: Deps;
  gw: MockGateway;
  clock: { t: number };
  token: (userId: string, role: 'customer' | 'artisan' | 'admin') => string;
  call: (method: string, url: string, tok?: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: any }>;
  close: () => Promise<void>;
}

export async function setup(): Promise<Harness> {
  const clock = { t: Date.now() };
  const deps = createDeps({ env: 'test', databaseUrl: TEST_DB, paymentProvider: 'mock', jwtSecret: 'test-secret-0123456789-0123456789' }, { now: () => clock.t });
  await deps.db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await deps.db.migrate();
  await seed(deps);
  const app = buildApp(deps);
  await app.ready();
  const token = (userId: string, role: 'customer' | 'artisan' | 'admin') => sign({ sub: userId, role, scope: 'user' }, deps.cfg.jwtSecret, 90 * 86_400, clock.t);
  const call: Harness['call'] = async (method, url, tok, body, headers = {}) => {
    const res = await app.inject({
      method: method as 'GET',
      url,
      headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      payload: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
    let parsed: unknown = res.body;
    try {
      parsed = res.json();
    } catch {
      /* not json */
    }
    return { status: res.statusCode, body: parsed };
  };
  return { app, deps, gw: deps.payments as MockGateway, clock, token, call, close: async () => { await app.close(); await deps.db.close(); } };
}

/** Next weekday (Mon–Fri) at hh:00 Lagos time, at least `minDaysAhead` days away. */
export function weekdayAt(base: number, hh: number, minDaysAhead = 2, hours = 2) {
  const d = new Date(base + minDaysAhead * 86_400_000);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(hh, 0, 0, 0);
  return { start: d.toISOString(), end: new Date(d.getTime() + hours * 3_600_000).toISOString() };
}

/** Customer funds escrow end-to-end through the signed webhook. */
export async function fund(h: Harness, jobId: string, customerTok: string) {
  const init = await h.call('POST', `/v1/jobs/${jobId}/escrow`, customerTok);
  if (init.status !== 200) throw new Error(`escrow init failed: ${JSON.stringify(init.body)}`);
  const wh = h.gw.completeCharge(init.body.reference);
  const res = await h.call('POST', '/v1/webhooks/paystack', undefined, wh.body, { 'x-paystack-signature': wh.signature });
  return { reference: init.body.reference as string, webhook: res };
}

export async function upload(h: Harness, tok: string, purpose: string, jobId?: string, contentType = 'image/jpeg') {
  const r = await h.call('POST', '/v1/media', tok, { purpose, contentType, jobId });
  if (r.status !== 200) throw new Error(`upload failed: ${JSON.stringify(r.body)}`);
  return r.body.mediaId as string;
}
