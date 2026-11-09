/**
 * Identity verification adapter: NIN lookup, active liveness and face match.
 *
 * Production: the app uploads encrypted captures to the Sleek backend, which
 * calls a NIMC-licensed provider (e.g. Smile ID / Prembly / Youverify / Dojah)
 * server-side. Raw NIN and biometric data never live on the device: we keep
 * only the last 4 digits and pass/fail results. Captures are deleted from the
 * device cache after upload.
 */

export interface NinLookupResult {
  ok: boolean;
  fullName?: string;
  /** Opaque server reference to the NIMC record photo — used for face match. */
  recordPhotoRef?: string;
  error?: string;
}

export interface LivenessResult {
  passed: boolean;
  score: number;
  selfieRef?: string;
  reason?: string;
}

export interface IdentityProvider {
  lookupNIN(nin: string, claimedName: string): Promise<NinLookupResult>;
  checkLiveness(input: { frames: string[]; challenges: string[] }): Promise<LivenessResult>;
  faceMatch(input: { selfieRef: string; referenceRef: string }): Promise<{ score: number }>;
  /** Runs liveness + face match on a recorded skill video. */
  analyseSkillVideo(input: { uri: string; durationSec: number; identityRef: string }): Promise<{ livenessPassed: boolean; faceMatchScore: number }>;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Deterministic simulated provider for development & demos. NIN 00000000000 always fails. */
export const mockIdentity: IdentityProvider = {
  async lookupNIN(nin, claimedName) {
    await wait(1100);
    if (!/^\d{11}$/.test(nin)) return { ok: false, error: 'A NIN has 11 digits.' };
    if (/^0+$/.test(nin)) return { ok: false, error: 'This NIN was not found on the NIMC database.' };
    return { ok: true, fullName: claimedName.trim() || 'Verified Name', recordPhotoRef: `nimc_${nin.slice(-4)}` };
  },
  async checkLiveness({ frames, challenges }) {
    await wait(1200);
    const passed = frames.length >= challenges.length && frames.length > 0;
    return passed
      ? { passed, score: 0.97, selfieRef: `selfie_${Date.now()}` }
      : { passed, score: 0.2, reason: 'We could not see all the movements. Try again in good light.' };
  },
  async faceMatch() {
    await wait(800);
    return { score: 0.93 };
  },
  async analyseSkillVideo({ durationSec }) {
    await wait(1500);
    return { livenessPassed: durationSec > 0, faceMatchScore: durationSec > 0 ? 0.9 : 0 };
  },
};

export const identity: IdentityProvider = mockIdentity;

/** Lightweight integrity hash computed at capture time so reused videos can be detected server-side. */
export function captureHash(uri: string, at: string): string {
  let h = 2166136261;
  for (const ch of uri + at) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16);
}
