import type { ProviderKey } from '../domain/types';

/**
 * The outside providers Sleek needs, and which one each demo simulates.
 *
 * Demo builds never call a real provider: every call is simulated in the app
 * and written to the provider log, so the founders can see exactly when each
 * provider would be used. Production swaps each simulation for the real
 * adapter on the Sleek backend (keys live only on the server).
 */
export interface ProviderInfo {
  key: ProviderKey;
  /** The provider this demo simulates. */
  name: string;
  /** Alternatives listed in docs/IMPLEMENTATION_PLAN.md. */
  alternatives: string[];
  purpose: string;
  usedFor: string[];
}

export const PROVIDERS: ProviderInfo[] = [
  { key: 'payments', name: 'Paystack', alternatives: ['Flutterwave', 'Monnify'], purpose: 'Card, bank transfer and USSD payments, holding money in Sleek Hold, refunds and payouts', usedFor: ['Paying into Sleek Hold', 'Paying for Sleek Services orders', 'Tips', 'Refunds', 'Artisan and seller payouts'] },
  { key: 'identity', name: 'Smile ID', alternatives: ['Dojah', 'Prembly', 'Youverify'], purpose: 'NIN lookup, liveness, face match and duplicate-face search', usedFor: ['Artisan, worker and seller identity checks', 'Face match on every skill video'] },
  { key: 'sms', name: 'Termii', alternatives: ["Africa's Talking", 'Twilio'], purpose: 'Sign-in codes and SMS fallback for urgent alerts', usedFor: ['Sign-in codes', 'Job and delivery alerts when push fails'] },
  { key: 'email', name: 'Resend', alternatives: ['SendGrid', 'Amazon SES'], purpose: 'Transactional email', usedFor: ['Email confirmation codes', 'Verification results', 'Receipts and account notices'] },
  { key: 'maps', name: 'Google Maps Platform', alternatives: ['Mapbox', 'OpenStreetMap'], purpose: 'Addresses, routes and live arrival times', usedFor: ['Rider delivery tracking', 'Artisan arrival time'] },
  { key: 'storage', name: 'Cloudflare R2', alternatives: ['Amazon S3', 'Google Cloud Storage'], purpose: 'Private storage for photos and videos', usedFor: ['Issue photos', 'Proof of work', 'Skill videos', 'Dispute evidence'] },
  { key: 'vision', name: 'Google Cloud Vision', alternatives: ['AWS Rekognition', 'Azure AI Vision'], purpose: 'Reads text in photos to catch phone numbers and contact details', usedFor: ['Every photo before it is shared'] },
];

export const providerInfo = (key: ProviderKey) => PROVIDERS.find((p) => p.key === key)!;

/** A deterministic 6-digit code for simulated SMS / email codes. */
export function demoCode(seed: string): string {
  let h = 7;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 1_000_000;
  return String(100000 + (h % 900000));
}
