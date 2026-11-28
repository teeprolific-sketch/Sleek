import React from 'react';
import { useStore } from '../../../src/store';
import { naira } from '../../../src/utils/format';
import { useConsole } from '../console';
import { can } from '../rbac';
import { Kpi, Panel, useRole, when } from '../ui';

export function Overview({ go }: { go: (p: string) => void }) {
  const role = useRole();
  const s = useStore();
  const approvals = useConsole((c) => c.approvals);
  const audit = useConsole((c) => c.audit);
  const rate = s.platformConfig?.commissionRate ?? 0.2;

  const funded = s.jobs.filter((j) => j.escrow.fundedAt);
  const gmv = funded.reduce((t, j) => t + j.escrow.amount, 0) + s.orders.filter((o) => o.status !== 'cancelled').reduce((t, o) => t + o.subtotal, 0);
  const commission = s.jobs.reduce((t, j) => t + (j.escrow.commission ?? 0) + (j.fee?.commission ?? 0), 0);
  const servicesFee = Math.round(s.orders.filter((o) => o.status === 'delivered').reduce((t, o) => t + o.subtotal, 0) * rate);
  const held = s.jobs.filter((j) => j.escrow.state === 'held' || j.escrow.state === 'frozen').reduce((t, j) => t + j.escrow.amount, 0);
  const active = s.jobs.filter((j) => ['funded', 'in_progress', 'proof_submitted'].includes(j.status)).length;
  const pendingAudits =
    s.artisans.reduce((t, a) => t + (a.identity.postReview === 'pending' ? 1 : 0) + [...a.skills, ...a.workers.flatMap((w) => w.skills)].filter((k) => k.postReview === 'pending').length, 0) +
    s.sellers.filter((x) => x.identity.postReview === 'pending').length;
  const openDisputes = s.disputes.filter((d) => d.status !== 'resolved').length;
  const openTickets = s.tickets.filter((t) => t.status === 'open').length;
  const openSafety = s.safetyAlerts.filter((a) => a.status === 'open').length;
  const unreviewed = s.violations.filter((v) => !v.reviewed).length;
  const pendingApprovals = approvals.filter((a) => a.status === 'pending').length;
  const people = s.customers.length + s.artisans.length + s.sellers.length;
  const suspended = [...s.customers, ...s.artisans, ...s.sellers].filter((u) => u.suspended).length;

  const needs: { label: string; n: number; page: string; perm: Parameters<typeof can>[1] }[] = [
    { label: 'Safety alerts open', n: openSafety, page: 'safety', perm: 'safety.view' },
    { label: 'Verifications to audit', n: pendingAudits, page: 'verification', perm: 'verify.view' },
    { label: 'Disputes waiting', n: openDisputes, page: 'disputes', perm: 'disputes.view' },
    { label: 'Support tickets open', n: openTickets, page: 'support', perm: 'support.view' },
    { label: 'Blocked messages to review', n: unreviewed, page: 'screening', perm: 'screening.review' },
    { label: 'Refunds waiting for approval', n: pendingApprovals, page: 'finance', perm: 'finance.approve' },
  ];

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="grid kpis">
        <Kpi label="Booking value (GMV)" value={naira(gmv)} sub="Jobs paid into Sleek Hold + Services orders" />
        <Kpi label="Sleek revenue" value={naira(commission + servicesFee)} sub={`${Math.round(rate * 100)}% commission, not GMV`} />
        <Kpi label="Held in Sleek Hold now" value={naira(held)} sub="Released on approval or auto-release" />
        <Kpi label="Active jobs" value={String(active)} sub={`${s.jobs.length} jobs in total`} />
        <Kpi label="People on Sleek" value={String(people)} sub={`${s.artisans.length} artisans · ${s.sellers.length} sellers · ${suspended} suspended`} />
      </div>
      <div className="two">
        <Panel title="Needs attention">
          <div className="list">
            {needs
              .filter((x) => can(role, x.perm))
              .map((x) => (
                <div key={x.label} className="row spread">
                  <span>{x.label}</span>
                  <span className="row">
                    <span className={`badge ${x.n ? 'warn' : 'good'} tnum`}>{x.n}</span>
                    <button className="linkbtn" onClick={() => go(x.page)}>
                      Open
                    </button>
                  </span>
                </div>
              ))}
          </div>
        </Panel>
        <Panel title="Latest staff activity">
          {can(role, 'audit.view') ? (
            <div className="list">
              {audit.slice(0, 7).map((e) => (
                <div key={e.id}>
                  <div className="small">{e.summary}</div>
                  <div className="tiny muted">
                    {e.actorName} · {when(e.at)}
                  </div>
                </div>
              ))}
              {!audit.length ? <div className="muted small">Nothing yet.</div> : null}
            </div>
          ) : (
            <div className="muted small">Your role can’t see the audit log.</div>
          )}
        </Panel>
      </div>
      <Panel title="Jobs by stage">
        <div className="stack">
          {(['requested', 'price_agreed', 'funded', 'in_progress', 'proof_submitted', 'disputed', 'completed', 'cancelled'] as const).map((st) => {
            const n = s.jobs.filter((j) => j.status === st).length;
            const max = Math.max(1, ...['requested', 'price_agreed', 'funded', 'in_progress', 'proof_submitted', 'disputed', 'completed', 'cancelled'].map((x) => s.jobs.filter((j) => j.status === x).length));
            return (
              <div key={st} className="row" style={{ flexWrap: 'nowrap' }}>
                <span className="small" style={{ width: 130, flexShrink: 0 }}>
                  {st.replace(/_/g, ' ')}
                </span>
                <div className="bar" style={{ flex: 1 }}>
                  <span style={{ width: `${(n / max) * 100}%` }} />
                </div>
                <span className="small tnum" style={{ width: 28, textAlign: 'right' }}>
                  {n}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
