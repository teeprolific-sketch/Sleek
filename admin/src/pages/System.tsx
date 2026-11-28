import React from 'react';
import { PROVIDERS } from '../../../src/services/providers';
import { CATEGORIES, DEFAULT_FEE_AMOUNT, defaultFeeType } from '../../../src/data/categories';
import type { FeeType } from '../../../src/domain/types';
import { DEFAULT_CONFIG, useStore } from '../../../src/store';
import { naira } from '../../../src/utils/format';
import { useConsole } from '../console';
import { runOp, undoEntry } from '../ops';
import { can, ROLES, type RoleKey } from '../rbac';
import { Badge, Btn, done, Empty, Gate, Panel, useRole, when } from '../ui';

export function Integrations() {
  const log = useStore((s) => s.providerLog);
  const logProvider = useStore((s) => s.logProvider);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="notice small">These providers are <b style={{ display: 'inline' }}>simulated</b> in the demo. No real accounts, money or messages. In production each one runs on the Sleek server with keys only the server holds.</div>
      <div className="grid kpis">
        {PROVIDERS.map((p) => {
          const last = log.find((e) => e.provider === p.key);
          return (
            <div key={p.key} className="kpi">
              <div className="row spread">
                <span className="label">{p.key}</span>
                <Badge tone="info">Sandbox</Badge>
              </div>
              <span className="v" style={{ fontSize: 17 }}>
                {p.name}
              </span>
              <span className="sub">{p.purpose}</span>
              <span className="tiny muted">Last call: {last ? when(last.at) : 'none yet'}</span>
              <Btn sm kind="ghost" onClick={() => logProvider(p.key, 'health_check', `${p.name}: health check OK (sandbox, 142 ms)`)}>
                Run health check
              </Btn>
            </div>
          );
        })}
      </div>
      <Panel pad={false} title="Provider activity" right={<span className="small muted">Every simulated call made by the app</span>}>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Provider</th>
                <th>What happened</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {log.slice(0, 80).map((e) => (
                <tr key={e.id}>
                  <td className="small muted">{when(e.at)}</td>
                  <td className="small">{e.provider}</td>
                  <td className="small">{e.summary}</td>
                  <td>{e.ok ? <Badge tone="good">OK</Badge> : <Badge tone="bad">Failed</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!log.length ? <Empty>No calls yet. Use the app (sign in, verify, pay, order) and they appear here.</Empty> : null}
        </div>
      </Panel>
    </div>
  );
}

export function Settings() {
  const cfg = useStore((s) => s.platformConfig) ?? DEFAULT_CONFIG;
  const role = useRole();
  const edit = can(role, 'config.edit');
  const [d, setD] = React.useState({ commission: String(Math.round(cfg.commissionRate * 100)), strikes: String(cfg.offAppStrikesToSuspend), short: String(cfg.autoReleaseHours.short), normal: String(cfg.autoReleaseHours.normal), large: String(cfg.autoReleaseHours.large), days: String(cfg.protectionDays), cap: String(cfg.protectionCap), delivery: String(cfg.deliveryFee) });
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value.replace(/[^\d]/g, '') });
  const save = () =>
    done(
      runOp('config.set', {
        patch: {
          commissionRate: Number(d.commission) / 100,
          offAppStrikesToSuspend: Number(d.strikes),
          autoReleaseHours: { short: Number(d.short), normal: Number(d.normal), large: Number(d.large) },
          protectionDays: Number(d.days),
          protectionCap: Number(d.cap),
          deliveryFee: Number(d.delivery),
        },
      }),
      'Settings saved. You can undo this from the audit log.',
    );
  const F = ({ id, label, suffix }: { id: keyof typeof d; label: string; suffix: string }) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input id={id} className="input tnum" value={d[id]} onChange={set(id)} disabled={!edit} inputMode="numeric" />
        <span className="small muted" style={{ whiteSpace: 'nowrap' }}>
          {suffix}
        </span>
      </div>
    </div>
  );
  return (
    <Panel title="Platform settings" right={edit ? <Btn onClick={save}>Save changes</Btn> : <Badge>Read-only for your role</Badge>}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {F({ id: 'commission', label: 'Sleek commission', suffix: "% of each job" })}
        {F({ id: 'delivery', label: 'Sleek Services delivery fee', suffix: "₦ per order" })}
        {F({ id: 'short', label: 'Auto-release: short jobs', suffix: "hours" })}
        {F({ id: 'normal', label: 'Auto-release: normal jobs', suffix: "hours" })}
        {F({ id: 'large', label: 'Auto-release: large jobs', suffix: "hours" })}
        {F({ id: 'days', label: 'Sleek Protection window', suffix: "days" })}
        {F({ id: 'cap', label: 'Sleek Protection cap', suffix: `₦ (now ${naira(cfg.protectionCap)})` })}
        {F({ id: 'strikes', label: 'Auto-suspend after', suffix: "off-app attempts in 30 days" })}
      </div>
    </Panel>
  );
}

