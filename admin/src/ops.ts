import { category } from '../../src/data/categories';
import type { PlatformConfig, SafetyAlert, SupportTicket } from '../../src/domain/types';
import { useStore } from '../../src/store';
import { naira } from '../../src/utils/format';
import { type AuditEntry, cid, currentAdmin, useConsole, writeAudit } from './console';
import { can, type Perm, REFUND_APPROVAL_THRESHOLD, type RoleKey, ROLES } from './rbac';

/**
 * Every admin action goes through runOp: it checks the permission again, runs the
 * change, writes the audit entry (with a reason) and records how to undo it.
 */

export type R = { ok: true; note?: string } | { ok: false; error: string };
type Args = Record<string, any>;
interface OpDef {
  perm: Perm;
  /** Reason is mandatory for these. */
  needsReason?: boolean;
  run(a: Args): R | { ok: true; summary: string; target?: string; undo?: AuditEntry['undo']; note?: string };
}

const S = () => useStore.getState();
const nameOf = (id: string) => {
  const s = S();
  const u = s.customers.find((c) => c.id === id) ?? s.artisans.find((a) => a.id === id) ?? s.sellers.find((x) => x.id === id);
  return u ? ('businessName' in u && u.businessName ? `${u.businessName}` : u.name) : id;
};
const res = (r: { ok: boolean; error?: string }) => (r.ok ? null : ({ ok: false, error: r.error ?? 'Not possible.' } as R));

