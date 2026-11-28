import React from 'react';
import { category } from '../../../src/data/categories';
import { STATUS_LABEL } from '../../../src/domain/escrow';
import type { Job } from '../../../src/domain/types';
import { useStore } from '../../../src/store';
import { naira } from '../../../src/utils/format';
import { requestRefund, runOp } from '../ops';
import { REFUND_APPROVAL_THRESHOLD } from '../rbac';
import { Badge, Btn, done, Drawer, Empty, Gate, KV, Panel, ReasonModal, Tabs, toast, when } from '../ui';

const TONE: Record<string, 'good' | 'warn' | 'bad' | 'info' | 'neutral'> = { completed: 'good', resolved: 'good', funded: 'info', in_progress: 'info', proof_submitted: 'warn', price_agreed: 'warn', requested: 'neutral', disputed: 'bad', cancelled: 'neutral', declined: 'neutral' };
type F = 'active' | 'all' | 'disputed' | 'closed';

export function Jobs() {
  const jobs = useStore((s) => s.jobs);
  const s = useStore();
  const [f, setF] = React.useState<F>('active');
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState<string | null>(null);
  const name = (id: string) => s.customers.find((c) => c.id === id)?.name ?? s.artisans.find((a) => a.id === id)?.businessName ?? s.artisans.find((a) => a.id === id)?.name ?? id;
  const list = jobs
    .filter((j) => (f === 'all' ? true : f === 'disputed' ? j.status === 'disputed' : f === 'closed' ? ['completed', 'resolved', 'cancelled', 'declined'].includes(j.status) : !['completed', 'resolved', 'cancelled', 'declined'].includes(j.status)))
    .filter((j) => !q || `${j.title} ${j.id} ${name(j.customerId)} ${name(j.artisanId)}`.toLowerCase().includes(q.toLowerCase()));
  const job = jobs.find((j) => j.id === open);
  return (
    <>
      <Panel
        pad={false}
        title={<Tabs value={f} onChange={setF} options={[{ value: 'active', label: 'Active' }, { value: 'disputed', label: 'Disputed' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }]} />}
        right={<input className="input" style={{ maxWidth: 240 }} placeholder="Search jobs, people, ref" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search jobs" />}
      >
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Customer</th>
                <th>Artisan</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {list.map((j) => (
                <tr key={j.id} className="click" onClick={() => setOpen(j.id)}>
                  <td>
                    <div className="cellname">{j.title}</div>
                    <div className="tiny muted">
                      {category(j.categoryId).name} · {j.id.slice(-6).toUpperCase()}
                      {j.origin !== 'app' ? ` · via ${j.origin}` : ''}
                    </div>
                  </td>
                  <td>{name(j.customerId)}</td>
                  <td>{name(j.artisanId)}</td>
                  <td>
                    <Badge tone={TONE[j.status]}>{STATUS_LABEL[j.status]}</Badge>
                  </td>
                  <td className="tnum" style={{ textAlign: 'right' }}>
                    {j.pricePool.locked ? naira(j.pricePool.locked.amount) : '—'}
                  </td>
                  <td className="small muted">{when(j.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length ? <Empty>No jobs match.</Empty> : null}
        </div>
      </Panel>
      {job ? <JobDrawer job={job} name={name} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function JobDrawer({ job, name, onClose }: { job: Job; name: (id: string) => string; onClose: () => void }) {
  const messages = useStore((s) => s.messages).filter((m) => m.jobId === job.id);
  const violations = useStore((s) => s.violations).filter((v) => v.jobId === job.id);
  const notes = useStore((s) => s.adminNotes).filter((n) => n.targetId === job.id);
  const [refund, setRefund] = React.useState(false);
  const [note, setNote] = React.useState('');
  const held = job.escrow.state === 'held' || job.escrow.state === 'frozen';
  return (
    <Drawer title={job.title} sub={`${category(job.categoryId).name} · Ref ${job.id.slice(-6).toUpperCase()}`} onClose={onClose}>
      <KV
        rows={[
          ['Status', <Badge tone={TONE[job.status]}>{STATUS_LABEL[job.status]}</Badge>],
          ['Customer', name(job.customerId)],
          ['Artisan', name(job.artisanId)],
          ['When', `${when(job.window.start)} – ${new Date(job.window.end).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' })}`],
          ['Area', `${job.address.area}, ${job.address.city}`],
          ['Agreed price', job.pricePool.locked ? naira(job.pricePool.locked.amount) : 'Not agreed yet'],
          ['Escrow', `${job.escrow.state}${job.escrow.amount ? ` · ${naira(job.escrow.amount)}` : ''}`],
          ...(job.escrow.commission ? ([['Sleek commission', naira(job.escrow.commission)]] as [string, React.ReactNode][]) : []),
          ['Booked through', job.origin],
          ...(job.fee ? ([[`Upfront ${job.fee.type} fee`, `${naira(job.fee.amount)} · ${job.fee.status}${job.fee.commission ? ` · Sleek ${naira(job.fee.commission)}` : ''}`]] as [string, React.ReactNode][]) : []),
        ]}
      />
      <div className="row">
        <Gate perm="finance.refund">
          <Btn kind="danger" sm disabled={!held} onClick={() => setRefund(true)}>
            Refund customer in full
          </Btn>
        </Gate>
        {!held ? <span className="tiny muted">No money held for this job.</span> : null}
      </div>
      <div>
        <h3>Timeline</h3>
        <div className="list">
          {job.timeline.map((t, i) => (
            <div key={i} className="row spread">
              <span className="small">{t.label}</span>
              <span className="tiny muted">{when(t.at)}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3>Chat ({messages.length})</h3>
        {violations.length ? <div className="notice bad small">{violations.length} blocked attempt(s) to share contact details in this chat.</div> : null}
        <div className="chat" style={{ marginTop: 8 }}>
          {messages.slice(-12).map((m) => (
            <div key={m.id} className={`msg ${m.from === 'system' ? 'sys' : m.from === 'customer' ? 'me' : ''}`}>
              {m.from !== 'system' ? <div className="who">{m.from}</div> : null}
              <div className="small">{m.text}</div>
            </div>
          ))}
        </div>
      </div>
      <Gate perm="users.view" quiet>
        <div className="stack">
          <h3>Staff notes</h3>
          {notes.map((n) => (
            <div key={n.id} className="small">
              <b>{n.by}</b> · {when(n.at)}
              <div>{n.text}</div>
            </div>
          ))}
          <textarea className="input" placeholder="Add a note for other staff" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
          <Btn sm kind="ghost" onClick={() => done(runOp('note.add', { targetType: 'job', targetId: job.id, text: note }), 'Note added').ok && setNote('')}>
            Add note
          </Btn>
        </div>
      </Gate>
      {refund ? (
        <ReasonModal
          title={`Refund ${naira(job.escrow.amount)}?`}
          body={job.escrow.amount >= REFUND_APPROVAL_THRESHOLD ? `Refunds of ${naira(REFUND_APPROVAL_THRESHOLD)} or more need a second admin to approve them.` : 'The money goes back to the customer’s original payment method. This can’t be undone.'}
          confirm={job.escrow.amount >= REFUND_APPROVAL_THRESHOLD ? 'Request approval' : 'Refund now'}
          danger
          onCancel={() => setRefund(false)}
          onConfirm={(reason) => {
            const r = requestRefund(job.id, reason);
            if (r.ok) {
              setRefund(false);
              toast(r.pending ? 'Sent for approval' : 'Refund sent');
            }
            return r;
          }}
        />
      ) : null}
    </Drawer>
  );
}
