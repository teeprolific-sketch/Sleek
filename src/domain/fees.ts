import { DEFAULT_FEE_AMOUNT, defaultFeeType } from '../data/categories';
import type { Artisan, FeeSetting, FeeType, Job, JobFee } from './types';

/**
 * Upfront fees. Before an artisan engages with a job, the customer pays ONE fee:
 * a booking fee, a consultancy fee or an inspection fee.
 *
 * - Sleek sets the default type per trade (admin can change it).
 * - Each artisan can choose the type and set the amount for each of their trades,
 *   and can change it for a specific job in the chat before the customer pays.
 * - The fee waits in Sleek Hold. It is released to the artisan (minus Sleek's
 *   commission, 20% by default) once they engage: booking and consultancy fees
 *   when the artisan responds with a price, inspection fees when the inspection
 *   is done. It is refunded if the artisan declines or never responds.
 */

export const FEE_LABEL: Record<FeeType, string> = { booking: 'Booking fee', consultancy: 'Consultancy fee', inspection: 'Inspection fee' };
export const FEE_HELP: Record<FeeType, string> = {
  booking: 'Reserves the artisan’s time for you.',
  consultancy: 'Pays for advice and planning before the work is priced.',
  inspection: 'Pays for the artisan to come and see the problem before quoting.',
};
export const MIN_FEE = 500;
export const MAX_FEE = 200_000;
/** An unanswered request is refunded after this long. */
export const FEE_RESPONSE_HOURS = 24;

export function validateFee(f: FeeSetting): string | null {
  if (!['booking', 'consultancy', 'inspection'].includes(f.type)) return 'Choose booking, consultancy or inspection.';
  if (!Number.isFinite(f.amount) || f.amount < MIN_FEE) return `The fee must be at least ₦${MIN_FEE.toLocaleString('en-NG')}.`;
  if (f.amount > MAX_FEE) return `The fee can’t be more than ₦${MAX_FEE.toLocaleString('en-NG')}.`;
  return null;
}

/** The fee that applies when booking this artisan for this trade. */
export function feeFor(artisan: Pick<Artisan, 'fees'>, categoryId: string, tradeFeeTypes?: Record<string, FeeType>): FeeSetting {
  const own = artisan.fees?.[categoryId];
  if (own) return own;
  const type = tradeFeeTypes?.[categoryId] ?? defaultFeeType(categoryId);
  return { type, amount: DEFAULT_FEE_AMOUNT[type] };
}

export function feeSplit(amount: number, rate: number): { commission: number; toArtisan: number } {
  const commission = Math.round(amount * rate);
  return { commission, toArtisan: amount - commission };
}

export const feePaid = (job: Pick<Job, 'fee'>) => !job.fee || job.fee.status !== 'unpaid';

/** Can the artisan still change the fee for this job? Only before the customer pays it. */
export const feeEditable = (job: Pick<Job, 'fee' | 'status'>) => !!job.fee && job.fee.status === 'unpaid' && job.status === 'requested';

/** Booking and consultancy fees release when the artisan engages (sends or accepts a price); inspection fees when the inspection is done. */
export function releasesOn(fee: JobFee, event: 'engaged' | 'inspected' | 'price_agreed'): boolean {
  if (fee.status !== 'held') return false;
  if (event === 'price_agreed') return true;
  return fee.type === 'inspection' ? event === 'inspected' : event === 'engaged';
}

/** Requests the artisan never answered: refund the fee. */
export function feeExpired(job: Job, now: number): boolean {
  if (!job.fee || job.fee.status !== 'held' || job.status !== 'requested' || !job.fee.paidAt) return false;
  const engaged = job.pricePool.offers.some((o) => o.by === 'artisan');
  return !engaged && now - new Date(job.fee.paidAt).getTime() > FEE_RESPONSE_HOURS * 3_600_000;
}
