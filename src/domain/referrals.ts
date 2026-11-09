/** Referral programme: both customers and artisans can refer. */
export const REFERRAL_REWARD = { customer: 1000, artisan: 2000 } as const;
/** When a referral counts: customers after their first completed escrow job, artisans after 3. */
export const QUALIFY_AFTER_JOBS = { customer: 1, artisan: 3 } as const;

export function makeReferralCode(name: string, id: string): string {
  const base = name.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 5) || 'SLEEK';
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${base}${(h % 9000) + 1000}`;
}

export function isValidReferralCode(code: string): boolean {
  return /^[A-Z]{1,5}\d{4}$/.test(code.trim().toUpperCase());
}

export function referralQualifies(role: 'customer' | 'artisan', completedJobs: number): boolean {
  return completedJobs >= QUALIFY_AFTER_JOBS[role];
}
