import type { NotificationCategory, NotificationPrefs } from './types';

export interface CategoryInfo {
  key: NotificationCategory;
  label: string;
  description: string;
  /** Safety & money-critical: can't be switched off. */
  locked?: boolean;
  roles: ('customer' | 'artisan' | 'seller' | 'admin')[];
}

export const NOTIFICATION_CATEGORIES: CategoryInfo[] = [
  { key: 'job_requests', label: 'New job requests', description: 'When a customer requests you', roles: ['artisan'] },
  { key: 'price_offers', label: 'Price offers', description: 'New offers and counter-offers in the Price Pool', roles: ['customer', 'artisan'] },
  { key: 'escrow', label: 'Sleek Hold & payments in', description: 'Paid into Sleek Hold, refunds', locked: true, roles: ['customer', 'artisan'] },
  { key: 'job_progress', label: 'Job progress', description: 'On the way, started, more time requested', roles: ['customer', 'artisan'] },
  { key: 'proof', label: 'Proof submitted', description: 'Work is ready for your approval', locked: true, roles: ['customer'] },
  { key: 'payments', label: 'Payment released & payouts', description: 'Money released, payouts, tips', locked: true, roles: ['customer', 'artisan', 'seller'] },
  { key: 'disputes', label: 'Disputes', description: 'Updates and Sleek’s decisions', locked: true, roles: ['customer', 'artisan', 'admin'] },
  { key: 'safety', label: 'Safety alerts', description: 'Emergency and safety messages', locked: true, roles: ['customer', 'artisan', 'admin', 'seller'] },
  { key: 'reviews', label: 'Reviews', description: 'New ratings and reviews', roles: ['customer', 'artisan'] },
  { key: 'verification', label: 'Verification', description: 'Identity and skill review results', roles: ['artisan', 'admin', 'seller'] },
  { key: 'orders', label: 'Sleek Services orders', description: 'Order and delivery updates', roles: ['customer', 'artisan', 'seller'] },
  { key: 'referrals', label: 'Referrals & rewards', description: 'When friends join and you earn', roles: ['customer', 'artisan'] },
  { key: 'promotions', label: 'Tips & offers', description: 'Occasional discounts and product news', roles: ['customer', 'artisan', 'seller'] },
  { key: 'system', label: 'Account & security', description: 'Sign-ins and important account changes', locked: true, roles: ['customer', 'artisan', 'admin', 'seller'] },
];

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { enabled: { promotions: false }, quietHours: { enabled: false, start: 22, end: 7 } };

function inQuietHours(q: NotificationPrefs['quietHours'], now: number): boolean {
  if (!q.enabled) return false;
  const h = new Date(now).getHours();
  return q.start > q.end ? h >= q.start || h < q.end : h >= q.start && h < q.end;
}

/** Should this be pushed to the phone? (It always lands in the in-app inbox.) */
export function shouldPush(prefs: NotificationPrefs | undefined, category: NotificationCategory, now: number): boolean {
  const p = prefs ?? DEFAULT_NOTIFICATION_PREFS;
  const info = NOTIFICATION_CATEGORIES.find((c) => c.key === category);
  if (info?.locked) return ['safety', 'escrow', 'payments'].includes(category) || !inQuietHours(p.quietHours, now);
  if (p.enabled[category] === false) return false;
  return !inQuietHours(p.quietHours, now);
}

/** Infer a category from a deep link (used for older notifications without one). */
export function categoryFromLink(link?: string, title = ''): NotificationCategory {
  const t = title.toLowerCase();
  if (t.includes('safety') || t.includes('sos')) return 'safety';
  if (t.includes('dispute')) return 'disputes';
  if (t.includes('offer') || t.includes('price')) return 'price_offers';
  if (t.includes('escrow') || t.includes('sleek hold') || t.includes('refund')) return 'escrow';
  if (t.includes('payout') || t.includes('released') || t.includes('tip')) return 'payments';
  if (t.includes('review')) return 'reviews';
  if (t.includes('proof') || t.includes('review the work')) return 'proof';
  if (t.includes('request')) return 'job_requests';
  if (t.includes('skill') || t.includes('identity') || t.includes('verif')) return 'verification';
  if (t.includes('order') || t.includes('material')) return 'orders';
  if (t.includes('referral') || t.includes('reward')) return 'referrals';
  if (link?.startsWith('/job') || link?.startsWith('/chat')) return 'job_progress';
  return 'system';
}
