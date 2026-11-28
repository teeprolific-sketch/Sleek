import type { Artisan, Customer, Seller } from './types';

/**
 * What must be done before an account can be used. Professional accounts
 * (artisan, team, agency, seller) go through every check before their
 * dashboard opens. Customers do a simple check.
 */
export interface Step {
  key: 'contact' | 'identity' | 'guarantor' | 'business' | 'skills' | 'policies';
  label: string;
  done: boolean;
  optional?: boolean;
  note?: string;
}

export function artisanSteps(a: Artisan): Step[] {
  const team = a.accountType !== 'individual';
  const skillOk = a.skills.some((k) => k.status === 'approved') || a.workers.some((w) => w.identity.faceMatch === 'passed' && w.skills.some((k) => k.status === 'approved'));
  const steps: Step[] = [
    { key: 'contact', label: 'Phone and email confirmed', done: a.phoneVerified !== false && a.emailVerified !== false && !!a.email },
    { key: 'identity', label: 'NIN, liveness and face match', done: a.identity.faceMatch === 'passed' },
    { key: 'guarantor', label: 'Guarantor confirmed', done: a.guarantor?.status === 'confirmed' },
  ];
  if (team) steps.push({ key: 'business', label: 'CAC business registration', done: !!a.business?.completedOnboarding, note: a.business?.cacPending ? 'Not registered yet: flagged for review' : undefined });
  steps.push({ key: 'skills', label: team ? 'At least one verified worker and skill video' : 'Skill video recorded live and verified', done: skillOk });
  return steps;
}

export function sellerSteps(x: Seller): Step[] {
  return [
    { key: 'contact', label: 'Phone and email confirmed', done: x.phoneVerified !== false && x.emailVerified !== false && !!x.email },
    { key: 'identity', label: 'NIN, liveness and face match', done: x.identity.faceMatch === 'passed' },
    { key: 'guarantor', label: 'Guarantor confirmed', done: x.guarantor?.status === 'confirmed' },
    { key: 'business', label: 'CAC business registration', done: !!x.cacNumber || !!x.cacPending, note: x.cacPending ? 'Not registered yet: flagged for review' : undefined },
  ];
}

export function customerSteps(c: Customer): Step[] {
  return [
    { key: 'contact', label: 'Phone number confirmed', done: c.phoneVerified !== false },
    { key: 'identity', label: 'NIN check (name must match)', done: c.identity?.nin === 'passed' },
  ];
}

export const allDone = (steps: Step[]) => steps.every((s) => s.done || s.optional);

/** Seeded and older accounts that were already verified count as active. */
export function isActive(u: Artisan | Seller | Customer): boolean {
  if (u.role === 'customer') return allDone(customerSteps(u));
  return !!u.activatedAt;
}
