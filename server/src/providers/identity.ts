/**
 * KYC provider adapter (NIN lookup, liveness, face match, skill-video analysis).
 * Production: implement against a NIMC-licensed provider (Smile ID, Prembly,
 * Youverify, Dojah…). Raw NIN and biometrics stay with the provider; Sleek
 * stores only results, scores and the last 4 NIN digits.
 */
export interface IdentityProvider {
  readonly name: string;
  lookupNIN(nin: string, claimedName: string): Promise<{ ok: boolean; fullName?: string; recordPhotoRef?: string; error?: string }>;
  checkLiveness(i: { mediaUris: string[]; challenges: string[] }): Promise<{ passed: boolean; score: number; selfieRef?: string; reason?: string }>;
  faceMatch(i: { selfieRef: string; referenceRef: string }): Promise<{ score: number }>;
  analyseSkillVideo(i: { uri: string; durationSec: number; referenceRef: string }): Promise<{ livenessPassed: boolean; faceMatchScore: number }>;
}

/** Deterministic mock. NIN 00000000000 is "not found"; a liveness frame URI containing "spoof" fails. */
export class MockIdentity implements IdentityProvider {
  readonly name = 'mock';
  async lookupNIN(nin: string, claimedName: string) {
    if (!/^\d{11}$/.test(nin)) return { ok: false, error: 'A NIN has 11 digits.' };
    if (/^0+$/.test(nin)) return { ok: false, error: 'This NIN was not found on the NIMC database.' };
    return { ok: true, fullName: claimedName.trim(), recordPhotoRef: `nimc_${nin.slice(-4)}` };
  }
  async checkLiveness(i: { mediaUris: string[]; challenges: string[] }) {
    const passed = i.mediaUris.length >= i.challenges.length && !i.mediaUris.some((u) => u.includes('spoof'));
    return passed ? { passed, score: 0.97, selfieRef: `selfie_${Date.now()}` } : { passed, score: 0.2, reason: 'We could not confirm a live person. Try again in good light.' };
  }
  async faceMatch() {
    return { score: 0.93 };
  }
  async analyseSkillVideo(i: { uri: string; durationSec: number }) {
    return { livenessPassed: !i.uri.includes('spoof'), faceMatchScore: i.uri.includes('otherface') ? 0.4 : 0.9 };
  }
}
