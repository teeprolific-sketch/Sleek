import React from 'react';
import { cid, sha256, useConsole, writeAudit } from './console';
import { LOCKOUT_MINUTES, MAX_LOGIN_FAILURES, ROLES, type AdminUser } from './rbac';
import { Btn } from './ui';

type Stage = 'password' | 'pin' | 'code';

export function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 120 120" fill="#fff">
        <circle cx="30" cy="14" r="12" />
        <circle cx="90" cy="14" r="12" />
        <path d="M29 35 Q60 47 91 35 L113 54 L113 85 L86 110 L64.5 95 L93 72 L76 57 L44 57 L27 72 L55.5 95 L34 110 L7 85 L7 54 Z" />
      </svg>
    </span>
  );
}

/**
 * Three-step staff sign-in: password, personal 6-digit security PIN, then a one-time
 * code sent to the staff member's registered device. Five wrong attempts lock the
 * account for 15 minutes. Every attempt is written to the audit log.
 */
export function Login() {
  const [stage, setStage] = React.useState<Stage>('password');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [code, setCode] = React.useState('');
  const [sent, setSent] = React.useState<{ code: string; expires: number } | null>(null);
  const [who, setWho] = React.useState<AdminUser | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const key = email.trim().toLowerCase();
  const fail = (msg: string, u?: AdminUser) => {
    const lk = useConsole.getState().lockouts[key] ?? { failures: 0 };
    const failures = lk.failures + 1;
    const lockedUntil = failures >= MAX_LOGIN_FAILURES ? Date.now() + LOCKOUT_MINUTES * 60_000 : undefined;
    useConsole.setState((s) => ({ lockouts: { ...s.lockouts, [key]: { failures, lockedUntil } } }));
    writeAudit({ actorId: u?.id ?? 'unknown', actorName: u?.name ?? key, actorRole: u?.role ?? 'analyst', op: 'login.failed', summary: `Failed sign-in (${stage}) for ${key}` });
    setErr(lockedUntil ? `Too many attempts. This account is locked for ${LOCKOUT_MINUTES} minutes.` : `${msg} ${MAX_LOGIN_FAILURES - failures} attempt${MAX_LOGIN_FAILURES - failures === 1 ? '' : 's'} left.`);
  };
  const lockedMsg = () => {
    const lk = useConsole.getState().lockouts[key];
    if (lk?.lockedUntil && lk.lockedUntil > Date.now()) return `This account is locked after too many attempts. Try again in ${Math.ceil((lk.lockedUntil - Date.now()) / 60_000)} min, or ask a Super Admin to unlock it.`;
    return null;
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const l = lockedMsg();
    if (l) return setErr(l);
    setBusy(true);
    try {
      const u = useConsole.getState().admins.find((a) => a.email === key);
      const h = await sha256(`${key}:${password}`);
      if (!u || u.passwordHash !== h) return fail('Email or password is not correct.', u);
      if (u.disabled) return setErr('This staff account is disabled. Ask a Super Admin.');
      setWho(u);
      setStage('pin');
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const l = lockedMsg();
    if (l) return setErr(l);
    if (!who) return;
    const h = await sha256(`${key}:pin:${pin}`);
    if (h !== who.pinHash) return fail('That security PIN is not correct.', who);
    const c = String(100000 + Math.floor(Math.random() * 900000));
    setSent({ code: c, expires: Date.now() + 5 * 60_000 });
    setStage('code');
  };

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!who || !sent) return;
    if (Date.now() > sent.expires) return setErr('That code expired. Go back and request a new one.');
    if (code.trim() !== sent.code) return fail('That code is not correct.', who);
    const now = Date.now();
    useConsole.setState((s) => ({
      session: { adminId: who.id, startedAt: now, lastActiveAt: now },
      lockouts: { ...s.lockouts, [key]: { failures: 0 } },
      admins: s.admins.map((a) => (a.id === who.id ? { ...a, lastLoginAt: new Date(now).toISOString() } : a)),
    }));
    writeAudit({ actorId: who.id, actorName: who.name, actorRole: who.role, op: 'login.success', summary: `Signed in (${ROLES[who.role].label})` });
    void cid;
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand">
          <Mark />
          <div>
            <div className="brand-name">Sleek Admin</div>
            <div className="tiny muted">STAFF ONLY · ACCESS IS LOGGED</div>
          </div>
        </div>
        <div className="steps" aria-hidden="true">
          <span className="on" />
          <span className={stage !== 'password' ? 'on' : ''} />
          <span className={stage === 'code' ? 'on' : ''} />
        </div>

        {stage === 'password' ? (
          <form className="stack" onSubmit={submitPassword}>
            <h1>Sign in</h1>
            <div className="field">
              <label htmlFor="email">Work email</label>
              <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@sleek.demo" />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {err ? <div className="err">{err}</div> : null}
            <Btn block type="submit" disabled={busy || !email || !password}>
              Continue
            </Btn>
          </form>
        ) : stage === 'pin' ? (
          <form className="stack" onSubmit={submitPin}>
            <h1>Security PIN</h1>
            <p className="small muted" style={{ margin: 0 }}>
              Hi {who?.name.split(' ')[0]}. Enter your personal 6-digit staff PIN.
            </p>
            <input id="pin" className="input code-input" inputMode="numeric" type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoFocus aria-label="Security PIN" />
            {err ? <div className="err">{err}</div> : null}
            <Btn block type="submit" disabled={pin.length !== 6}>
              Verify PIN
            </Btn>
          </form>
        ) : (
          <form className="stack" onSubmit={submitCode}>
            <h1>One-time code</h1>
            <p className="small muted" style={{ margin: 0 }}>
              We sent a 6-digit code to the phone registered to {who?.email}. It expires in 5 minutes.
            </p>
            <div className="notice">
              <b>Demo: simulated SMS</b>
              Sleek Admin sign-in code: <span className="tnum">{sent?.code}</span>
            </div>
            <input id="code" className="input code-input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus aria-label="One-time code" />
            {err ? <div className="err">{err}</div> : null}
            <Btn block type="submit" disabled={code.length !== 6}>
              Sign in
            </Btn>
          </form>
        )}
        <p className="tiny muted" style={{ margin: 0 }}>
          This console is separate from the Sleek app. Sessions end after 15 minutes without activity and after 8 hours in total.
        </p>
      </div>
    </div>
  );
}
