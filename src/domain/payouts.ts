import type { PayoutSchedule } from './types';

export const MIN_PAYOUT = 1000;
export const DEFAULT_SCHEDULE: PayoutSchedule = { mode: 'manual', minimum: 5000 };

/** Amount an automatic schedule should pay out now (0 = nothing due). */
export function autoPayoutDue(s: PayoutSchedule | undefined, balance: number, now: number): number {
  if (!s || s.mode === 'manual') return 0;
  const min = Math.max(MIN_PAYOUT, s.minimum);
  if (balance < min) return 0;
  const d = new Date(now);
  const last = s.lastAutoPayoutAt ? new Date(s.lastAutoPayoutAt) : null;
  // Runs once per day after 6pm Lagos time (end of the working day).
  if (d.getHours() < 18) return 0;
  if (last && last.toDateString() === d.toDateString()) return 0;
  if (s.mode === 'weekly' && d.getDay() !== (s.weekday ?? 5)) return 0;
  return balance;
}

export function describeSchedule(s?: PayoutSchedule): string {
  const sc = s ?? DEFAULT_SCHEDULE;
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (sc.mode === 'manual') return 'Manual — withdraw whenever you want';
  if (sc.mode === 'daily') return `Daily at 6pm when balance ≥ ₦${sc.minimum.toLocaleString('en-NG')}`;
  return `Every ${days[sc.weekday ?? 5]} at 6pm when balance ≥ ₦${sc.minimum.toLocaleString('en-NG')}`;
}
