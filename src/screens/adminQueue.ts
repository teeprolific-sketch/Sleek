import type { Artisan, SkillVerification } from '../domain/types';

export interface QueueItem {
  artisan: Artisan;
  workerId?: string;
  workerName?: string;
  skill: SkillVerification;
}

/** Every skill video waiting for a human decision, oldest first, high-risk flagged. */
export function verificationQueue(artisans: Artisan[]): QueueItem[] {
  const out: QueueItem[] = [];
  for (const a of artisans) {
    for (const s of a.skills) if (s.status === 'in_review' || s.status === 'submitted') out.push({ artisan: a, skill: s });
    for (const w of a.workers) for (const s of w.skills) if (s.status === 'in_review' || s.status === 'submitted') out.push({ artisan: a, workerId: w.id, workerName: w.name, skill: s });
  }
  return out.sort((x, y) => (x.skill.submittedAt ?? '').localeCompare(y.skill.submittedAt ?? ''));
}
