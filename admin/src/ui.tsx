import React from 'react';
import { useConsole } from './console';
import { can, type Perm } from './rbac';
import type { R } from './ops';

export function Badge({ tone = 'neutral', children }: { tone?: 'good' | 'warn' | 'bad' | 'info' | 'neutral'; children: React.ReactNode }) {
  return <span className={`badge ${tone === 'neutral' ? '' : tone}`}>{children}</span>;
}

export function Btn({ kind = 'primary', sm, block, children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'ghost' | 'danger' | 'good'; sm?: boolean; block?: boolean }) {
  return (
    <button type="button" {...p} className={`btn ${kind === 'primary' ? '' : kind} ${sm ? 'sm' : ''} ${block ? 'block' : ''} ${p.className ?? ''}`}>
      {children}
    </button>
  );
}

export function Panel({ title, right, children, pad = true }: { title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; pad?: boolean }) {
  return (
    <section className="panel">
      {title || right ? (
        <div className="panel-h">
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {right}
        </div>
      ) : null}
      {pad ? <div className="panel-b">{children}</div> : children}
    </section>
  );
}

export function Kpi({ label, value, sub, alert }: { label: string; value: React.ReactNode; sub?: string; alert?: boolean }) {
  return (
    <div className={`kpi ${alert ? 'alert' : ''}`}>
      <span className="label">{label}</span>
      <span className="v">{value}</span>
      {sub ? <span className="sub">{sub}</span> : null}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={`tab ${value === o.value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Drawer({ title, sub, onClose, children }: { title: React.ReactNode; sub?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-h">
          <div>
            <h2>{title}</h2>
            {sub ? <div className="small muted">{sub}</div> : null}
          </div>
          <Btn kind="ghost" sm onClick={onClose} aria-label="Close">
            Close
          </Btn>
        </div>
        <div className="drawer-b">{children}</div>
      </aside>
    </>
  );
}

export function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/** Asks for a reason (required) before a sensitive action. */
export function ReasonModal({ title, body, confirm, danger, onCancel, onConfirm, extra }: { title: string; body?: string; confirm: string; danger?: boolean; onCancel: () => void; onConfirm: (reason: string) => R | void; extra?: React.ReactNode }) {
  const [reason, setReason] = React.useState('');
  const [err, setErr] = React.useState<string | null>(null);
  return (
    <>
      <div className="scrim modal-scrim" onClick={onCancel} />
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{title}</h2>
        {body ? <p className="small muted" style={{ margin: 0 }}>{body}</p> : null}
        {extra}
        <div className="field">
          <label htmlFor="reason">Reason (goes in the audit log)</label>
          <textarea id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </div>
        {err ? <div className="err">{err}</div> : null}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Btn kind="ghost" onClick={onCancel}>
            Cancel
          </Btn>
          <Btn
            kind={danger ? 'danger' : 'primary'}
            onClick={() => {
              if (reason.trim().length < 5) return setErr('Give a reason (at least 5 characters).');
              const r = onConfirm(reason.trim());
              if (r && !r.ok) setErr(r.error);
            }}
          >
            {confirm}
          </Btn>
        </div>
      </div>
    </>
  );
}

/** Renders children only when the signed-in admin has the permission; otherwise a quiet note. */
export function Gate({ perm, children, quiet }: { perm: Perm; children: React.ReactNode; quiet?: boolean }) {
  const role = useRole();
  if (can(role, perm)) return <>{children}</>;
  return quiet ? null : (
    <span className="locked" title={`Needs ${perm}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
      Your role can’t do this
    </span>
  );
}

export function useRole() {
  return useConsole((s) => s.admins.find((a) => a.id === s.session?.adminId)?.role);
}

const toastListeners = new Set<(t: { text: string; bad?: boolean } | null) => void>();
export function toast(text: string, bad = false) {
  toastListeners.forEach((l) => l({ text, bad }));
  setTimeout(() => toastListeners.forEach((l) => l(null)), 2600);
}
export function Toaster() {
  const [t, setT] = React.useState<{ text: string; bad?: boolean } | null>(null);
  React.useEffect(() => {
    toastListeners.add(setT);
    return () => {
      toastListeners.delete(setT);
    };
  }, []);
  return t ? <div className={`toast ${t.bad ? 'bad' : ''}`} role="status">{t.text}</div> : null;
}

/** Runs an op and shows the outcome. */
export function done(r: R, ok: string) {
  if (r.ok) toast(r.note ?? ok);
  else toast(r.error, true);
  return r;
}

export const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';
