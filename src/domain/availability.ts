import { BLOCKING_STATUSES } from './escrow';
import type { Artisan, Job, TimeWindow, Worker } from './types';

/**
 * Availability & booking rules.
 *
 * - Every job has an agreed time window.
 * - A worker can hold many jobs as long as the windows never overlap.
 * - A future funded booking does NOT make the artisan unavailable today; it only
 *   blocks its own window.
 * - Team/Agency accounts are as available as their free, skill-verified workers.
 */

export const BUFFER_MINUTES = 30; // travel/setup gap required between two jobs

const t = (iso: string) => new Date(iso).getTime();

export function overlaps(a: TimeWindow, b: TimeWindow, bufferMinutes = BUFFER_MINUTES): boolean {
  const buf = bufferMinutes * 60_000;
  return t(a.start) < t(b.end) + buf && t(b.start) < t(a.end) + buf;
}

export function isValidWindow(w: TimeWindow, now: number): string | null {
  if (!(t(w.end) > t(w.start))) return 'The end time must be after the start time.';
  if (t(w.start) < now - 5 * 60_000) return 'Pick a time in the future.';
  if (t(w.end) - t(w.start) > 14 * 24 * 3_600_000) return 'A single booking can’t be longer than 14 days.';
  return null;
}

/** The worker IDs an artisan account can deploy. Individuals are their own single worker. */
export function workerIdsOf(artisan: Artisan): string[] {
  if (artisan.accountType === 'individual' || artisan.workers.length === 0) return [artisan.id];
  return artisan.workers.filter((w) => w.active).map((w) => w.id);
}

export function workerSkillApproved(artisan: Artisan, workerId: string, categoryId: string): boolean {
  if (workerId === artisan.id) return artisan.skills.some((s) => s.categoryId === categoryId && s.status === 'approved');
  const w = artisan.workers.find((x) => x.id === workerId);
  return !!w && w.active && w.identity.faceMatch === 'passed' && w.skills.some((s) => s.categoryId === categoryId && s.status === 'approved');
}

export function blockingJobsFor(jobs: Job[], artisanId: string, workerId: string): Job[] {
  return jobs.filter(
    (j) => j.artisanId === artisanId && BLOCKING_STATUSES.includes(j.status) && (j.workerId ?? artisanId) === workerId,
  );
}

export function workerFreeFor(jobs: Job[], artisan: Artisan, workerId: string, window: TimeWindow): boolean {
  return !blockingJobsFor(jobs, artisan.id, workerId).some((j) => overlaps(j.window, window));
}

/** Workers that are skill-approved and free for the window. */
export function freeWorkersFor(jobs: Job[], artisan: Artisan, categoryId: string, window: TimeWindow): string[] {
  return workerIdsOf(artisan).filter((wid) => workerSkillApproved(artisan, wid, categoryId) && workerFreeFor(jobs, artisan, wid, window));
}

export function withinWorkingHours(artisan: Artisan, window: TimeWindow): boolean {
  const start = new Date(window.start);
  const hours = artisan.workingHours[start.getDay()];
  if (!hours) return false;
  const startH = start.getHours() + start.getMinutes() / 60;
  const end = new Date(window.end);
  const sameDay = end.toDateString() === start.toDateString();
  const endH = sameDay ? end.getHours() + end.getMinutes() / 60 : 24;
  // Multi-day jobs only need to start within working hours.
  return startH >= hours.start && (sameDay ? endH <= hours.end : startH < hours.end);
}

export type AvailabilityState = 'available' | 'on_job' | 'offline' | 'fully_booked';

export const AVAILABILITY_LABEL: Record<AvailabilityState, string> = {
  available: 'Available',
  on_job: 'On Job',
  offline: 'Offline',
  fully_booked: 'Fully Booked',
};

/** Current, real availability. Only `available` artisans are shown in search. */
export function availabilityNow(jobs: Job[], artisan: Artisan, now: number): AvailabilityState {
  if (!artisan.online) return 'offline';
  if (!artisan.identity || artisan.identity.faceMatch !== 'passed') return 'offline';
  const ids = workerIdsOf(artisan);
  const nowWindow: TimeWindow = { start: new Date(now).toISOString(), end: new Date(now + 60 * 60_000).toISOString() };
  const busy = ids.filter((wid) => !workerFreeFor(jobs, artisan, wid, nowWindow));
  if (busy.length === 0) return 'available';
  if (busy.length < ids.length) return 'available'; // team/agency with free capacity
  const onJob = jobs.some(
    (j) => j.artisanId === artisan.id && j.status === 'in_progress',
  );
  return onJob ? 'on_job' : 'fully_booked';
}

/** Is the artisan bookable for this category and window right now? */
export function bookableFor(jobs: Job[], artisan: Artisan, categoryId: string, window: TimeWindow): { ok: boolean; reason?: string; workers: string[] } {
  if (!artisan.online) return { ok: false, reason: 'This artisan is offline.', workers: [] };
  if (artisan.identity.faceMatch !== 'passed') return { ok: false, reason: 'Identity not verified.', workers: [] };
  if (!artisan.skills.some((s) => s.categoryId === categoryId && s.status === 'approved') &&
      !artisan.workers.some((w) => w.skills.some((s) => s.categoryId === categoryId && s.status === 'approved'))) {
    return { ok: false, reason: 'Not skill-verified for this service.', workers: [] };
  }
  if (!withinWorkingHours(artisan, window)) return { ok: false, reason: 'Outside this artisan’s working hours.', workers: [] };
  const workers = freeWorkersFor(jobs, artisan, categoryId, window);
  if (workers.length === 0) return { ok: false, reason: 'Already booked for an overlapping time.', workers: [] };
  return { ok: true, workers };
}

/** Free slots of `durationMin` for a day, used by the booking time picker. */
export function suggestSlots(jobs: Job[], artisan: Artisan, categoryId: string, day: Date, durationMin: number, now: number): TimeWindow[] {
  const hours = artisan.workingHours[day.getDay()];
  if (!hours) return [];
  const slots: TimeWindow[] = [];
  for (let h = hours.start; h + durationMin / 60 <= hours.end; h += 1) {
    const s = new Date(day);
    s.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
    const e = new Date(s.getTime() + durationMin * 60_000);
    if (s.getTime() < now + 30 * 60_000) continue;
    const w = { start: s.toISOString(), end: e.toISOString() };
    if (bookableFor(jobs, artisan, categoryId, w).ok) slots.push(w);
  }
  return slots;
}

export function findWorker(artisan: Artisan, workerId?: string): Worker | undefined {
  return workerId ? artisan.workers.find((w) => w.id === workerId) : undefined;
}
