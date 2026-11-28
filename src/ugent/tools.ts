/**
 * Ugent tool definitions (JSON schema). Pure data: shared by the app and the
 * server's agent gateway (GET /v1/agent/tools).
 */
import type { UgentActionName } from './types';

export interface ToolDef {
  name: UgentActionName;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

const iso = { type: 'string', description: 'ISO-8601 date-time, Africa/Lagos' };

export const UGENT_TOOLS: ToolDef[] = [
  { name: 'list_categories', description: 'List all trades/services offered on Sleek.', input_schema: { type: 'object', properties: {} } },
  {
    name: 'search_available_artisans',
    description: 'Search AVAILABLE, verified artisans ranked best to last. If start/end are given, only artisans free for that window are returned.',
    input_schema: {
      type: 'object',
      properties: { category_id: { type: 'string' }, city: { type: 'string' }, text: { type: 'string' }, start: iso, end: iso, limit: { type: 'number' } },
    },
  },
  { name: 'get_artisan_profile', description: 'Public profile, badges, rating and starting prices of an artisan.', input_schema: { type: 'object', properties: { artisan_id: { type: 'string' } }, required: ['artisan_id'] } },
  { name: 'check_artisan_skills', description: 'Which skills an artisan is verified for (each verified separately).', input_schema: { type: 'object', properties: { artisan_id: { type: 'string' } }, required: ['artisan_id'] } },
  {
    name: 'check_availability',
    description: 'Check if an artisan can take a job in a time window, and suggest free slots for that day.',
    input_schema: { type: 'object', properties: { artisan_id: { type: 'string' }, category_id: { type: 'string' }, start: iso, end: iso }, required: ['artisan_id', 'category_id', 'start', 'end'] },
  },
  {
    name: 'initiate_booking',
    description: 'Create a job request and open the chat. REQUIRES USER CONFIRMATION in Sleek. Price is then agreed in the Price Pool.',
    input_schema: {
      type: 'object',
      properties: { artisan_id: { type: 'string' }, category_id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, start: iso, end: iso, address_label: { type: 'string', description: 'Saved address label, e.g. Home' } },
      required: ['artisan_id', 'category_id', 'description', 'start', 'end'],
    },
  },
  { name: 'propose_price', description: 'Propose or counter a price in the job Price Pool. REQUIRES USER CONFIRMATION.', input_schema: { type: 'object', properties: { job_id: { type: 'string' }, amount: { type: 'number' } }, required: ['job_id', 'amount'] } },
  { name: 'request_escrow_funding', description: 'Ask the user to pay the locked price into Sleek Hold. The user completes payment in Sleek; Ugent never handles payment details.', input_schema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] } },
  { name: 'approve_job_completion', description: 'Approve proof of work and release Sleek Hold. REQUIRES USER CONFIRMATION.', input_schema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] } },
  { name: 'cancel_job', description: 'Cancel a job before work starts (refund per policy). REQUIRES USER CONFIRMATION.', input_schema: { type: 'object', properties: { job_id: { type: 'string' }, reason: { type: 'string' } }, required: ['job_id', 'reason'] } },
  { name: 'get_job_status', description: 'Status, Sleek Hold state, time window and the next step for a job.', input_schema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] } },
  { name: 'list_my_jobs', description: 'The user’s jobs with status.', input_schema: { type: 'object', properties: { active_only: { type: 'boolean' } } } },
];
