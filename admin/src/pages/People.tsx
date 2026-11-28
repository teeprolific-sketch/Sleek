import React from 'react';
import { category } from '../../../src/data/categories';
import type { Artisan, Customer, Seller } from '../../../src/domain/types';
import { useStore } from '../../../src/store';
import { maskPhone, naira } from '../../../src/utils/format';
import { runOp } from '../ops';
import { Badge, Btn, done, Drawer, Empty, Gate, KV, Panel, ReasonModal, Tabs, when } from '../ui';

type Kind = 'customers' | 'artisans' | 'sellers';
type Person = Customer | Artisan | Seller;

const local = (p: string) => {
  const d = p.replace(/\D/g, '');
  const l = d.startsWith('234') ? `0${d.slice(3)}` : d;
  return l.length === 11 ? `${l.slice(0, 4)} ${l.slice(4, 7)} ${l.slice(7)}` : p;
};

export function verifState(p: Person): { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' } {
  if (p.role === 'customer') return p.identity?.nin === 'passed' ? { label: 'NIN verified', tone: 'good' } : { label: 'Not verified', tone: 'warn' };
  const i = p.identity;
  if (i.postReview === 'revoked') return { label: 'Revoked', tone: 'bad' };
  if (i.faceMatch !== 'passed') return { label: 'Not verified', tone: 'warn' };
  if (!p.activatedAt) return { label: 'Onboarding unfinished', tone: 'warn' };
  return i.postReview === 'pending' ? { label: 'Verified · audit due', tone: 'warn' } : { label: 'Verified', tone: 'good' };
}

