/** Media uploads, notifications, Sleek Services orders and the "me" endpoint. */
import { serviceItem } from '../../../src/data/seed';
import * as Esc from '../../../src/domain/escrow';
import type { Artisan, CartLine, Customer, DeliveryTarget, Order } from '../../../src/domain/types';
import type { Session } from '../auth';
import type { Deps } from '../context';
import { moderateMessage } from '../../../src/domain/moderation';
import { badRequest, forbidden, notFound, ruleViolation } from '../errors';
import { newId } from '../ids';
import { getJob, getUser, notify, saveUser } from '../repo';

const iso = (deps: Deps) => new Date(deps.now()).toISOString();

// ---- media ------------------------------------------------------------------
/** Purposes that can be captured. There is no generic/free upload. */
export const MEDIA_PURPOSES = ['issue_photo', 'site_before', 'proof_of_work', 'dispute_evidence', 'delivery_confirmation', 'liveness_frame', 'skill_video', 'certificate'] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];
const VIDEO_PURPOSES: MediaPurpose[] = ['skill_video'];

export async function createUpload(deps: Deps, s: Session, purpose: MediaPurpose, contentType: string, jobId?: string) {
  if (!MEDIA_PURPOSES.includes(purpose)) throw badRequest('That upload type is not allowed.', 'upload_not_allowed');
  const isVideo = contentType.startsWith('video/');
  if (isVideo !== VIDEO_PURPOSES.includes(purpose) || !/^(image\/(jpeg|png|heic|webp)|video\/(mp4|quicktime))$/.test(contentType)) throw badRequest('Unsupported file type for this upload.', 'upload_not_allowed');
  if (jobId) {
    const job = await getJob(deps, jobId);
    if (job.customerId !== s.userId && job.artisanId !== s.userId) throw forbidden();
  }
  if ((purpose === 'liveness_frame' || purpose === 'skill_video') && s.role !== 'artisan') throw forbidden();
  const id = newId('med');
  const signed = await deps.storage.signUpload({ key: `${s.userId}/${purpose}/${id}`, contentType });
  const data = { id, uri: signed.objectUri, purpose, capturedAt: iso(deps), loggedBy: s.userId, jobId, contentType };
  await deps.db.query('INSERT INTO media (id, user_id, job_id, purpose, data) VALUES ($1, $2, $3, $4, $5)', [id, s.userId, jobId ?? null, purpose, JSON.stringify(data)]);
  return { mediaId: id, uploadUrl: signed.uploadUrl, expiresInSec: signed.expiresInSec };
}

// ---- me -------------------------------------------------------------------------
const PRIVATE_IDENTITY_KEYS = ['ninHash', 'recordPhotoRef', 'selfieRef'];
function scrub<T>(u: T): T {
  const x = JSON.parse(JSON.stringify(u));
  const clean = (i?: Record<string, unknown>) => i && PRIVATE_IDENTITY_KEYS.forEach((k) => delete i[k]);
  clean(x.identity);
  (x.workers ?? []).forEach((w: { identity?: Record<string, unknown> }) => clean(w.identity));
  delete x.payoutRecipient;
  return x;
}

export async function me(deps: Deps, s: Session) {
  return scrub(await getUser(deps, s.userId));
}

export async function addAddress(deps: Deps, s: Session, addr: Customer['addresses'][number]) {
  if (s.role !== 'customer') throw forbidden();
  // The address is shown to the artisan after escrow — it must not carry contact details.
  const m = moderateMessage([addr.label, addr.line1, addr.landmark ?? ''].join(' '));
  if (!m.allowed) throw ruleViolation('Addresses can’t include phone numbers, emails or links. Sleek shares the address with your artisan for you.', 'message_blocked');
  return deps.db.tx(async (c) => {
    const u = await getUser<Customer>(deps, s.userId, c, true);
    u.addresses = [...u.addresses.filter((a) => a.label !== addr.label), addr];
    await saveUser(deps, u, c);
    return u.addresses;
  });
}