export const OPS: Record<string, OpDef> = {
  'user.suspend': {
    perm: 'users.suspend',
    needsReason: true,
    run: (a) => res(S().adminSetSuspended(a.userId, true, a.reason)) ?? { ok: true, summary: `Suspended ${nameOf(a.userId)}`, target: a.userId, undo: { op: 'user.restore', args: { userId: a.userId }, label: 'Restore account' } },
  },
  'user.restore': {
    perm: 'users.suspend',
    run: (a) => {
      const s = S();
      const prev = (s.customers.find((c) => c.id === a.userId) ?? s.artisans.find((x) => x.id === a.userId) ?? s.sellers.find((x) => x.id === a.userId))?.suspendedReason;
      return res(s.adminSetSuspended(a.userId, false, '')) ?? { ok: true, summary: `Restored ${nameOf(a.userId)}`, target: a.userId, undo: { op: 'user.suspend', args: { userId: a.userId, reason: prev ?? 'Re-suspended' }, label: 'Suspend again' } };
    },
  },
  'identity.review': {
    perm: 'verify.decide',
    run: (a) => {
      const s = S();
      const u = s.artisans.find((x) => x.id === a.userId) ?? s.sellers.find((x) => x.id === a.userId);
      const w = a.workerId && s.artisans.find((x) => x.id === a.userId)?.workers.find((x) => x.id === a.workerId);
      const prev = (w ? w.identity : u?.identity)?.postReview ?? 'pending';
      if (a.review === 'revoked' && (!a.reason || a.reason.trim().length < 5)) return { ok: false, error: 'Give a reason. The person is emailed it.' };
      return (
        res(s.adminSetIdentityReview(a.userId, a.review, a.reason ?? '', a.workerId)) ?? {
          ok: true,
          summary: `${a.review === 'confirmed' ? 'Confirmed' : a.review === 'revoked' ? 'Revoked' : 'Reset'} identity of ${w ? `${w.name} (${nameOf(a.userId)})` : nameOf(a.userId)}`,
          target: a.userId,
          undo: { op: 'identity.review', args: { userId: a.userId, workerId: a.workerId, review: prev, reason: 'Undo' }, label: `Set back to ${prev}` },
        }
      );
    },
  },
  'skill.review': {
    perm: 'verify.decide',
    run: (a) => {
      const s = S();
      const art = s.artisans.find((x) => x.id === a.artisanId);
      const list = a.workerId ? art?.workers.find((w) => w.id === a.workerId)?.skills : art?.skills;
      const prev = list?.find((k) => k.categoryId === a.categoryId)?.postReview ?? 'pending';
      if (a.review === 'revoked' && (!a.reason || a.reason.trim().length < 5)) return { ok: false, error: 'Give a reason. The artisan is emailed it.' };
      return (
        res(s.adminSetSkillReview(a.artisanId, a.categoryId, a.review, a.reason ?? '', a.workerId)) ?? {
          ok: true,
          summary: `${a.review === 'confirmed' ? 'Confirmed' : a.review === 'revoked' ? 'Revoked' : 'Reset'} ${category(a.categoryId).name} for ${nameOf(a.artisanId)}`,
          target: a.artisanId,
          undo: { op: 'skill.review', args: { artisanId: a.artisanId, workerId: a.workerId, categoryId: a.categoryId, review: prev, reason: 'Undo' }, label: `Set back to ${prev}` },
        }
      );
    },
  },
  'product.status': {
    perm: 'products.moderate',
    run: (a) => {
      const p = S().products.find((x) => x.id === a.productId);
      if (!p) return { ok: false, error: 'Product not found.' };
      if (a.status === 'unlisted' && (!a.reason || a.reason.trim().length < 5)) return { ok: false, error: 'Give a reason. The seller sees it.' };
      const prev = p.status ?? 'live';
      return res(S().adminSetProductStatus(a.productId, a.status, a.reason ?? '')) ?? { ok: true, summary: `${a.status === 'unlisted' ? 'Hid' : 'Restored'} listing “${p.name}”`, target: a.productId, undo: { op: 'product.status', args: { productId: a.productId, status: prev, reason: 'Undo' }, label: prev === 'live' ? 'Show again' : 'Hide again' } };
    },
  },
  'ticket.reply': {
    perm: 'support.reply',
    run: (a) => res(S().adminReplyTicket(a.ticketId, a.text)) ?? { ok: true, summary: `Replied to ticket #${String(a.ticketId).slice(-5).toUpperCase()}`, target: a.ticketId },
  },
  'ticket.status': {
    perm: 'support.reply',
    run: (a) => {
      const t = S().tickets.find((x) => x.id === a.ticketId);
      const prev: SupportTicket['status'] = t?.status ?? 'open';
      return res(S().adminSetTicketStatus(a.ticketId, a.status)) ?? { ok: true, summary: `${a.status === 'resolved' ? 'Resolved' : 'Reopened'} ticket #${String(a.ticketId).slice(-5).toUpperCase()}`, target: a.ticketId, undo: { op: 'ticket.status', args: { ticketId: a.ticketId, status: prev }, label: 'Set back' } };
    },
  },
  'safety.status': {
    perm: 'safety.manage',
    run: (a) => {
      const al = S().safetyAlerts.find((x) => x.id === a.alertId);
      if (!al) return { ok: false, error: 'Alert not found.' };
      const prev: SafetyAlert['status'] = al.status;
      S().updateSafetyAlert(a.alertId, a.status);
      return { ok: true, summary: `Safety alert ${a.status} (${nameOf(al.userId)})`, target: a.alertId, undo: { op: 'safety.status', args: { alertId: a.alertId, status: prev }, label: `Set back to ${prev}` } };
    },
  },
  'screening.reviewed': {
    perm: 'screening.review',
    run: (a) => {
      const v = S().violations.find((x) => x.id === a.violationId);
      if (!v) return { ok: false, error: 'Not found.' };
      useStore.setState((s) => ({ violations: s.violations.map((x) => (x.id === a.violationId ? { ...x, reviewed: !!a.reviewed } : x)) }));
      return { ok: true, summary: `${a.reviewed ? 'Confirmed block' : 'Reopened'}: ${nameOf(v.userId)} (${v.types.join(', ')})`, target: v.userId, undo: { op: 'screening.reviewed', args: { violationId: a.violationId, reviewed: !a.reviewed }, label: a.reviewed ? 'Reopen' : 'Confirm again' } };
    },
  },
  'dispute.resolve': {
    perm: 'disputes.resolve',
    needsReason: true,
    run: (a) => {
      const d = S().disputes.find((x) => x.id === a.disputeId);
      if (!d) return { ok: false, error: 'Dispute not found.' };
      if (d.status === 'open') S().startDisputeReview(a.disputeId);
      return res(S().resolveDispute(a.disputeId, a.outcome, a.share ?? 0.5, a.reason)) ?? { ok: true, summary: `Resolved dispute on job ${d.jobId.slice(-6).toUpperCase()}: ${a.outcome.replace(/_/g, ' ')}`, target: d.jobId };
    },
  },
  'claim.decide': {
    perm: 'disputes.resolve',
    run: (a) => res(S().decideGuaranteeClaim(a.claimId, a.approve, a.payout ?? 0)) ?? { ok: true, summary: `${a.approve ? 'Approved' : 'Declined'} Sleek Protection claim${a.approve ? ` (${naira(a.payout ?? 0)})` : ''}`, target: a.claimId },
  },
  'job.refund': {
    perm: 'finance.refund',
    needsReason: true,
    run: (a) => {
      const j = S().jobs.find((x) => x.id === a.jobId);
      return res(S().adminRefundJob(a.jobId, a.reason)) ?? { ok: true, summary: `Refunded ${naira(j?.escrow.amount ?? 0)} for “${j?.title}”`, target: a.jobId };
    },
  },
  'order.cancel': {
    perm: 'orders.manage',
    needsReason: true,
    run: (a) => res(S().adminSetOrderStatus(a.orderId, 'cancelled', a.reason)) ?? { ok: true, summary: `Cancelled and refunded order #${String(a.orderId).slice(-6).toUpperCase()}`, target: a.orderId },
  },
  'config.set': {
    perm: 'config.edit',
    run: (a) => {
      const prev = S().platformConfig;
      const patch = a.patch as Partial<PlatformConfig>;
      const before = Object.fromEntries(Object.keys(patch).map((k) => [k, (prev as any)[k]]));
      return res(S().adminSetConfig(patch)) ?? { ok: true, summary: `Changed settings: ${Object.keys(patch).join(', ')}`, undo: { op: 'config.set', args: { patch: before }, label: 'Restore previous values' } };
    },
  },
  'note.add': {
    perm: 'users.view',
    run: (a) => res(S().addAdminNote(a.targetType, a.targetId, a.text)) ?? { ok: true, summary: `Added a note`, target: a.targetId },
  },
  'pii.reveal': {
    perm: 'users.pii',
    needsReason: true,
    run: (a) => ({ ok: true, summary: `Revealed phone number of ${nameOf(a.userId)}`, target: a.userId }),
  },
  'admin.role': {
    perm: 'admins.manage',
    run: (a) => {
      const st = useConsole.getState();
      const u = st.admins.find((x) => x.id === a.adminId);
      if (!u) return { ok: false, error: 'Staff member not found.' };
      if (u.id === currentAdmin()?.id) return { ok: false, error: 'You can’t change your own role. Ask another Super Admin.' };
      const prev = u.role;
      useConsole.setState({ admins: st.admins.map((x) => (x.id === a.adminId ? { ...x, role: a.role } : x)) });
      return { ok: true, summary: `Changed ${u.name}: ${ROLES[prev].label} → ${ROLES[a.role as RoleKey].label}`, target: u.id, undo: { op: 'admin.role', args: { adminId: u.id, role: prev }, label: `Back to ${ROLES[prev].label}` } };
    },
  },
  'admin.disable': {
    perm: 'admins.manage',
    run: (a) => {
      const st = useConsole.getState();
      const u = st.admins.find((x) => x.id === a.adminId);
      if (!u) return { ok: false, error: 'Staff member not found.' };
      if (u.id === currentAdmin()?.id) return { ok: false, error: 'You can’t disable yourself.' };
      useConsole.setState({ admins: st.admins.map((x) => (x.id === a.adminId ? { ...x, disabled: !!a.disabled } : x)) });
      return { ok: true, summary: `${a.disabled ? 'Disabled' : 'Enabled'} staff account ${u.name}`, target: u.id, undo: { op: 'admin.disable', args: { adminId: u.id, disabled: !a.disabled }, label: a.disabled ? 'Enable again' : 'Disable again' } };
    },
  },
  'admin.unlock': {
    perm: 'admins.manage',
    run: (a) => {
      useConsole.setState((s) => ({ lockouts: { ...s.lockouts, [a.email]: { failures: 0 } } }));
      return { ok: true, summary: `Cleared sign-in lock for ${a.email}` };
    },
  },
};

