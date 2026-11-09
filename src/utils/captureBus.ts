import { router } from 'expo-router';
import type { UploadPurpose } from '../domain/types';

/**
 * Controlled, system-guided uploads. There is no free file/gallery picker
 * anywhere in Sleek: a photo can only be taken live with the camera for a
 * specific purpose, and every capture is logged.
 */

type Handler = (uri: string) => void;
const handlers = new Map<string, Handler>();

export const PURPOSE_PROMPT: Record<UploadPurpose, { title: string; hint: string }> = {
  issue_photo: { title: 'Upload photo of the issue', hint: 'Show the problem clearly so the artisan can quote accurately.' },
  site_before: { title: 'Photo before starting', hint: 'Capture the condition of the work area before you begin.' },
  proof_of_work: { title: 'Proof of work', hint: 'Show the finished job clearly. Take several angles.' },
  dispute_evidence: { title: 'Dispute evidence', hint: 'Show exactly what is wrong. This goes to the Sleek Trust team.' },
  delivery_confirmation: { title: 'Delivery confirmation', hint: 'Photo of the delivered items.' },
  certificate: { title: 'Trade certificate or licence', hint: 'Lay it flat in good light. All text must be readable.' },
};

export function requestCapture(purpose: UploadPurpose, onDone: Handler, jobId?: string) {
  const key = `${purpose}_${Date.now()}`;
  handlers.set(key, onDone);
  router.push({ pathname: '/capture', params: { key, purpose, jobId: jobId ?? '' } });
}

export function resolveCapture(key: string, uri: string) {
  const h = handlers.get(key);
  handlers.delete(key);
  h?.(uri);
}
