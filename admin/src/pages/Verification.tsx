import React from 'react';
import { category } from '../../../src/data/categories';
import type { PostReview } from '../../../src/domain/types';
import { useStore } from '../../../src/store';
import { runOp } from '../ops';
import { Badge, Btn, done, Empty, Gate, Panel, ReasonModal, Tabs, when } from '../ui';

interface Item {
  key: string;
  kind: 'identity' | 'skill';
  userId: string;
  workerId?: string;
  categoryId?: string;
  who: string;
  account: string;
  detail: string;
  at?: string;
  review: PostReview;
  highRisk: boolean;
}

/**
 * Verification is instant for artisans and sellers. This queue is the Trust team’s
 * audit afterwards: confirm it, or revoke it (the person is emailed and taken off).
 */
export function Verification() {
  const s = useStore();
  const [tab, setTab] = React.useState<'pending' | 'revoked' | 'confirmed'>('pending');
  const [revoke, setRevoke] = React.useState<Item | null>(null);

  const items: Item[] = [];
  for (const a of s.artisans) {
    const acct = a.businessName ?? a.name;
    if (a.identity.faceMatch === 'passed') items.push({ key: `${a.id}:id`, kind: 'identity', userId: a.id, who: a.name, account: acct, detail: `NIN •••• ${a.identity.ninLast4 ?? '—'} · face ${Math.round((a.identity.faceMatchScore ?? 0) * 100)}%`, at: a.identity.verifiedAt, review: a.identity.postReview ?? 'confirmed', highRisk: false });
    for (const w of a.workers) if (w.identity.faceMatch === 'passed') items.push({ key: `${a.id}:${w.id}:id`, kind: 'identity', userId: a.id, workerId: w.id, who: w.name, account: acct, detail: `Worker · face ${Math.round((w.identity.faceMatchScore ?? 0) * 100)}%`, at: w.identity.verifiedAt, review: w.identity.postReview ?? 'confirmed', highRisk: false });
    const skills = [...a.skills.map((k) => ({ k, w: undefined as undefined | { id: string; name: string } })), ...a.workers.flatMap((w) => w.skills.map((k) => ({ k, w: { id: w.id, name: w.name } })))];
    for (const { k, w } of skills) {
      if (k.status !== 'approved' && k.postReview !== 'revoked') continue;
      const cat = category(k.categoryId);
      items.push({ key: `${a.id}:${w?.id ?? ''}:${k.categoryId}`, kind: 'skill', userId: a.id, workerId: w?.id, categoryId: k.categoryId, who: w?.name ?? a.name, account: acct, detail: `${cat.name}${k.video ? ` · ${k.video.durationSec}s video · face ${Math.round(k.video.faceMatchScore * 100)}%` : ''}`, at: k.decidedAt ?? k.submittedAt, review: k.postReview ?? 'confirmed', highRisk: cat.risk === 'high' });
    }
  }
  for (const x of s.sellers) if (x.identity.faceMatch === 'passed') items.push({ key: `${x.id}:id`, kind: 'identity', userId: x.id, who: x.name, account: `${x.businessName} (seller)`, detail: `NIN •••• ${x.identity.ninLast4 ?? '—'} · face ${Math.round((x.identity.faceMatchScore ?? 0) * 100)}%`, at: x.identity.verifiedAt, review: x.identity.postReview ?? 'confirmed', highRisk: false });

  const list = items.filter((i) => i.review === tab).sort((a, b) => Number(b.highRisk) - Number(a.highRisk) || (a.at ?? '').localeCompare(b.at ?? ''));
  const count = (r: PostReview) => items.filter((i) => i.review === r).length;

  const decide = (i: Item, review: PostReview, reason = '') =>
    i.kind === 'identity'
      ? runOp('identity.review', { userId: i.userId, workerId: i.workerId, review, reason })
      : runOp('skill.review', { artisanId: i.userId, workerId: i.workerId, categoryId: i.categoryId, review, reason });

  return (
    <>
      <div className="notice small">
        Identity and skill checks pass <b style={{ display: 'inline' }}>instantly</b> in the app (NIN with matching name, one NIN per account, random-movement liveness, face match, live in-app skill video with face match). People can work straight away. This is the audit that follows: confirm, or revoke and they’re emailed the reason.
      </div>
      <Panel pad={false} title={<Tabs value={tab} onChange={setTab} options={[{ value: 'pending', label: `To audit (${count('pending')})` }, { value: 'revoked', label: `Revoked (${count('revoked')})` }, { value: 'confirmed', label: `Confirmed (${count('confirmed')})` }]} />}>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Check</th>
                <th>Passed</th>
                <th style={{ textAlign: 'right' }}>Decision</th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.key}>
                  <td>
                    <div className="cellname">{i.who}</div>
                    {i.account !== i.who ? <div className="tiny muted">{i.account}</div> : null}
                  </td>
                  <td>
                    <div className="row">
                      <Badge tone="info">{i.kind === 'identity' ? 'Identity' : 'Skill'}</Badge>
                      {i.highRisk ? <Badge tone="warn">High-risk trade</Badge> : null}
                    </div>
                    <div className="small muted" style={{ marginTop: 4 }}>
                      {i.detail}
                    </div>
                  </td>
                  <td className="small muted">{when(i.at)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Gate perm="verify.decide">
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        {tab !== 'confirmed' ? (
                          <Btn sm kind="good" onClick={() => done(decide(i, 'confirmed'), 'Confirmed')}>
                            Confirm
                          </Btn>
                        ) : null}
                        {tab !== 'revoked' ? (
                          <Btn sm kind="danger" onClick={() => setRevoke(i)}>
                            Revoke
                          </Btn>
                        ) : null}
                      </div>
                    </Gate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length ? <Empty>{tab === 'pending' ? 'Nothing to audit. New verifications show up here.' : 'Nothing here.'}</Empty> : null}
        </div>
      </Panel>
      {revoke ? (
        <ReasonModal
          title={`Revoke ${revoke.kind === 'identity' ? 'identity' : category(revoke.categoryId!).name} for ${revoke.who}?`}
          body={revoke.kind === 'identity' ? 'They go offline and can’t take jobs or sell until it’s resolved. They’re emailed this reason.' : 'They can’t take jobs in this trade until they record a new video. They’re emailed this reason.'}
          confirm="Revoke"
          danger
          onCancel={() => setRevoke(null)}
          onConfirm={(reason) => {
            const r = done(decide(revoke, 'revoked', reason), 'Revoked and emailed');
            if (r.ok) setRevoke(null);
            return r;
          }}
        />
      ) : null}
    </>
  );
}