export function TradeFees() {
  const cfg = useStore((s) => s.platformConfig) ?? DEFAULT_CONFIG;
  const role = useRole();
  const edit = can(role, 'config.edit');
  const [q, setQ] = React.useState('');
  const list = CATEGORIES.filter((c) => !q || `${c.name} ${c.group}`.toLowerCase().includes(q.toLowerCase()));
  const set = (id: string, type: FeeType) => done(runOp('config.set', { patch: { tradeFeeTypes: { ...(cfg.tradeFeeTypes ?? {}), [id]: type } } }), `${CATEGORIES.find((c) => c.id === id)?.name}: ${type} fee`);
  return (
    <Panel pad={false} title={`Upfront fee type per trade (${CATEGORIES.length} trades)`} right={<input className="input" style={{ maxWidth: 220 }} placeholder="Search trades" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search trades" />}>
      <div className="small muted" style={{ padding: '10px 16px' }}>Sleek’s suggested fee for each trade. Artisans can still choose their own type and amount; Sleek keeps {Math.round(cfg.commissionRate * 100)}% of every fee.</div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Trade</th>
              <th>Group</th>
              <th>Fee type</th>
              <th style={{ textAlign: 'right' }}>Default amount</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => {
              const t = cfg.tradeFeeTypes?.[c.id] ?? defaultFeeType(c.id);
              return (
                <tr key={c.id}>
                  <td className="cellname">{c.name}</td>
                  <td className="small muted">{c.group}</td>
                  <td>
                    {edit ? (
                      <select className="input" style={{ minHeight: 32, padding: '4px 8px', maxWidth: 170 }} value={t} onChange={(e) => set(c.id, e.target.value as FeeType)} aria-label={`Fee type for ${c.name}`}>
                        <option value="booking">Booking fee</option>
                        <option value="consultancy">Consultancy fee</option>
                        <option value="inspection">Inspection fee</option>
                      </select>
                    ) : (
                      <Badge>{t}</Badge>
                    )}
                  </td>
                  <td className="tnum" style={{ textAlign: 'right' }}>
                    {naira(DEFAULT_FEE_AMOUNT[t])}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function Team() {
  const admins = useConsole((c) => c.admins);
  const lockouts = useConsole((c) => c.lockouts);
  const me = useConsole((c) => c.session?.adminId);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Panel pad={false} title="Staff accounts" right={<span className="small muted">Only Super Admins can change roles</span>}>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Last sign-in</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => {
                const lk = lockouts[a.email];
                const locked = !!(lk?.lockedUntil && lk.lockedUntil > Date.now());
                return (
                  <tr key={a.id}>
                    <td>
                      <div className="cellname">
                        {a.name}
                        {a.id === me ? ' (you)' : ''}
                      </div>
                      <div className="tiny muted">{a.email}</div>
                    </td>
                    <td>
                      <Gate perm="admins.manage" quiet>
                        <select className="input" style={{ minHeight: 32, padding: '4px 8px' }} value={a.role} disabled={a.id === me} onChange={(e) => done(runOp('admin.role', { adminId: a.id, role: e.target.value as RoleKey }), 'Role changed')} aria-label={`Role for ${a.name}`}>
                          {(Object.keys(ROLES) as RoleKey[]).map((r) => (
                            <option key={r} value={r}>
                              {ROLES[r].label}
                            </option>
                          ))}
                        </select>
                      </Gate>
                    </td>
                    <td className="small muted">{when(a.lastLoginAt)}</td>
                    <td>{a.disabled ? <Badge tone="bad">Disabled</Badge> : locked ? <Badge tone="warn">Locked</Badge> : <Badge tone="good">Active</Badge>}</td>
                    <td>
                      <Gate perm="admins.manage" quiet>
                        <div className="row">
                          {locked ? (
                            <Btn sm kind="ghost" onClick={() => done(runOp('admin.unlock', { email: a.email }), 'Unlocked')}>
                              Unlock
                            </Btn>
                          ) : null}
                          {a.id !== me ? (
                            <Btn sm kind="ghost" onClick={() => done(runOp('admin.disable', { adminId: a.id, disabled: !a.disabled }), a.disabled ? 'Enabled' : 'Disabled')}>
                              {a.disabled ? 'Enable' : 'Disable'}
                            </Btn>
                          ) : null}
                        </div>
                      </Gate>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="What each role can do">
        <div className="list">
          {(Object.keys(ROLES) as RoleKey[]).map((r) => (
            <div key={r}>
              <div className="cellname">{ROLES[r].label}</div>
              <div className="small muted">{ROLES[r].summary}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function Audit() {
  const audit = useConsole((c) => c.audit);
  const role = useRole();
  const [q, setQ] = React.useState('');
  const list = audit.filter((e) => !q || `${e.summary} ${e.actorName} ${e.reason ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Panel pad={false} title="Audit log" right={<input className="input" style={{ maxWidth: 240 }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit log" />}>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>Reason</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id}>
                <td className="small muted" style={{ whiteSpace: 'nowrap' }}>
                  {when(e.at)}
                </td>
                <td className="small">
                  {e.actorName}
                  <div className="tiny muted">{ROLES[e.actorRole]?.label ?? e.actorRole}</div>
                </td>
                <td className="small">
                  {e.op === 'denied' || e.op === 'login.failed' ? <Badge tone="bad">{e.op === 'denied' ? 'Blocked' : 'Failed sign-in'}</Badge> : null} {e.summary}
                  {e.undoes ? <div className="tiny muted">Undo of an earlier action</div> : null}
                  {e.undoneAt ? <div className="tiny muted">Undone by {e.undoneBy} · {when(e.undoneAt)}</div> : null}
                </td>
                <td className="small muted">{e.reason ?? ''}</td>
                <td>
                  {e.undo && !e.undoneAt && can(role, 'audit.undo') ? (
                    <Btn sm kind="ghost" onClick={() => done(undoEntry(e.id), 'Undone')}>
                      Undo
                    </Btn>
                  ) : e.undo && !e.undoneAt ? null : !e.undo && !['denied', 'login.failed', 'login.success', 'approval.request', 'approval.decide', 'pii.reveal'].includes(e.op) ? (
                    <span className="tiny muted">Not reversible</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length ? <Empty>No entries yet. Every staff action, sign-in and blocked attempt is recorded here and can’t be deleted.</Empty> : null}
      </div>
    </Panel>
  );
}
