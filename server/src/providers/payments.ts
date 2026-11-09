import crypto from 'node:crypto';

/**
 * Payment service provider adapter. Amounts are whole Naira at this boundary;
 * the Paystack adapter converts to kobo.
 *
 * Funding is never trusted from the client: a job is marked funded only after
 * a signed webhook (or a server-side verify call) confirms the exact amount.
 */
export interface WebhookEvent {
  type: 'charge.success' | 'charge.failed' | 'transfer.success' | 'transfer.failed' | 'transfer.reversed' | 'refund.processed' | 'other';
  reference: string;
  amount: number;
}

export interface PaymentGateway {
  readonly name: string;
  initializeCharge(i: { reference: string; amount: number; email: string; callbackUrl: string; metadata: Record<string, unknown> }): Promise<{ authorizationUrl: string; accessCode?: string }>;
  verifyCharge(reference: string): Promise<{ status: 'success' | 'failed' | 'pending'; amount: number }>;
  refund(i: { reference: string; amount: number }): Promise<{ ok: boolean; error?: string }>;
  resolveAccount(i: { accountNumber: string; bankCode: string }): Promise<{ accountName: string }>;
  createRecipient(i: { name: string; accountNumber: string; bankCode: string }): Promise<{ recipientCode: string }>;
  transfer(i: { amount: number; recipientCode: string; reference: string; reason: string }): Promise<{ status: 'pending' | 'success' | 'failed'; error?: string }>;
  verifyWebhook(rawBody: string, signature: string | undefined): boolean;
  parseWebhook(body: unknown): WebhookEvent;
}

