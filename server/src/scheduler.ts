import type { Deps } from './context';
import { autoSuspendRepeatOffenders } from './services/admin';
import { expireRequests } from './services/agent';
import { expireUnpaid, runAutoRelease } from './services/jobs';

const LOCK_KEY = 7_331_001; // pg advisory lock: only one instance runs the sweep at a time

/** One sweep of all time-based rules. Safe to run on many instances concurrently. */
export async function sweep(deps: Deps) {
  const c = await deps.db.pool.connect();
  try {
    const { rows } = await c.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_KEY]);
    if (!rows[0].ok) return { skipped: true };
    try {
      const released = await runAutoRelease(deps);
      const expired = await expireUnpaid(deps);
      await expireRequests(deps);
      const suspended = await autoSuspendRepeatOffenders(deps);
      return { released, expired, suspended };
    } finally {
      await c.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  } finally {
    c.release();
  }
}

export function startScheduler(deps: Deps, everyMs = 60_000) {
  const t = setInterval(() => sweep(deps).catch((e) => console.error('[scheduler]', e)), everyMs);
  t.unref();
  return () => clearInterval(t);
}