export function People() {
  const s = useStore();
  const [kind, setKind] = React.useState<Kind>('artisans');
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState<string | null>(null);
  const all: Person[] = kind === 'customers' ? s.customers : kind === 'artisans' ? s.artisans : s.sellers;
  const list = all.filter((p) => !q || `${p.name} ${'businessName' in p ? p.businessName ?? '' : ''} ${p.area} ${p.city} ${p.id}`.toLowerCase().includes(q.toLowerCase()));
  const person = [...s.customers, ...s.artisans, ...s.sellers].find((p) => p.id === open);
  return (
    <>
      <Panel
        pad={false}
        title={<Tabs value={kind} onChange={setKind} options={[{ value: 'artisans', label: `Artisans & teams (${s.artisans.length})` }, { value: 'customers', label: `Customers (${s.customers.length})` }, { value: 'sellers', label: `Sellers (${s.sellers.length})` }]} />}
        right={<input className="input" style={{ maxWidth: 240 }} placeholder="Search name, area, ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />}
      >
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Area</th>
                <th>Verification</th>
                <th>Phone</th>
                <th>Account</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const v = verifState(p);
                return (
                  <tr key={p.id} className="click" onClick={() => setOpen(p.id)}>
                    <td>
                      <div className="cellname">{'businessName' in p && p.businessName ? p.businessName : p.name}</div>
                      <div className="tiny muted">{p.role === 'artisan' ? (p.accountType === 'individual' ? 'Artisan' : p.accountType === 'team' ? `Team · ${p.workers.length} workers` : `Agency · ${p.workers.length} workers`) : p.role === 'seller' ? `Seller · ${p.name}` : 'Customer'}</div>
                    </td>
                    <td className="small">
                      {p.area}, {p.city}
                    </td>
                    <td>
                      <Badge tone={v.tone}>{v.label}</Badge>
                    </td>
                    <td className="small tnum">{maskPhone(p.phone)}</td>
                    <td>{p.suspended ? <Badge tone="bad">Suspended</Badge> : <Badge tone="good">Active</Badge>}</td>
                    <td className="small muted">{when(p.joinedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!list.length ? <Empty>No one matches.</Empty> : null}
        </div>
      </Panel>
      {person ? <PersonDrawer p={person} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function PersonDrawer({ p, onClose }: { p: Person; onClose: () => void }) {
  const jobs = useStore((s) => s.jobs).filter((j) => j.customerId === p.id || j.artisanId === p.id);
  const violations = useStore((s) => s.violations).filter((v) => v.userId === p.id);
  const tickets = useStore((s) => s.tickets).filter((t) => t.userId === p.id);
  const [revealed, setRevealed] = React.useState(false);
  const [ask, setAsk] = React.useState<'suspend' | 'reveal' | null>(null);
  const v = verifState(p);
  const display = 'businessName' in p && p.businessName ? p.businessName : p.name;
  return (
    <Drawer title={display} sub={`${p.role === 'artisan' ? 'Artisan account' : p.role === 'seller' ? 'Sleek Services seller' : 'Customer'} · ${p.id}`} onClose={onClose}>
      {p.suspended ? <div className="notice bad"><b>Suspended</b>{p.suspendedReason}</div> : null}
      <KV
        rows={[
          ['Name', p.name],
          ['Area', `${p.area}, ${p.city}`],
          [
            'Phone',
            <span className="row">
              <span className="tnum">{revealed ? local(p.phone) : maskPhone(p.phone)}</span>
              {!revealed ? (
                <Gate perm="users.pii" quiet>
                  <button className="linkbtn" onClick={() => setAsk('reveal')}>
                    Reveal
                  </button>
                </Gate>
              ) : null}
            </span>,
          ],
          ['Email', 'email' in p && p.email ? p.email : '—'],
          ['Signed in with', p.authProvider ?? 'phone'],
          ...(p.role !== 'customer' ? ([['Guarantor', p.guarantor ? `${p.guarantor.name} · ${p.guarantor.relationship} · ${p.guarantor.occupation} · ${p.guarantor.status}` : 'None yet'], ['Account opened', p.activatedAt ? when(p.activatedAt) : 'Not yet: onboarding unfinished']] as [string, React.ReactNode][]) : []),
          ...(p.role === 'artisan' && p.accountType !== 'individual' ? ([['CAC', p.business?.cacNumber ?? (p.business?.cacPending ? 'Not registered yet (flagged)' : '—')]] as [string, React.ReactNode][]) : []),
          ...(p.role === 'seller' ? ([['CAC', p.cacNumber ?? (p.cacPending ? 'Not registered yet (flagged)' : '—')]] as [string, React.ReactNode][]) : []),
          ['Policies agreed', p.consents?.length ? p.consents.map((c) => `${c.policyId} v${c.version}`).join(', ') : 'Before policy consent was recorded'],
          ['Verification', <Badge tone={v.tone}>{v.label}</Badge>],
          ...(p.role !== 'customer' && p.identity.ninLast4 ? ([['NIN', `•••• ${p.identity.ninLast4} · face match ${Math.round((p.identity.faceMatchScore ?? 0) * 100)}%`]] as [string, React.ReactNode][]) : []),
          ['Jobs', String(jobs.length)],
          ['Off-app attempts', String(violations.length)],
          ['Support tickets', String(tickets.length)],
          ['Joined', when(p.joinedAt)],
        ]}
      />
      {p.role === 'artisan' ? (
        <div>
          <h3>Skills</h3>
          <div className="list">
            {p.skills.map((k) => (
              <div key={k.categoryId} className="row spread">
                <span className="small">{category(k.categoryId).name}</span>
                <span className="row">
                  <Badge tone={k.status === 'approved' ? 'good' : k.status === 'rejected' ? 'bad' : 'warn'}>{k.status.replace('_', ' ')}</Badge>
                  {k.postReview ? <Badge tone={k.postReview === 'confirmed' ? 'good' : k.postReview === 'revoked' ? 'bad' : 'warn'}>audit: {k.postReview}</Badge> : null}
                </span>
              </div>
            ))}
            {!p.skills.length ? <div className="small muted">No skills yet.</div> : null}
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            Rating {p.stats.ratingCount ? (p.stats.ratingSum / p.stats.ratingCount).toFixed(1) : '—'} · {p.stats.completedJobs} completed · {p.stats.cancelledByArtisan} cancelled · starting prices {Object.values(p.startingPrices).slice(0, 2).map(naira).join(', ') || '—'}
          </div>
        </div>
      ) : null}
      <div className="row">
        <Gate perm="users.suspend">
          {p.suspended ? (
            <Btn kind="good" onClick={() => done(runOp('user.restore', { userId: p.id }), 'Account restored')}>
              Restore account
            </Btn>
          ) : (
            <Btn kind="danger" onClick={() => setAsk('suspend')}>
              Suspend account
            </Btn>
          )}
        </Gate>
      </div>
      {violations.length ? (
        <div>
          <h3>Blocked messages</h3>
          <div className="list">
            {violations.map((x) => (
              <div key={x.id}>
                <div className="small">“{x.excerpt}”</div>
                <div className="tiny muted">
                  {x.types.join(', ')} · {when(x.at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {ask === 'suspend' ? (
        <ReasonModal title={`Suspend ${display}?`} body="They can’t book, chat, sell or take jobs until restored. They are told the reason. You can undo this from the audit log." confirm="Suspend" danger onCancel={() => setAsk(null)} onConfirm={(reason) => { const r = done(runOp('user.suspend', { userId: p.id, reason }), 'Account suspended'); if (r.ok) setAsk(null); return r; }} />
      ) : null}
      {ask === 'reveal' ? (
        <ReasonModal title="Reveal phone number?" body="Only reveal it when you need to contact this person about a live job, safety issue or dispute. This is logged." confirm="Reveal" onCancel={() => setAsk(null)} onConfirm={(reason) => { const r = runOp('pii.reveal', { userId: p.id, reason }); if (r.ok) { setRevealed(true); setAsk(null); } return r; }} />
      ) : null}
    </Drawer>
  );
}