export function runOp(op: string, args: Args, opts: { undoes?: string } = {}): R {
  const me = currentAdmin();
  if (!me || me.disabled) return { ok: false, error: 'Your session has ended. Sign in again.' };
  const def = OPS[op];
  if (!def) return { ok: false, error: 'Unknown action.' };
  if (!can(me.role, def.perm)) {
    writeAudit({ actorId: me.id, actorName: me.name, actorRole: me.role, op: 'denied', summary: `Blocked: ${op} needs ${def.perm}` });
    return { ok: false, error: `Your role (${ROLES[me.role].label}) can’t do this.` };
  }
  if (def.needsReason && (!args.reason || String(args.reason).trim().length < 5)) return { ok: false, error: 'Give a reason (at least 5 characters). It goes in the audit log.' };
  const out = def.run(args);
  if (!out.ok) return out;
  if ('summary' in out) writeAudit({ actorId: me.id, actorName: me.name, actorRole: me.role, op, summary: out.summary, target: out.target, reason: args.reason, undo: out.undo, undoes: opts.undoes });
  return { ok: true, note: 'note' in out ? out.note : undefined };
}

/** Undo an audited action. Allowed when the action is reversible and your role may do the reversing action. */
export function undoEntry(entryId: string): R {
  const me = currentAdmin();
  const e = useConsole.getState().audit.find((x) => x.id === entryId);
  if (!me || !e) return { ok: false, error: 'Not found.' };
  if (!e.undo) return { ok: false, error: 'This action can’t be undone (money moved or a message was sent). Make a correcting action instead.' };
  if (e.undoneAt) return { ok: false, error: 'Already undone.' };
  if (!can(me.role, 'audit.undo')) return { ok: false, error: 'Your role can’t undo actions.' };
  const r = runOp(e.undo.op, { ...e.undo.args, reason: (e.undo.args.reason as string) ?? `Undo of ${e.summary}` }, { undoes: e.id });
  if (!r.ok) return r;
  useConsole.setState((s) => ({ audit: s.audit.map((x) => (x.id === e.id ? { ...x, undoneAt: new Date().toISOString(), undoneBy: me.name } : x)) }));
  return { ok: true };
}

