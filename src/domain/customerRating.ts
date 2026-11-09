import type { CustomerStats } from './types';

/** Two-way reviews: artisans rate customers on professionalism, clarity and payment behaviour. */
export function validateCustomerReview(r: { professionalism: number; clarity: number; payment: number }): string | null {
  for (const v of [r.professionalism, r.clarity, r.payment]) if (!Number.isInteger(v) || v < 1 || v > 5) return 'Rate each item from 1 to 5.';
  return null;
}

export function customerScore(s?: CustomerStats): { overall: number; professionalism: number; clarity: number; payment: number; count: number } | null {
  if (!s || !s.ratingCount) return null;
  const n = s.ratingCount;
  const professionalism = s.professionalismSum / n;
  const clarity = s.claritySum / n;
  const payment = s.paymentSum / n;
  return { overall: Math.round(((professionalism + clarity + payment) / 3) * 10) / 10, professionalism, clarity, payment, count: n };
}

export function customerBadge(s?: CustomerStats): string | null {
  const sc = customerScore(s);
  if (!sc || sc.count < 3) return null;
  if (sc.overall >= 4.6) return 'Great customer';
  if (sc.payment >= 4.5) return 'Approves promptly';
  return null;
}
