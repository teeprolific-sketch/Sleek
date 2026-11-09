import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import { CATEGORIES } from '../../src/data/categories';
import { SERVICE_ITEMS } from '../../src/data/seed';
import { authenticate, register, requestOtp, verifyOtp, type Session } from './auth';
import type { Deps } from './context';
import { ApiError, forbidden, unauthorized } from './errors';
import { MockGateway } from './providers/payments';
import * as admin from './services/admin';
import * as agent from './services/agent';
import * as artisans from './services/artisans';
import * as jobs from './services/jobs';
import * as misc from './services/misc';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');
const windowSchema = z.object({ start: isoDate, end: isoDate });
const id = z.string().min(3).max(80);

export function buildApp(deps: Deps): FastifyInstance {
  const app = Fastify({ logger: deps.cfg.env === 'development' ? { level: 'info' } : false, bodyLimit: 256 * 1024, trustProxy: true });

  // Keep the raw body: the PSP webhook signature is computed over the exact bytes.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    req.rawBody = body as string;
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(new ApiError(400, 'invalid_json', 'Body is not valid JSON.'), undefined);
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    if (err instanceof ZodError) return reply.status(400).send({ error: { code: 'validation', message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') } });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: { code: 'bad_request', message: (err as Error).message } });
    req.log.error(err);
    return reply.status(500).send({ error: { code: 'internal', message: 'Something went wrong. Please try again.' } });
  });

  // Small per-IP limiter for unauthenticated auth endpoints (OTP has its own per-phone limit too).
  const hits = new Map<string, { n: number; t: number }>();
  const limit = (req: FastifyRequest, max: number) => {
    const key = `${req.ip}:${req.routeOptions.url}`;
    const now = deps.now();
    const h = hits.get(key);
    if (!h || now - h.t > 60_000) hits.set(key, { n: 1, t: now });
    else if (++h.n > max) throw new ApiError(429, 'rate_limited', 'Too many requests. Slow down.');
  };

  const auth = (roles?: Session['role'][], opts: { agent?: boolean } = {}) => async (req: FastifyRequest) => {
    const s = await authenticate(deps, req);
    if (s.scope === 'agent' && !opts.agent) throw forbidden('Ugent cannot call this endpoint.');
    if (roles && !roles.includes(s.role)) throw forbidden();
    (req as FastifyRequest & { session: Session }).session = s;
  };
  const sess = (req: FastifyRequest) => (req as FastifyRequest & { session: Session }).session;
  const P = <T extends z.ZodTypeAny>(schema: T, v: unknown): z.infer<T> => schema.parse(v);
  const params = (req: FastifyRequest) => P(z.object({ id }), req.params);

  // ---- health & catalogue ---------------------------------------------------
  app.get('/health', async () => {
    await deps.db.query('SELECT 1');
    return { ok: true, payments: deps.payments.name, identity: deps.identity.name };
  });
  app.get('/v1/categories', async () => CATEGORIES);
  app.get('/v1/services/catalogue', async () => SERVICE_ITEMS);

  // ---- auth -----------------------------------------------------------------
  app.post('/v1/auth/otp', async (req) => {
    limit(req, 10);
    return requestOtp(deps, P(z.object({ phone: z.string() }), req.body).phone);
  });
  app.post('/v1/auth/verify', async (req) => {
    limit(req, 20);
    const b = P(z.object({ phone: z.string(), code: z.string().regex(/^\d{6}$/) }), req.body);
    return verifyOtp(deps, b.phone, b.code);
  });
  app.post('/v1/auth/register', async (req) => {
    limit(req, 10);
    const b = P(
      z.object({
        registrationToken: z.string(),
        name: z.string().min(3).max(80),
        role: z.enum(['customer', 'artisan']),
        accountType: z.enum(['individual', 'team', 'agency']).optional(),
        businessName: z.string().max(80).optional(),
        city: z.string().min(2).max(40),
        area: z.string().min(2).max(60),
      }),
      req.body,
    );
    return register(deps, b);
  });

  // ---- me -------------------------------------------------------------------
  app.get('/v1/me', { preHandler: auth() }, async (req) => misc.me(deps, sess(req)));
  app.post('/v1/me/addresses', { preHandler: auth(['customer']) }, async (req) => {
    const b = P(z.object({ label: z.string().min(1).max(30), line1: z.string().min(3).max(120), area: z.string().min(2), city: z.string().min(2), state: z.string().min(2), landmark: z.string().max(120).optional() }), req.body);
    return misc.addAddress(deps, sess(req), b);
  });
  app.get('/v1/notifications', { preHandler: auth() }, async (req) => misc.listNotifications(deps, sess(req)));
  app.post('/v1/notifications/read', { preHandler: auth() }, async (req) => {
    await misc.markRead(deps, sess(req), P(z.object({ id: id.optional() }), req.body ?? {}).id);
    return { ok: true };
  });

  // ---- media (controlled uploads only) ---------------------------------------
  app.post('/v1/media', { preHandler: auth() }, async (req) => {
    const b = P(z.object({ purpose: z.enum(misc.MEDIA_PURPOSES), contentType: z.string(), jobId: id.optional() }), req.body);
    return misc.createUpload(deps, sess(req), b.purpose, b.contentType, b.jobId);
  });

  // ---- artisans (search is available to customers and Ugent) -------------------
  app.get('/v1/artisans/search', { preHandler: auth(undefined, { agent: true }) }, async (req) => {
    const q = P(z.object({ category: z.string().optional(), city: z.string().optional(), text: z.string().max(60).optional(), start: isoDate.optional(), end: isoDate.optional(), limit: z.coerce.number().int().min(1).max(50).optional() }), req.query);
    return artisans.search(deps, { categoryId: q.category, city: q.city, text: q.text, window: q.start && q.end ? { start: q.start, end: q.end } : undefined, limit: q.limit });
  });
  app.get('/v1/artisans/:id', { preHandler: auth(undefined, { agent: true }) }, async (req) => artisans.profile(deps, params(req).id));
  app.get('/v1/artisans/:id/availability', { preHandler: auth(undefined, { agent: true }) }, async (req) => {
    const q = P(z.object({ category: z.string(), start: isoDate, end: isoDate }), req.query);
    return artisans.availability(deps, params(req).id, q.category, { start: q.start, end: q.end });
  });

  // ---- artisan account ------------------------------------------------------------
  const A = { preHandler: auth(['artisan']) };
  app.post('/v1/artisan/online', A, async (req) => artisans.setOnline(deps, sess(req), P(z.object({ online: z.boolean() }), req.body).online).then((a) => ({ online: a.online })));
  app.put('/v1/artisan/hours/:day', A, async (req) => {
    const day = P(z.object({ day: z.coerce.number().int() }), req.params).day;
    const b = P(z.object({ hours: z.object({ start: z.number(), end: z.number() }).nullable() }), req.body);
    return artisans.setWorkingHours(deps, sess(req), day, b.hours).then((a) => a.workingHours);
  });
  app.patch('/v1/artisan/profile', A, async (req) => {
    const b = P(z.object({ bio: z.string().max(600).optional(), area: z.string().max(60).optional(), yearsExperience: z.number().int().min(0).max(70).optional(), businessName: z.string().max(80).optional(), startingPrices: z.record(z.number().int().min(0)).optional(), calendarMode: z.enum(['shared', 'individual']).optional() }), req.body);
    await artisans.updateProfile(deps, sess(req), b);
    return { ok: true };
  });
  app.post('/v1/verification/nin', A, async (req) => {
    const b = P(z.object({ nin: z.string(), name: z.string().min(3), workerId: id.optional() }), req.body);
    return artisans.verifyNin(deps, sess(req), b.nin, b.name, b.workerId);
  });
  app.post('/v1/verification/liveness/session', A, async (req) => artisans.startLiveness(deps, sess(req), P(z.object({ workerId: id.optional() }), req.body ?? {}).workerId));
  app.post('/v1/verification/liveness', A, async (req) => {
    const b = P(z.object({ sessionId: id, mediaIds: z.array(id).min(1).max(10) }), req.body);
    return artisans.completeLiveness(deps, sess(req), b.sessionId, b.mediaIds);
  });
  app.post('/v1/verification/skills', A, async (req) => {
    const b = P(z.object({ categoryId: z.string(), mediaId: id, durationSec: z.number().int().min(1).max(600), workerId: id.optional() }), req.body);
    return artisans.submitSkillVideo(deps, sess(req), b);
  });
  app.post('/v1/team/workers', A, async (req) => artisans.addWorker(deps, sess(req), P(z.object({ name: z.string() }), req.body).name));
  app.patch('/v1/team/workers/:id', A, async (req) => {
    await artisans.setWorkerActive(deps, sess(req), params(req).id, P(z.object({ active: z.boolean() }), req.body).active);
    return { ok: true };
  });
  app.get('/v1/earnings', A, async (req) => artisans.earnings(deps, sess(req)));
  app.put('/v1/payout-account', A, async (req) => {
    const b = P(z.object({ accountNumber: z.string(), bankCode: z.string().min(3).max(10), bankName: z.string().min(2).max(60) }), req.body);
    return artisans.setPayoutAccount(deps, sess(req), b.accountNumber, b.bankCode, b.bankName);
  });
  app.post('/v1/payouts', A, async (req) => artisans.requestPayout(deps, sess(req), P(z.object({ amount: z.number().int() }), req.body).amount));

  // ---- jobs -----------------------------------------------------------------------
  const U = { preHandler: auth() };
  app.get('/v1/jobs', U, async (req) => jobs.listJobs(deps, sess(req)));
  app.post('/v1/jobs', { preHandler: auth(['customer']) }, async (req, reply) => {
    const b = P(z.object({ artisanId: id, categoryId: z.string(), title: z.string().max(80).default(''), description: z.string().min(10).max(1000), window: windowSchema, addressIndex: z.number().int().min(0).default(0), issueMediaIds: z.array(id).max(6).default([]), workerId: id.optional() }), req.body);
    reply.status(201);
    return jobs.createJob(deps, sess(req), b);
  });
  app.get('/v1/jobs/:id', U, async (req) => jobs.getJobFor(deps, sess(req), params(req).id));
  app.get('/v1/jobs/:id/messages', U, async (req) => jobs.listMessages(deps, sess(req), params(req).id));
  app.post('/v1/jobs/:id/messages', U, async (req, reply) => {
    reply.status(201);
    return jobs.sendMessage(deps, sess(req), params(req).id, P(z.object({ text: z.string() }), req.body).text);
  });
  app.post('/v1/jobs/:id/photos', U, async (req) => jobs.addJobPhoto(deps, sess(req), params(req).id, P(z.object({ mediaId: id }), req.body).mediaId));
  app.post('/v1/jobs/:id/price-offers', U, async (req) => {
    const b = P(z.object({ amount: z.number().int(), note: z.string().max(200).optional() }), req.body);
    return jobs.proposePrice(deps, sess(req), params(req).id, b.amount, b.note);
  });
  app.post('/v1/jobs/:id/price-offers/accept', U, async (req) => jobs.acceptPrice(deps, sess(req), params(req).id));
  app.post('/v1/jobs/:id/price-offers/withdraw', U, async (req) => jobs.withdrawOffer(deps, sess(req), params(req).id));
  app.post('/v1/jobs/:id/decline', { preHandler: auth(['artisan']) }, async (req) => jobs.declineJob(deps, sess(req), params(req).id, P(z.object({ reason: z.string().max(200).default('Not available') }), req.body ?? {}).reason));
  app.post('/v1/jobs/:id/escrow', { preHandler: auth(['customer']) }, async (req) => jobs.initEscrowPayment(deps, sess(req), params(req).id));
  app.post('/v1/jobs/:id/assign', { preHandler: auth(['artisan']) }, async (req) => jobs.assignWorker(deps, sess(req), params(req).id, P(z.object({ workerId: id }), req.body).workerId));
  app.post('/v1/jobs/:id/start', { preHandler: auth(['artisan']) }, async (req) => jobs.startJob(deps, sess(req), params(req).id));
  app.post('/v1/jobs/:id/proof', { preHandler: auth(['artisan']) }, async (req) => {
    const b = P(z.object({ mediaIds: z.array(id).min(1).max(10), note: z.string().max(1000).default('') }), req.body);
    return jobs.submitProof(deps, sess(req), params(req).id, b.mediaIds, b.note);
  });
  app.post('/v1/jobs/:id/approve', { preHandler: auth(['customer']) }, async (req) => jobs.approveJob(deps, sess(req), params(req).id));
  app.get('/v1/jobs/:id/cancellation-quote', U, async (req) => jobs.quoteCancellation(deps, sess(req), params(req).id));
  app.post('/v1/jobs/:id/cancel', U, async (req) => jobs.cancelJob(deps, sess(req), params(req).id, P(z.object({ reason: z.string().max(300) }), req.body).reason));
  app.post('/v1/jobs/:id/reviews', { preHandler: auth(['customer']) }, async (req) => {
    const b = P(z.object({ rating: z.number().int(), comment: z.string().max(1000).default('') }), req.body);
    return jobs.submitReview(deps, sess(req), params(req).id, b.rating, b.comment);
  });
  app.get('/v1/jobs/:id/dispute', U, async (req) => jobs.getDisputeForJob(deps, sess(req), params(req).id));
  app.post('/v1/jobs/:id/disputes', U, async (req, reply) => {
    const b = P(z.object({ reason: z.enum(['not_completed', 'poor_quality', 'no_show', 'damage', 'overcharge_request', 'other']), details: z.string().max(2000), evidenceMediaIds: z.array(id).max(10).default([]) }), req.body);
    reply.status(201);
    return jobs.openDispute(deps, sess(req), params(req).id, b.reason, b.details, b.evidenceMediaIds);
  });
  app.post('/v1/disputes/:id/response', U, async (req) => jobs.respondDispute(deps, sess(req), params(req).id, P(z.object({ text: z.string().max(2000) }), req.body).text));

  // ---- Sleek Services ---------------------------------------------------------------
  const cartLine = z.object({ itemId: z.string(), qty: z.number().int(), rentalDays: z.number().int().optional(), rentalStart: isoDate.optional() });
  app.post('/v1/orders/quote', U, async (req) => misc.priceCart(P(z.object({ lines: z.array(cartLine).min(1).max(30) }), req.body).lines));
  app.post('/v1/orders', U, async (req, reply) => {
    const b = P(z.object({ lines: z.array(cartLine).min(1).max(30), deliverTo: z.enum(['customer', 'artisan']), jobId: id.optional(), address: z.string().max(200).optional() }), req.body);
    reply.status(201);
    return misc.placeOrder(deps, sess(req), b);
  });
  app.get('/v1/orders', U, async (req) => misc.listOrders(deps, sess(req)));

  // ---- payments webhook (Paystack-signed) ------------------------------------------------
  app.post('/v1/webhooks/paystack', async (req: FastifyRequest, reply: FastifyReply) => {
    const sig = req.headers['x-paystack-signature'] as string | undefined;
    if (!req.rawBody || !deps.payments.verifyWebhook(req.rawBody, sig)) throw unauthorized('Invalid signature');
    const evt = deps.payments.parseWebhook(req.body);
    let outcome = 'ignored';
    if (evt.type === 'charge.success') {
      // Belt and braces: confirm with the PSP before trusting the webhook amount.
      const v = await deps.payments.verifyCharge(evt.reference);
      if (v.status === 'success') outcome = (await jobs.handleChargeSuccess(deps, evt.reference, v.amount)).outcome;
      else outcome = 'not_verified';
    } else if (evt.type === 'charge.failed') {
      await jobs.handleChargeFailed(deps, evt.reference);
      outcome = 'failed';
    } else if (evt.type === 'transfer.success' || evt.type === 'transfer.failed' || evt.type === 'transfer.reversed') {
      await artisans.settlePayout(deps, evt.reference, evt.type === 'transfer.success');
      outcome = evt.type;
    } else if (evt.type === 'refund.processed') {
      await deps.db.query("UPDATE payments SET status = 'refunded', updated_at = now() WHERE kind = 'refund' AND data->>'chargeRef' = $1 AND status = 'processing'", [evt.reference]);
      outcome = 'refund_processed';
    }
    reply.status(200);
    return { received: true, outcome };
  });

  // ---- Ugent ----------------------------------------------------------------------------
  app.get('/v1/agent/tools', async () => agent.tools());
  app.post('/v1/agent/link', { preHandler: auth(['customer']) }, async (req) => agent.link(deps, sess(req)));
  app.post('/v1/agent/unlink', { preHandler: auth(['customer']) }, async (req) => {
    await agent.unlink(deps, sess(req));
    return { ok: true };
  });
  app.post('/v1/agent/actions/:name', { preHandler: auth(['customer'], { agent: true }) }, async (req) => {
    const { name } = P(z.object({ name: z.string() }), req.params);
    return agent.execute(deps, sess(req), name as never, (req.body as Record<string, unknown>) ?? {});
  });
  app.get('/v1/agent/requests', { preHandler: auth(['customer']) }, async (req) => agent.listRequests(deps, sess(req)));
  app.post('/v1/agent/requests/:id/:decision', { preHandler: auth(['customer']) }, async (req) => {
    const p = P(z.object({ id, decision: z.enum(['confirm', 'reject']) }), req.params);
    return agent.decide(deps, sess(req), p.id, p.decision);
  });

  // ---- admin ----------------------------------------------------------------------------
  const ADM = { preHandler: auth(['admin']) };
  app.get('/v1/admin/metrics', ADM, async (req) => admin.metrics(deps, sess(req)));
  app.get('/v1/admin/verifications', ADM, async (req) => admin.verificationQueue(deps, sess(req)));
  app.post('/v1/admin/verifications/decision', ADM, async (req) => {
    const b = P(z.object({ artisanId: id, workerId: id.optional(), categoryId: z.string(), decision: z.enum(['approved', 'rejected', 'needs_more']), quality: z.number().min(1).max(5).optional(), note: z.string().max(500).default(''), certificateChecked: z.boolean().optional() }), req.body);
    return admin.reviewSkill(deps, sess(req), b);
  });
  app.get('/v1/admin/disputes', ADM, async (req) => admin.disputes(deps, sess(req)));
  app.post('/v1/admin/disputes/:id/review', ADM, async (req) => {
    await admin.startDisputeReview(deps, sess(req), params(req).id);
    return { ok: true };
  });
  app.post('/v1/admin/disputes/:id/resolve', ADM, async (req) => {
    const b = P(z.object({ outcome: z.enum(['release_to_artisan', 'refund_customer', 'split']), artisanShare: z.number().min(0).max(1).default(0.5), note: z.string().max(1000) }), req.body);
    return jobs.resolveDispute(deps, sess(req), params(req).id, b.outcome, b.artisanShare, b.note);
  });
  app.get('/v1/admin/violations', ADM, async (req) => admin.violations(deps, sess(req), P(z.object({ open: z.coerce.boolean().default(true) }), req.query).open));
  app.post('/v1/admin/violations/:id/reviewed', ADM, async (req) => {
    await admin.markViolationReviewed(deps, sess(req), params(req).id);
    return { ok: true };
  });
  app.post('/v1/admin/users/:id/suspend', ADM, async (req) => {
    const b = P(z.object({ suspended: z.boolean(), reason: z.string().min(3).max(300) }), req.body);
    await admin.setSuspended(deps, sess(req), params(req).id, b.suspended, b.reason);
    return { ok: true };
  });
  app.patch('/v1/admin/orders/:id', ADM, async (req) => misc.updateOrderStatus(deps, sess(req), params(req).id, P(z.object({ status: z.enum(['confirmed', 'dispatched', 'delivered', 'returned', 'cancelled']) }), req.body).status));

  // ---- development helpers (never registered in production) ----------------------------------
  if (deps.cfg.env !== 'production' && deps.payments instanceof MockGateway) {
    const gw = deps.payments;
    app.post('/v1/dev/payments/:ref/complete', async (req) => {
      const { ref } = P(z.object({ ref: z.string() }), req.params);
      const { fail } = P(z.object({ fail: z.boolean().default(false) }), req.body ?? {});
      const wh = gw.completeCharge(ref, { fail });
      const res = await app.inject({ method: 'POST', url: '/v1/webhooks/paystack', headers: { 'content-type': 'application/json', 'x-paystack-signature': wh.signature }, payload: wh.body });
      return res.json();
    });
  }

  return app;
}