export function signWebhook(rawBody: string, secret: string): string {
  return crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

function parsePaystackEvent(body: unknown): WebhookEvent {
  const b = body as { event?: string; data?: { reference?: string; amount?: number; transaction_reference?: string; transaction?: { reference?: string } } };
  const known = ['charge.success', 'charge.failed', 'transfer.success', 'transfer.failed', 'transfer.reversed', 'refund.processed'];
  const type = (known.includes(b.event ?? '') ? b.event : 'other') as WebhookEvent['type'];
  const reference = b.data?.reference ?? b.data?.transaction_reference ?? b.data?.transaction?.reference ?? '';
  return { type, reference, amount: Math.round((b.data?.amount ?? 0) / 100) };
}

// ---------------------------------------------------------------------------
// Paystack (https://paystack.com/docs/api)
// ---------------------------------------------------------------------------
export class PaystackGateway implements PaymentGateway {
  readonly name = 'paystack';
  constructor(private secretKey: string, private base = 'https://api.paystack.co') {}

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.base + path, {
      method,
      headers: { Authorization: `Bearer ${this.secretKey}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
    if (!res.ok || !json.status) throw new Error(`Paystack ${path} failed: ${json.message ?? res.status}`);
    return json.data as T;
  }

  async initializeCharge(i: { reference: string; amount: number; email: string; callbackUrl: string; metadata: Record<string, unknown> }) {
    const d = await this.call<{ authorization_url: string; access_code: string }>('POST', '/transaction/initialize', {
      email: i.email,
      amount: i.amount * 100,
      currency: 'NGN',
      reference: i.reference,
      callback_url: i.callbackUrl,
      metadata: i.metadata,
      channels: ['card', 'bank_transfer', 'ussd'],
    });
    return { authorizationUrl: d.authorization_url, accessCode: d.access_code };
  }

  async verifyCharge(reference: string) {
    const d = await this.call<{ status: string; amount: number }>('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    return { status: (d.status === 'success' ? 'success' : d.status === 'failed' || d.status === 'abandoned' ? 'failed' : 'pending') as 'success' | 'failed' | 'pending', amount: Math.round(d.amount / 100) };
  }

  async refund(i: { reference: string; amount: number }) {
    try {
      await this.call('POST', '/refund', { transaction: i.reference, amount: i.amount * 100 });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async resolveAccount(i: { accountNumber: string; bankCode: string }) {
    const d = await this.call<{ account_name: string }>('GET', `/bank/resolve?account_number=${i.accountNumber}&bank_code=${i.bankCode}`);
    return { accountName: d.account_name };
  }

  async createRecipient(i: { name: string; accountNumber: string; bankCode: string }) {
    const d = await this.call<{ recipient_code: string }>('POST', '/transferrecipient', { type: 'nuban', name: i.name, account_number: i.accountNumber, bank_code: i.bankCode, currency: 'NGN' });
    return { recipientCode: d.recipient_code };
  }

  async transfer(i: { amount: number; recipientCode: string; reference: string; reason: string }) {
    try {
      const d = await this.call<{ status: string }>('POST', '/transfer', { source: 'balance', amount: i.amount * 100, recipient: i.recipientCode, reference: i.reference, reason: i.reason });
      return { status: (d.status === 'success' ? 'success' : d.status === 'failed' ? 'failed' : 'pending') as 'pending' | 'success' | 'failed' };
    } catch (e) {
      return { status: 'failed' as const, error: (e as Error).message };
    }
  }

  verifyWebhook(rawBody: string, signature: string | undefined) {
    return !!signature && safeEqualHex(signature, signWebhook(rawBody, this.secretKey));
  }

  parseWebhook(body: unknown) {
    return parsePaystackEvent(body);
  }
}

// ---------------------------------------------------------------------------
// Mock (development & tests). Same webhook format and signature scheme as Paystack.
// ---------------------------------------------------------------------------
export class MockGateway implements PaymentGateway {
  readonly name = 'mock';
  charges = new Map<string, { amount: number; status: 'pending' | 'success' | 'failed' }>();
  refunds: { reference: string; amount: number }[] = [];
  transfers: { reference: string; amount: number; recipientCode: string }[] = [];
  failNextRefund = false;
  constructor(public secret = 'sk_test_mock') {}

  async initializeCharge(i: { reference: string; amount: number }) {
    this.charges.set(i.reference, { amount: i.amount, status: 'pending' });
    return { authorizationUrl: `https://checkout.mock.sleek/${i.reference}` };
  }
  async verifyCharge(reference: string) {
    const c = this.charges.get(reference);
    return { status: c?.status ?? ('failed' as const), amount: c?.amount ?? 0 };
  }
  async refund(i: { reference: string; amount: number }) {
    if (this.failNextRefund) {
      this.failNextRefund = false;
      return { ok: false, error: 'mock refund failure' };
    }
    this.refunds.push(i);
    return { ok: true };
  }
  async resolveAccount(i: { accountNumber: string }) {
    if (!/^\d{10}$/.test(i.accountNumber)) throw new Error('Invalid account number');
    return { accountName: 'MOCK ACCOUNT HOLDER' };
  }
  async createRecipient(i: { accountNumber: string }) {
    return { recipientCode: `RCP_mock_${i.accountNumber.slice(-4)}` };
  }
  async transfer(i: { amount: number; recipientCode: string; reference: string }) {
    this.transfers.push(i);
    return { status: 'pending' as const };
  }
  verifyWebhook(rawBody: string, signature: string | undefined) {
    return !!signature && safeEqualHex(signature, signWebhook(rawBody, this.secret));
  }
  parseWebhook(body: unknown) {
    return parsePaystackEvent(body);
  }
  /** Simulate the customer completing checkout: returns the webhook body + signature Paystack would send. */
  completeCharge(reference: string, opts: { amount?: number; fail?: boolean } = {}) {
    const c = this.charges.get(reference);
    if (c) c.status = opts.fail ? 'failed' : 'success';
    const body = JSON.stringify({ event: opts.fail ? 'charge.failed' : 'charge.success', data: { reference, amount: (opts.amount ?? c?.amount ?? 0) * 100, status: opts.fail ? 'failed' : 'success' } });
    return { body, signature: signWebhook(body, this.secret) };
  }
}
