/**
 * Payment gateway adapter (escrow funding, payouts, refunds).
 *
 * Production: implement `PaymentGateway` against the Sleek backend, which talks
 * to a licensed PSP (e.g. Paystack / Flutterwave) and holds funds in a
 * dedicated escrow/settlement account. The app NEVER moves money itself — it
 * only starts a checkout and receives a verified reference from the server.
 */

export type PaymentMethod = 'card' | 'transfer' | 'ussd';

export interface FundingResult {
  ok: boolean;
  reference?: string;
  error?: string;
}

export interface PaymentGateway {
  fundEscrow(input: { jobId: string; amount: number; method: PaymentMethod }): Promise<FundingResult>;
  requestPayout(input: { artisanId: string; amount: number }): Promise<{ ok: boolean; reference?: string; error?: string }>;
  payOrder(input: { orderId: string; amount: number; method: PaymentMethod }): Promise<FundingResult>;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ref = (p: string) => `${p}_${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e4)}`;

/** Simulated gateway used for development & demos. */
export const mockGateway: PaymentGateway = {
  async fundEscrow({ amount }) {
    await wait(900);
    if (amount <= 0) return { ok: false, error: 'Invalid amount' };
    return { ok: true, reference: ref('ESC') };
  },
  async requestPayout({ amount }) {
    await wait(700);
    if (amount < 1000) return { ok: false, error: 'Minimum payout is ₦1,000.' };
    return { ok: true, reference: ref('PAY') };
  },
  async payOrder({ amount }) {
    await wait(800);
    if (amount <= 0) return { ok: false, error: 'Invalid amount' };
    return { ok: true, reference: ref('ORD') };
  },
};

export const payments: PaymentGateway = mockGateway;

/** Bank-transfer funding uses a one-time virtual account issued by the server. */
export function virtualAccountFor(jobId: string) {
  const n = Math.abs([...jobId].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7));
  return { bank: 'Sleek Escrow (Wema)', accountNumber: `99${String(n).padStart(8, '0').slice(0, 8)}`, accountName: 'SLEEK ESCROW / JOB ' + jobId.slice(-6).toUpperCase(), expiresInMin: 30 };
}
