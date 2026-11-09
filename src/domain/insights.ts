import type { Job, LedgerEntry, Review } from './types';

/** Performance insights for an artisan (or team). */
export interface Insights {
  requests: number;
  accepted: number;
  acceptanceRate: number | null; // accepted / decided requests
  funded: number;
  completed: number;
  completionRate: number | null; // completed / funded jobs that are finished
  cancelledByArtisan: number;
  disputes: number;
  avgRating: number | null;
  ratingTrend: { month: string; avg: number | null; count: number }[];
  earningsTrend: { month: string; amount: number }[];
  tips: number;
  commissionPaid: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function lastMonths(now: number, n: number) {
  const out: { key: string; label: string }[] = [];
  const d = new Date(now);
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ key: `${m.getFullYear()}-${m.getMonth()}`, label: MONTHS[m.getMonth()] });
  }
  return out;
}
const keyOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
};

export function artisanInsights(artisanId: string, jobs: Job[], reviews: Review[], ledger: LedgerEntry[], now: number, months = 6): Insights {
  const mine = jobs.filter((j) => j.artisanId === artisanId);
  const decided = mine.filter((j) => j.status !== 'requested');
  const accepted = decided.filter((j) => j.status !== 'declined' && !!j.pricePool.locked);
  const fundedEver = mine.filter((j) => !!j.escrow.fundedAt);
  const finished = fundedEver.filter((j) => ['completed', 'resolved', 'cancelled'].includes(j.status));
  const completed = mine.filter((j) => j.status === 'completed' || (j.status === 'resolved' && (j.escrow.releasedToArtisan ?? 0) > 0));
  const myReviews = reviews.filter((r) => r.artisanId === artisanId);
  const myLedger = ledger.filter((l) => l.artisanId === artisanId);
  const ms = lastMonths(now, months);
  return {
    requests: mine.length,
    accepted: accepted.length,
    acceptanceRate: decided.length ? accepted.length / decided.length : null,
    funded: fundedEver.length,
    completed: completed.length,
    completionRate: finished.length ? completed.length / finished.length : null,
    cancelledByArtisan: mine.filter((j) => j.cancellation?.by === 'artisan').length,
    disputes: mine.filter((j) => !!j.disputeId).length,
    avgRating: myReviews.length ? myReviews.reduce((s, r) => s + r.rating, 0) / myReviews.length : null,
    ratingTrend: ms.map((m) => {
      const rs = myReviews.filter((r) => keyOf(r.at) === m.key);
      return { month: m.label, avg: rs.length ? rs.reduce((s, r) => s + r.rating, 0) / rs.length : null, count: rs.length };
    }),
    earningsTrend: ms.map((m) => ({ month: m.label, amount: myLedger.filter((l) => l.amount > 0 && l.type !== 'payout_reversal' && keyOf(l.at) === m.key).reduce((s, l) => s + l.amount, 0) })),
    tips: myLedger.filter((l) => l.type === 'tip').reduce((s, l) => s + l.amount, 0),
    commissionPaid: mine.reduce((s, j) => s + (j.escrow.commission ?? 0), 0),
  };
}
