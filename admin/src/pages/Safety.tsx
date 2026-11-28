import React from 'react';
import { useStore } from '../../../src/store';
import { runOp } from '../ops';
import { Badge, Btn, done, Empty, Gate, Panel, when } from '../ui';

const name = (s: ReturnType<typeof useStore.getState>, id: string) => s.customers.find((c) => c.id === id)?.name ?? s.artisans.find((a) => a.id === id)?.businessName ?? s.artisans.find((a) => a.id === id)?.name ?? id;

export function Safety() {
  const s = useStore();
  const alerts = s.safetyAlerts.filter((a) => a.kind !== 'shared_with_contact');
  return (
    <Panel pad={false} title="Safety alerts" right={<span className="small muted">SOS and “I feel unsafe” reports from the app, 24/7</span>}>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>From</th>
              <th>Report</th>
              <th>Received</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="cellname">{name(s, a.userId)}</div>
                  <div className="tiny muted">
                    {a.role}
                    {a.jobId ? ` · job ${a.jobId.slice(-6).toUpperCase()}` : ''}
                  </div>
                </td>
                <td className="small">
                  <Badge tone={a.kind === 'sos' ? 'bad' : 'warn'}>{a.kind === 'sos' ? 'SOS' : a.kind.replace(/_/g, ' ')}</Badge> {a.note}
                </td>
                <td className="small muted">{when(a.at)}</td>
                <td>
                  <Badge tone={a.status === 'resolved' ? 'good' : a.status === 'acknowledged' ? 'info' : 'bad'}>{a.status}</Badge>
                </td>
                <td>
                  <Gate perm="safety.manage" quiet>
                    <div className="row">
                      {a.status === 'open' ? (
                        <Btn sm onClick={() => done(runOp('safety.status', { alertId: a.id, status: 'acknowledged' }), 'Acknowledged. The user was told.')}>
                          Acknowledge
                        </Btn>
                      ) : null}
                      {a.status !== 'resolved' ? (
                        <Btn sm kind="ghost" onClick={() => done(runOp('safety.status', { alertId: a.id, status: 'resolved' }), 'Resolved')}>
                          Resolve
                        </Btn>
                      ) : null}
                    </div>
                  </Gate>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!alerts.length ? <Empty>No safety alerts.</Empty> : null}
      </div>
    </Panel>
  );
}

export function Screening() {
  const s = useStore();
  const strikes = s.platformConfig?.offAppStrikesToSuspend ?? 5;
  return (
    <Panel pad={false} title="Blocked contact sharing" right={<span className="small muted">Auto-suspension after {strikes} attempts in 30 days</span>}>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Who</th>
              <th>What was blocked</th>
              <th>Type</th>
              <th>When</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {s.violations.map((v) => {
              const n = s.violations.filter((x) => x.userId === v.userId).length;
              return (
                <tr key={v.id}>
                  <td>
                    <div className="cellname">{name(s, v.userId)}</div>
                    <div className="tiny muted">
                      {v.role} · {n} attempt{n === 1 ? '' : 's'}
                    </div>
                  </td>
                  <td className="small">“{v.excerpt}”</td>
                  <td>
                    {v.types.map((t) => (
                      <Badge key={t} tone="bad">
                        {t.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </td>
                  <td className="small muted">{when(v.at)}</td>
                  <td>
                    <Gate perm="screening.review" quiet>
                      {v.reviewed ? (
                        <Badge tone="good">Reviewed</Badge>
                      ) : (
                        <Btn sm kind="ghost" onClick={() => done(runOp('screening.reviewed', { violationId: v.id, reviewed: true }), 'Block confirmed')}>
                          Confirm block
                        </Btn>
                      )}
                    </Gate>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!s.violations.length ? <Empty>No blocked messages.</Empty> : null}
      </div>
    </Panel>
  );
}
