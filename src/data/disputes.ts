import type { DisputeReason } from '../domain/types';

export const DISPUTE_REASONS: { id: DisputeReason; label: string }[] = [
  { id: 'not_completed', label: 'Job not completed' },
  { id: 'poor_quality', label: 'Poor quality work' },
  { id: 'no_show', label: 'Artisan didn’t show up' },
  { id: 'damage', label: 'Something was damaged' },
  { id: 'overcharge_request', label: 'Asked for extra money' },
  { id: 'other', label: 'Other' },
];
