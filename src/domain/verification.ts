import type { Category, IdentityVerification, SkillVerification, SkillVideo } from './types';

/**
 * Verification rules — designed to be hard to fake.
 *
 * Identity: NIN lookup + active liveness challenge + face match between the
 * live selfie and the NIN record photo.
 *
 * Skills: every skill needs its own in-app recorded proof-of-work video showing
 * live work AND the person's face, which must match the verified identity.
 * Each skill is approved separately. High-risk trades always get human review
 * and may need a certificate.
 */

export const FACE_MATCH_THRESHOLD = 0.85;
export const SKILL_VIDEO_FACE_THRESHOLD = 0.8;
export const MIN_SKILL_VIDEO_SEC = 30;
export const MAX_SKILL_VIDEO_SEC = 180;

export function isValidNIN(nin: string): boolean {
  return /^\d{11}$/.test(nin.replace(/\s/g, ''));
}

export function emptyIdentity(): IdentityVerification {
  return { nin: 'not_started', liveness: 'not_started', faceMatch: 'not_started' };
}

export type IdentityStep = 'nin' | 'liveness' | 'face_match' | 'done';

export function nextIdentityStep(id: IdentityVerification): IdentityStep {
  if (id.nin !== 'passed') return 'nin';
  if (id.liveness !== 'passed') return 'liveness';
  if (id.faceMatch !== 'passed') return 'face_match';
  return 'done';
}

/** Liveness challenges are randomised per attempt so pre-recorded videos fail. */
export const LIVENESS_CHALLENGES = [
  { id: 'blink', prompt: 'Blink slowly twice' },
  { id: 'left', prompt: 'Turn your head to the left' },
  { id: 'right', prompt: 'Turn your head to the right' },
  { id: 'smile', prompt: 'Smile' },
  { id: 'nod', prompt: 'Nod your head' },
  { id: 'up', prompt: 'Look up' },
] as const;

export function pickChallenges(seed: number, count = 3): (typeof LIVENESS_CHALLENGES)[number][] {
  const pool = [...LIVENESS_CHALLENGES];
  const out: (typeof LIVENESS_CHALLENGES)[number][] = [];
  let x = seed || 1;
  while (out.length < count && pool.length) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out.push(pool.splice(x % pool.length, 1)[0]);
  }
  return out;
}

export interface VideoCheck {
  ok: boolean;
  problems: string[];
}

/** Automated gate before a skill video goes to review. */
export function checkSkillVideo(video: SkillVideo): VideoCheck {
  const problems: string[] = [];
  if (!video.recordedInApp) problems.push('Videos must be recorded inside Sleek.');
  if (video.durationSec < MIN_SKILL_VIDEO_SEC) problems.push(`Record at least ${MIN_SKILL_VIDEO_SEC} seconds of live work.`);
  if (video.durationSec > MAX_SKILL_VIDEO_SEC) problems.push(`Keep the video under ${MAX_SKILL_VIDEO_SEC / 60} minutes.`);
  if (!video.livenessPassed) problems.push('We could not confirm a live person in the video.');
  if (video.faceMatchScore < SKILL_VIDEO_FACE_THRESHOLD) problems.push('Your face must be clearly visible and match your verified identity.');
  return { ok: problems.length === 0, problems };
}

/** Status after automated checks: high-risk always waits for a human. */
export function statusAfterAutoCheck(category: Category, check: VideoCheck): SkillVerification['status'] {
  if (!check.ok) return 'rejected';
  return 'in_review';
}

export function canSubmitSkill(identity: IdentityVerification, current?: SkillVerification): string | null {
  if (identity.faceMatch !== 'passed') return 'Finish identity verification (NIN, liveness and face match) first.';
  if (current && (current.status === 'approved')) return 'This skill is already verified.';
  if (current && (current.status === 'submitted' || current.status === 'in_review')) return 'This skill is already being reviewed.';
  return null;
}

export const SKILL_STATUS_LABEL: Record<SkillVerification['status'], string> = {
  not_started: 'Not started',
  submitted: 'Checking video',
  in_review: 'In review',
  approved: 'Verified',
  rejected: 'Rejected',
  needs_more: 'More proof needed',
};
