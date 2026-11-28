import React from 'react';
import { useStore } from '../../../src/store';
import { naira } from '../../../src/utils/format';
import { useConsole } from '../console';
import { decideApproval } from '../ops';
import { REFUND_APPROVAL_THRESHOLD } from '../rbac';
import { Badge, Btn, done, Empty, Gate, Kpi, Panel, when } from '../ui';

export function Finance() {
  const s = useStore();
  const approvals = useConsole((c) => c.approvals);
  const me = useConsole((c) => c.session?.adminId);
  const rate = s.platformConfig?.commissionRate ?? 0.2;
  const held = s.jobs.filter((j) => j.escrow.state === 'held' || j.escrow.state === 'frozen');
  const released = s.jobs.filter((j) => j.escrow.releasedToArtisan);
  const commission = s.jobs.reduce((t, j) => t + (j.escrow.commission ?? 0), 0);
  const feeCommission = s.jobs.reduce((t, j) => t + (j.fee?.commission ?? 0), 0);
  const feesHeld = s.jobs.filter((j) => j.fee?.status === 'held').reduce((t, j) => t + (j.fee?.amount ?? 0), 0);
  const refunded = s.jobs.reduce((t, j) => t + (j.escrow.refundedToCustomer ?? 0), 0);
  const ordersRev = s.orders.filter((o) => o.status !== 'cancelled').reduce((t, o) => t + o.total, 0);
  const servicesFee = Math.round(s.orders.filter((o) => o.status === 'delivered').reduce((t, o) => t + o.subtotal, 0) * rate);
  const payouts = s.payouts.reduce((t, p) => t + p.amount, 0);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="grid kpis">
        <Kpi label="Held in Sleek Hold" value={naira(held.reduce((t, j) => t + j.escrow.amount, 0))} sub={`${held.length} jobs`} />
        <Kpi label="Job commission earned" value={naira(commission)} sub={`${Math.round(rate * 100)}% of released jobs`} />
        <Kpi label="Sleek Services commission" value={naira(servicesFee)} sub={`From ${naira(ordersRev)} of orders`} />
        <Kpi label="Upfront fee commission" value={naira(feeCommission)} sub={`${naira(feesHeld)} of fees in Sleek Hold now`} />
        <Kpi label="Refunded to customers" value={naira(refunded)} />
        <Kpi label="Paid out to artisans" value={naira(payouts)} sub={`${s.payouts.length} payouts`} />
      </div>
      <Panel title="Refunds waiting for a second approval" right={<span className="small muted">Maker-checker: {naira(REFUND_APPROVAL_THRESHOLD)} or more</span>}>
        <div className="list">
          {approvals.map((a) => (
            <div key={a.id} className="row spread">
              <div>
                <div className="cellname">{a.summary}</div>
                <div className="tiny muted">
                  Requested by {a.requestedByName} · {when(a.requestedAt)} · reason: {String(a.args.reason)}
                  {a.decidedBy ? ` · ${a.status} by ${a.decidedBy}` : ''}
                </div>
              </div>
              {a.status === 'pending' ? (
                <Gate perm="finance.approve">
                  {a.requestedBy === me ? (
                    <span className="small muted">Waiting for another approver</span>
                  ) : (
                    <div className="row">
                      <Btn sm kind="good" onClick={() => done(decideApproval(a.id, true, 'Approved'), 'Approved and refunded')}>
                        Approve
                      </Btn>
                      <Btn sm kind="ghost" onClick={() => done(decideApproval(a.id, false, 'Rejected'), 'Rejected')}>
                        Reject
                      </Btn>
                    </div>
                  )}
                </Gate>
              ) : (
                <Badge tone={a.status === 'approved' ? 'good' : 'bad'}>{a.status}</Badge>
              )}
            </div>
          ))}
          {!approvals.length ? <div className="small muted">None. Refunds of {naira(REFUND_APPROVAL_THRESHOLD)} or more, started from a job, appear here.</div> : null}
        </div>
      </Panel>
      <Panel pad={false} title="Money held right now">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>State</th>
                <th>Paid in</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'right' }}>Artisan gets</th>
              </tr>
            </thead>
            <tbody>
              {held.map((j) => (
                <tr key={j.id}>
                  <td className="cellname">{j.title}</td>
                  <td>
                    <Badge tone={j.escrow.state === 'frozen' ? 'bad' : 'info'}>{j.escrow.state === 'frozen' ? 'Frozen (dispute)' : 'Held'}</Badge>
                  </td>
                  <td className="small muted">{when(j.escrow.fundedAt)}</td>
                  <td className="tnum" style={{ textAlign: 'right' }}>
                    {naira(j.escrow.amount)}
                  </td>
                  <td className="tnum" style={{ textAlign: 'right' }}>
                    {naira(Math.round(j.escrow.amount * (1 - rate)))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!held.length ? <Empty>No money held.</Empty> : null}
        </div>
      </Panel>
      <div className="small muted">Released jobs: {released.length}. To refund a job, open it in Jobs.</div>
    </div>
  );
}
