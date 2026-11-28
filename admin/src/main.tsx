import React from 'react';
import { createRoot } from 'react-dom/client';
import { setAdminActor, useStore } from '../../src/store';
import { currentAdmin, useConsole, writeAudit } from './console';
import { Login, Mark } from './Login';
import { Disputes } from './pages/Disputes';
import { Finance } from './pages/Finance';
import { Jobs } from './pages/Jobs';
import { Overview } from './pages/Overview';
import { People } from './pages/People';
import { Safety, Screening } from './pages/Safety';
import { Services } from './pages/Services';
import { Support } from './pages/Support';
import { Audit, Integrations, Settings, Team, TradeFees } from './pages/System';
import { Verification } from './pages/Verification';
import { can, IDLE_MINUTES, type Perm, ROLES, SESSION_HOURS } from './rbac';
import { Btn, Toaster } from './ui';

interface Page {
  key: string;
  label: string;
  perm: Perm;
  el: (go: (k: string) => void) => React.ReactNode;
  count?: () => number;
  hot?: boolean;
}

const S = () => useStore.getState();
const PAGES: Page[] = [
  { key: 'overview', label: 'Overview', perm: 'overview.view', el: (go) => <Overview go={go} /> },
  { key: 'jobs', label: 'Jobs', perm: 'jobs.view', el: () => <Jobs />, count: () => S().jobs.filter((j) => ['funded', 'in_progress', 'proof_submitted', 'disputed'].includes(j.status)).length },
  { key: 'people', label: 'People', perm: 'users.view', el: () => <People /> },
  {
    key: 'verification',
    label: 'Verification audit',
    perm: 'verify.view',
    el: () => <Verification />,
    hot: true,
    count: () => S().artisans.reduce((t, a) => t + (a.identity.postReview === 'pending' ? 1 : 0) + [...a.skills, ...a.workers.flatMap((w) => [w.identity as { postReview?: string }, ...w.skills])].filter((k) => k.postReview === 'pending').length, 0) + S().sellers.filter((x) => x.identity.postReview === 'pending').length,
  },
  { key: 'services', label: 'Sleek Services', perm: 'services.view', el: () => <Services />, count: () => S().orders.filter((o) => o.status === 'placed' || o.status === 'confirmed' || o.status === 'dispatched').length },
  { key: 'disputes', label: 'Disputes & claims', perm: 'disputes.view', el: () => <Disputes />, hot: true, count: () => S().disputes.filter((d) => d.status !== 'resolved').length + S().guaranteeClaims.filter((c) => c.status === 'submitted').length },
  { key: 'support', label: 'Support inbox', perm: 'support.view', el: () => <Support />, hot: true, count: () => S().tickets.filter((t) => t.status === 'open').length },
  { key: 'safety', label: 'Safety alerts', perm: 'safety.view', el: () => <Safety />, hot: true, count: () => S().safetyAlerts.filter((a) => a.status === 'open' && a.kind !== 'shared_with_contact').length },
  { key: 'screening', label: 'Blocked messages', perm: 'screening.review', el: () => <Screening />, count: () => S().violations.filter((v) => !v.reviewed).length },
  { key: 'finance', label: 'Finance', perm: 'finance.view', el: () => <Finance />, hot: true, count: () => useConsole.getState().approvals.filter((a) => a.status === 'pending').length },
  { key: 'integrations', label: 'Providers', perm: 'integrations.view', el: () => <Integrations /> },
  { key: 'settings', label: 'Settings', perm: 'config.view', el: () => <Settings /> },
  { key: 'fees', label: 'Trades & fees', perm: 'config.view', el: () => <TradeFees /> },
  { key: 'team', label: 'Staff & roles', perm: 'admins.manage', el: () => <Team /> },
  { key: 'audit', label: 'Audit log', perm: 'audit.view', el: () => <Audit /> },
];

const SUBTITLE: Record<string, string> = {
  overview: 'What’s happening on Sleek right now',
  jobs: 'Every booking, its Sleek Hold and its chat',
  people: 'Customers, artisans, teams, agencies and sellers',
  verification: 'Audit instant identity and skill checks',
  services: 'Orders, Sleek riders and seller listings',
  disputes: 'Decide disputes and Sleek Protection claims',
  support: 'Conversations from the in-app help desk',
  safety: 'SOS and safety reports, 24/7',
  screening: 'Attempts to share numbers, emails or move off Sleek',
  finance: 'Sleek Hold, revenue, refunds and approvals',
  integrations: 'Payments, identity, SMS, email, maps, storage, photo checks',
  settings: 'Commission, release timers, protection, limits',
  fees: 'The 100 trades and the upfront fee type for each',
  team: 'Staff accounts, roles and sign-in locks',
  audit: 'Every staff action. Reversible ones can be undone',
};

