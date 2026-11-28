import React from 'react';
import { useStore } from '../../../src/store';
import { runOp } from '../ops';
import { Badge, Btn, done, Empty, Gate, Panel, Tabs, when } from '../ui';

const LABEL = { open: 'Waiting on Sleek', waiting_on_you: 'Waiting on customer', resolved: 'Resolved' } as const;
const TONE = { open: 'warn', waiting_on_you: 'info', resolved: 'good' } as const;
const PT = { urgent: 'bad', high: 'warn', normal: 'neutral' } as const;

export function Support() {
  const s = useStore();
  const [tab, setTab] = React.useState<'open' | 'waiting_on_you' | 'resolved'>('open');
  const [sel, setSel] = React.useState<string | null>(null);
  const [text, setText] = React.useState('');
  const name = (id: string) => s.customers.find((c) => c.id === id)?.name ?? s.artisans.find((a) => a.id === id)?.businessName ?? s.artisans.find((a) => a.id === id)?.name ?? s.sellers.find((x) => x.id === id)?.businessName ?? id;
  const order = { urgent: 0, high: 1, normal: 2 };
  const list = s.tickets.filter((t) => t.status === tab).sort((a, b) => order[a.priority] - order[b.priority] || b.updatedAt.localeCompare(a.updatedAt));
  const t = s.tickets.find((x) => x.id === sel) ?? list[0];
  const job = t?.jobId ? s.jobs.find((j) => j.id === t.jobId) : undefined;
  return (
    <div className="two" style={{ alignItems: 'start' }}>
      <Panel pad={false} title={<Tabs value={tab} onChange={(v) => { setTab(v); setSel(null); }} options={(['open', 'waiting_on_you', 'resolved'] as const).map((v) => ({ value: v, label: `${LABEL[v]} (${s.tickets.filter((x) => x.status === v).length})` }))} />}>
        <div className="list" style={{ padding: '0 16px' }}>
          {list.map((x) => (
            <div key={x.id} onClick={() => setSel(x.id)} style={{ cursor: 'pointer', background: t?.id === x.id ? 'var(--surface-2)' : undefined, margin: '0 -16px', padding: '10px 16px' }}>
              <div className="row spread">
                <span className="cellname">{x.subject}</span>
                <Badge tone={PT[x.priority]}>{x.priority}</Badge>
              </div>
              <div className="tiny muted">
                {name(x.userId)} · {x.userRole} · {x.category} · {when(x.updatedAt)}
              </div>
            </div>
          ))}
        </div>
        {!list.length ? <Empty>Nothing here.</Empty> : null}
      </Panel>
      {t ? (
        <Panel title={t.subject} right={<Badge tone={TONE[t.status]}>{LABEL[t.status]}</Badge>}>
          <div className="stack">
            <div className="small muted">
              {name(t.userId)} ({t.userRole}) · ticket #{t.id.slice(-5).toUpperCase()}
              {job ? ` · job “${job.title}” (${job.status})` : ''}
              {t.orderId ? ` · order #${t.orderId.slice(-6).toUpperCase()}` : ''}
            </div>
            <div className="chat">
              {t.messages.map((m) => (
                <div key={m.id} className={`msg ${m.from === 'system' ? 'sys' : m.from === 'agent' ? 'me' : ''}`}>
                  {m.from !== 'system' ? <div className="who">{m.from === 'agent' ? m.name ?? 'Sleek Support' : name(t.userId)}</div> : null}
                  <div className="small">{m.text}</div>
                  <div className="tiny muted">{when(m.at)}</div>
                </div>
              ))}
            </div>
            <Gate perm="support.reply">
              <div className="stack">
                <textarea className="input" placeholder="Reply to the customer. They see it in the app." value={text} onChange={(e) => setText(e.target.value)} aria-label="Reply" />
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  {t.status === 'resolved' ? (
                    <Btn kind="ghost" onClick={() => done(runOp('ticket.status', { ticketId: t.id, status: 'open' }), 'Reopened')}>
                      Reopen
                    </Btn>
                  ) : (
                    <Btn kind="ghost" onClick={() => done(runOp('ticket.status', { ticketId: t.id, status: 'resolved' }), 'Marked resolved')}>
                      Mark resolved
                    </Btn>
                  )}
                  <Btn onClick={() => done(runOp('ticket.reply', { ticketId: t.id, text }), 'Reply sent').ok && setText('')}>Send reply</Btn>
                </div>
              </div>
            </Gate>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