/** Refunds at or above the threshold wait for a second admin (maker-checker). */
export function requestRefund(jobId: string, reason: string): R & { pending?: boolean } {
  const me = currentAdmin();
  const j = S().jobs.find((x) => x.id === jobId);
  if (!me || !j) return { ok: false, error: 'Not found.' };
  if (!can(me.role, 'finance.refund')) return { ok: false, error: 'Your role can’t issue refunds.' };
  if (reason.trim().length < 5) return { ok: false, error: 'Give a reason (at least 5 characters).' };
  if (j.escrow.amount < REFUND_APPROVAL_THRESHOLD) return runOp('job.refund', { jobId, reason });
  const ap = { id: cid('apr'), op: 'job.refund', args: { jobId, reason }, summary: `Refund ${naira(j.escrow.amount)} for “${j.title}”`, amount: j.escrow.amount, requestedBy: me.id, requestedByName: me.name, requestedAt: new Date().toISOString(), status: 'pending' as const };
  useConsole.setState((s) => ({ approvals: [ap, ...s.approvals] }));
  writeAudit({ actorId: me.id, actorName: me.name, actorRole: me.role, op: 'approval.request', summary: `Requested approval: ${ap.summary}`, target: jobId, reason });
  return { ok: true, pending: true };
}

export function decideApproval(id: string, approve: boolean, note: string): R {
  const me = currentAdmin();
  const ap = useConsole.getState().approvals.find((x) => x.id === id);
  if (!me || !ap) return { ok: false, error: 'Not found.' };
  if (!can(me.role, 'finance.approve')) return { ok: false, error: 'Your role can’t approve money movements.' };
  if (ap.requestedBy === me.id) return { ok: false, error: 'You requested this, so someone else must approve it. That’s the maker-checker rule.' };
  if (ap.status !== 'pending') return { ok: false, error: 'Already decided.' };
  if (approve) {
    const r = runOp(ap.op, ap.args);
    if (!r.ok) return r;
  }
  useConsole.setState((s) => ({ approvals: s.approvals.map((x) => (x.id === id ? { ...x, status: approve ? 'approved' : 'rejected', decidedBy: me.name, decidedAt: new Date().toISOString(), note } : x)) }));
  writeAudit({ actorId: me.id, actorName: me.name, actorRole: me.role, op: 'approval.decide', summary: `${approve ? 'Approved' : 'Rejected'}: ${ap.summary} (requested by ${ap.requestedByName})`, reason: note });
  return { ok: true };
}