function readHash() {
  try {
    return window.location.hash.replace('#', '') || 'overview';
  } catch {
    return 'overview';
  }
}

function Shell() {
  const me = useConsole((c) => c.admins.find((a) => a.id === c.session?.adminId))!;
  useStore();
  useConsole((c) => c.approvals);
  const allowed = PAGES.filter((p) => can(me.role, p.perm));
  const [page, setPage] = React.useState(() => readHash());
  const cur = allowed.find((p) => p.key === page) ?? allowed[0];
  const go = (k: string) => {
    setPage(k);
    try {
      window.location.hash = k;
    } catch {
      // ignore
    }
  };
  React.useEffect(() => {
    const h = () => setPage(readHash());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const signOut = (why: string) => {
    writeAudit({ actorId: me.id, actorName: me.name, actorRole: me.role, op: 'logout', summary: why });
    setAdminActor(null);
    useConsole.setState({ session: null });
  };

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <Mark />
          <div>
            <div className="brand-name">Sleek Admin</div>
            <div className="brand-sub">{ROLES[me.role].label}</div>
          </div>
        </div>
        {allowed.map((p) => {
          const n = p.count?.() ?? 0;
          return (
            <button key={p.key} className={`nav ${cur?.key === p.key ? 'on' : ''}`} onClick={() => go(p.key)}>
              {p.label}
              {n ? <span className={`count ${p.hot ? 'hot' : ''}`}>{n}</span> : null}
            </button>
          );
        })}
        <div className="side-foot">
          <span>
            Signed in as <b>{me.name}</b>
          </span>
          <span>Session ends after {IDLE_MINUTES} min idle</span>
          <button className="nav" style={{ padding: '6px 0' }} onClick={() => signOut('Signed out')}>
            Sign out
          </button>
        </div>
      </aside>
      <div style={{ minWidth: 0 }}>
        <div className="mobile-nav">
          <Mark />
          <select value={cur?.key} onChange={(e) => go(e.target.value)} aria-label="Section">
            {allowed.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
                {p.count?.() ? ` (${p.count()})` : ''}
              </option>
            ))}
          </select>
          <button className="btn sm ghost" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.3)' }} onClick={() => signOut('Signed out')}>
            Sign out
          </button>
        </div>
        <main className="main">
          <div className="topbar">
            <div>
              <h1>{cur?.label}</h1>
              <p className="small muted">{cur ? SUBTITLE[cur.key] : ''}</p>
            </div>
            <span className="small muted">Demo data lives in this browser</span>
          </div>
          {cur ? cur.el(go) : <p>Your role has no sections.</p>}
        </main>
      </div>
    </div>
  );
}

function App() {
  const hydrated = useConsole((c) => c.hydrated);
  const session = useConsole((c) => c.session);
  const me = useConsole((c) => c.admins.find((a) => a.id === c.session?.adminId));
  const [, force] = React.useState(0);

  // Session rules: idle timeout, absolute lifetime, disabled accounts.
  React.useEffect(() => {
    if (!session) return;
    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    const evs = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => {
      const s = useConsole.getState().session;
      if (!s) return;
      const admin = currentAdmin();
      const why = !admin || admin.disabled ? 'Signed out: account disabled' : Date.now() - s.startedAt > SESSION_HOURS * 3_600_000 ? 'Signed out: 8-hour session limit' : Date.now() - last > IDLE_MINUTES * 60_000 ? 'Signed out: idle for 15 minutes' : null;
      if (why) {
        if (admin) writeAudit({ actorId: admin.id, actorName: admin.name, actorRole: admin.role, op: 'logout', summary: why });
        setAdminActor(null);
        useConsole.setState({ session: null });
      } else if (Date.now() - s.lastActiveAt > 60_000) useConsole.setState({ session: { ...s, lastActiveAt: last } });
    }, 15_000);
    return () => {
      clearInterval(t);
      evs.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [session?.adminId]);

  // Keep app-side checks (store actions) tied to the signed-in staff member.
  React.useEffect(() => {
    setAdminActor(me && !me.disabled ? { id: me.id, name: me.name, role: me.role } : null);
    force((x) => x + 1);
  }, [me?.id, me?.role, me?.disabled]);

  // Orders move along on their own (rider tracking) while the console is open.
  React.useEffect(() => {
    const t = setInterval(() => useStore.getState().tick(), 10_000);
    return () => clearInterval(t);
  }, []);

  if (!hydrated) return null;
  const valid = session && me && !me.disabled && Date.now() - session.startedAt < SESSION_HOURS * 3_600_000 && Date.now() - session.lastActiveAt < IDLE_MINUTES * 60_000 + 60_000;
  return (
    <>
      {valid ? <Shell /> : <Login />}
      <Toaster />
    </>
  );
}

void Btn;
createRoot(document.getElementById('root')!).render(<App />);
