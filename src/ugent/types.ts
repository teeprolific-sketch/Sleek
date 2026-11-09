/** Ugent (Me AI personal agent) integration types. */

export type UgentActionName =
  | 'search_available_artisans'
  | 'get_artisan_profile'
  | 'check_artisan_skills'
  | 'check_availability'
  | 'list_categories'
  | 'initiate_booking'
  | 'get_job_status'
  | 'list_my_jobs'
  | 'propose_price'
  | 'request_escrow_funding'
  | 'approve_job_completion'
  | 'cancel_job';

/** Actions that change state or move money ALWAYS wait for the user to confirm inside Sleek. */
export const CONFIRMATION_REQUIRED: UgentActionName[] = [
  'initiate_booking',
  'propose_price',
  'request_escrow_funding',
  'approve_job_completion',
  'cancel_job',
];

export type UgentRequestStatus = 'pending' | 'confirmed' | 'rejected' | 'expired' | 'failed';

export interface UgentRequest {
  id: string;
  userId: string;
  action: UgentActionName;
  args: Record<string, unknown>;
  /** Plain-language summary the user confirms. */
  summary: string;
  status: UgentRequestStatus;
  createdAt: string;
  expiresAt: string;
  decidedAt?: string;
  result?: unknown;
  error?: string;
}