// ---- notifications -------------------------------------------------------------
export async function listNotifications(deps: Deps, s: Session) {
  return (await deps.db.query<{ data: object; read: boolean }>('SELECT data, read FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [s.userId])).map((r) => ({ ...r.data, read: r.read }));
}
export async function markRead(deps: Deps, s: Session, id?: string) {
  if (id) await deps.db.query('UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2', [id, s.userId]);
  else await deps.db.query('UPDATE notifications SET read = TRUE WHERE user_id = $1', [s.userId]);
}

// ---- Sleek Services orders --------------------------------------------------------
export const DELIVERY_FEE = 2500;

/** Totals are always computed on the server from the catalogue — never trusted from the client. */
export function priceCart(lines: CartLine[]) {
  if (!lines.length) throw badRequest('Your cart is empty.');
  let subtotal = 0;
  let deposit = 0;
  for (const l of lines) {
    const it = serviceItem(l.itemId);
    if (!it) throw badRequest(`Unknown item ${l.itemId}.`);
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > it.stock) throw badRequest(`Invalid quantity for ${it.name}.`);
    if (it.kind === 'rental') {
      const days = l.rentalDays ?? 1;
      if (!Number.isInteger(days) || days < 1 || days > 30) throw badRequest('Rentals are 1–30 days.');
      subtotal += it.price * l.qty * days;
      deposit += (it.deposit ?? 0) * l.qty;
    } else subtotal += it.price * l.qty;
  }
  return { subtotal, deposit, deliveryFee: DELIVERY_FEE, total: subtotal + deposit + DELIVERY_FEE };
}

export async function placeOrder(deps: Deps, s: Session, i: { lines: CartLine[]; deliverTo: DeliveryTarget; jobId?: string; address?: string }) {
  const totals = priceCart(i.lines);
  let deliveryAddress = i.address?.trim() ?? '';
  if (i.deliverTo === 'artisan') {
    if (!i.jobId) throw ruleViolation('Delivery to an artisan needs a funded job.');
    const job = await getJob(deps, i.jobId);
    if (job.customerId !== s.userId) throw forbidden();
    if (!Esc.isLocationDisclosed(job) || !['funded', 'in_progress'].includes(job.status)) throw ruleViolation('Delivery to an artisan needs a funded job so we know where they will be.');
    const a = await getUser<Artisan>(deps, job.artisanId);
    deliveryAddress = `${a.businessName ?? a.name} — work location, ${a.area}, ${a.city}`;
  }
  if (!deliveryAddress) throw badRequest('Add a delivery address.');
  const id = newId('ord');
  const at = iso(deps);
  const order: Order = { id, userId: s.userId, lines: i.lines, ...totals, deliverTo: i.deliverTo, deliveryAddress, jobId: i.jobId, status: 'placed', placedAt: at, timeline: [{ at, label: 'Order placed — awaiting payment' }] };
  const reference = newId('ord_pay');
  await deps.db.tx(async (c) => {
    await deps.db.query("INSERT INTO orders (id, user_id, status, data) VALUES ($1, $2, 'placed', $3)", [id, s.userId, JSON.stringify(order)], c);
    await deps.db.query("INSERT INTO payments (reference, kind, target_id, user_id, amount, status) VALUES ($1, 'order', $2, $3, $4, 'pending')", [reference, id, s.userId, totals.total], c);
  });
  const checkout = await deps.payments.initializeCharge({ reference, amount: totals.total, email: `${s.userId}@${deps.cfg.customerEmailDomain}`, callbackUrl: deps.cfg.paystackCallbackUrl, metadata: { orderId: id, kind: 'order' } });
  return { order, reference, authorizationUrl: checkout.authorizationUrl };
}

export async function listOrders(deps: Deps, s: Session) {
  return (await deps.db.query<{ data: Order }>('SELECT data FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [s.userId])).map((r) => r.data);
}

/** Vendor/ops status updates (admin console or vendor integration). */
export async function updateOrderStatus(deps: Deps, s: Session, id: string, status: Order['status']) {
  if (s.role !== 'admin') throw forbidden();
  const steps: Order['status'][] = ['confirmed', 'dispatched', 'delivered', 'returned', 'cancelled'];
  if (!steps.includes(status)) throw badRequest('Invalid status.');
  return deps.db.tx(async (c) => {
    const row = await deps.db.one<{ data: Order }>('SELECT data FROM orders WHERE id = $1 FOR UPDATE', [id], c);
    if (!row) throw notFound('Order not found');
    const labels: Record<string, string> = { confirmed: 'Vendor confirmed your order', dispatched: 'Rider picked up your order', delivered: 'Delivered', returned: 'Rental returned', cancelled: 'Cancelled' };
    const o: Order = { ...row.data, status, timeline: [...row.data.timeline, { at: iso(deps), label: labels[status] }] };
    await deps.db.query('UPDATE orders SET status = $2, data = $3 WHERE id = $1', [id, status, JSON.stringify(o)], c);
    await notify(deps, o.userId, `Order ${status}`, `Order #${id.slice(-6).toUpperCase()}: ${labels[status]}.`, `/orders/${id}`, c);
    return o;
  });
}
