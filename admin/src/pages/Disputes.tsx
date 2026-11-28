import React from 'react';
import { useStore } from '../../../src/store';
import { naira } from '../../../src/utils/format';
import { runOp } from '../ops';
import { Badge, Btn, done, Drawer, Empty, Gate, KV, Panel, ReasonModal, Tabs, when } from '../ui';

export function Disputes() {
  const s = useStore();
  const [tab, setTab] = React.useState<'disputes' | 'claims'>('disputes');
  const [open, setOpen] = React.useState<string | null>(null);
  const name = (id: string) => s.customers.find((c) => c.id === id)?.name ?? s.artisans.find((a) => a.id === id)?.businessName ?? s.artisans.find((a) => a.id === id)?.name ?? id;
  const d = s.disputes.find((x) => x.id === open);
  return (
    <>
      <Panel pad={false} title={<Tabs value={tab} onChange={setTab} options={[{ value: 'disputes', label: `Disputes (${s.disputes.filter((x) => x.status !== 'resolved').length} open)` }, { value: 'claims', label: `Sleek Protection claims (${s.guaranteeClaims.filter((c) => c.status === 'submitted').length})` }]} />}>
        {tab === 'disputes' ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Opened by</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>In Sleek Hold</th>
                </tr>
              </thead>
              <tbody>
                {s.disputes.map((x) => {
                  const j = s.jobs.find((jj) => jj.id === x.jobId);
                  return (
                    <tr key={x.id} className="click" onClick={() => setOpen(x.id)}>
                      <td>
                        <div className="cellname">{j?.title}</div>
                        <div className="tiny muted">
                          {name(j?.customerId ?? '')} vs {name(j?.artisanId ?? '')}
                        </div>
                      </td>
                      <td className="small">{x.openedBy}</td>
                      <td className="small">{x.reason.replace(/_/g, ' ')}</td>
                      <td>
                        <Badge tone={x.status === 'resolved' ? 'good' : x.status === 'under_review' ? 'info' : 'warn'}>{x.status.replace('_', ' ')}</Badge>
                      </td>
                      <td className="tnum" style={{ textAlign: 'right' }}>
                        {naira(j?.escrow.amount ?? 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!s.disputes.length ? <Empty>No disputes.</Empty> : null}
          </div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>What went wrong</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {s.guaranteeClaims.map((c) => {
                  const j = s.jobs.find((jj) => jj.id === c.jobId);
                  const cap = Math.min(s.platformConfig?.protectionCap ?? 50_000, j?.escrow.amount ?? 0);
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="cellname">{j?.title}</div>
                        <div className="tiny muted">{name(c.customerId)} · {when(c.at)}</div>
                      </td>
                      <td className="small">{c.details}</td>
                      <td>
                        <Badge tone={c.status === 'approved' ? 'good' : c.status === 'declined' ? 'bad' : 'warn'}>{c.status}</Badge>
                      </td>
                      <td>
                        {c.status === 'submitted' ? (
                          <Gate perm="disputes.resolve" quiet>
                            <div className="row">
                              <Btn sm kind="good" onClick={() => done(runOp('claim.decide', { claimId: c.id, approve: true, payout: cap }), `Approved ${naira(cap)}`)}>
                                Pay {naira(cap)}
                              </Btn>
                              <Btn sm kind="ghost" onClick={() => done(runOp('claim.decide', { claimId: c.id, approve: false }), 'Declined')}>
                                Decline
                              </Btn>
                            </div>
                          </Gate>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!s.guaranteeClaims.length ? <Empty>No Sleek Protection claims. Customers can claim within 7 days of release, up to ₦50,000.</Empty> : null}
          </div>
        )}
      </Panel>
      {d ? <DisputeDrawer id={d.id} name={name} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function DisputeDrawer({ id, name, onClose }: { id: string; name: (id: string) => string; onClose: () => void }) {
  const d = useStore((s) => s.disputes.find((x) => x.id === id))!;
  const j = useStore((s) => s.jobs.find((x) => x.id === d.jobId))!;
  const msgs = useStore((s) => s.messages).filter((m) => m.jobId === d.jobId);
  const [outcome, setOutcome] = React.useState<'release_to_artisan' | 'refund_customer' | 'split' | null>(null);
  const [share, setShare] = React.useState(50);
  const rate = useStore((s) => s.platformConfig?.commissionRate ?? 0.2);
  const gross = Math.round(j.escrow.amount * (outcome === 'release_to_artisan' ? 1 : outcome === 'refund_customer' ? 0 : share / 100));
  return (
    <Drawer title={`Dispute: ${j.title}`} sub={`${name(j.customerId)} vs ${name(j.artisanId)}`} onClose={onClose}>
      <KV rows={[['Reason', d.reason.replace(/_/g, ' ')], ['Opened by', `${d.openedBy} · ${when(d.openedAt)}`], ['Their account', d.details], ['Artisan’s reply', d.artisanResponse ?? 'No reply yet'], ['Evidence photos', String(d.evidence.length)], ['In Sleek Hold', naira(j.escrow.amount)], ...(d.resolution ? ([['Decision', `${d.resolution.outcome.replace(/_/g, ' ')} · ${d.resolution.note}`]] as [string, React.ReactNode][]) : [])]} />
      <div>
        <h3>Chat history</h3>
        <div className="chat" style={{ marginTop: 8 }}>
          {msgs.slice(-10).map((m) => (
            <div key={m.id} className={`msg ${m.from === 'system' ? 'sys' : m.from === 'customer' ? 'me' : ''}`}>
              {m.from !== 'system' ? <div className="who">{m.from}</div> : null}
              <div className="small">{m.text}</div>
            </div>
          ))}
        </div>
      </div>
      {d.status !== 'resolved' ? (
        <Gate perm="disputes.resolve">
          <div className="stack">
            <h3>Decide</h3>
            <div className="row">
              <Btn kind="ghost" onClick={() => setOutcome('release_to_artisan')}>
                Pay the artisan
              </Btn>
              <Btn kind="ghost" onClick={() => setOutcome('refund_customer')}>
                Refund the customer
              </Btn>
              <Btn kind="ghost" onClick={() => setOutcome('split')}>
                Split
              </Btn>
            </div>
          </div>
        </Gate>
      ) : null}
      {outcome ? (
        <ReasonModal
          title="Resolve this dispute"
          body={`Artisan receives ${naira(Math.round(gross * (1 - rate)))} (after ${Math.round(rate * 100)}% commission). Customer is refunded ${naira(j.escrow.amount - gross)}. Money moves at once, so this can’t be undone. Both sides see your note.`}
          extra={
            outcome === 'split' ? (
              <div className="field">
                <label htmlFor="share">Artisan’s share: {share}%</label>
                <input id="share" type="range" min={0} max={100} step={5} value={share} onChange={(e) => setShare(Number(e.target.value))} />
              </div>
            ) : undefined
          }
          confirm="Resolve and move money"
          onCancel={() => setOutcome(null)}
          onConfirm={(reason) => {
            const r = done(runOp('dispute.resolve', { disputeId: d.id, outcome, share: share / 100, reason }), 'Dispute resolved');
            if (r.ok) setOutcome(null);
            return r;
          }}
        />
      ) : null}
    </Drawer>
  );
}
