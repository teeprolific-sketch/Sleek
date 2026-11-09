import { loadConfig, type Config } from './config';
import type { Deps } from './context';
import { Db } from './db';
import { MockIdentity } from './providers/identity';
import { MockGateway, PaystackGateway } from './providers/payments';
import { ConsoleSms } from './providers/sms';
import { MockStorage } from './providers/storage';

/**
 * Wires real or mock providers from config. Identity, SMS and storage default to
 * mocks until the production adapters (KYC partner, SMS gateway, bucket) are
 * plugged in — see server/README.md.
 */
export function createDeps(overrides: Partial<Config> = {}, extra: Partial<Deps> = {}): Deps {
  const cfg = loadConfig(overrides);
  const payments = cfg.paymentProvider === 'paystack' ? new PaystackGateway(cfg.paystackSecretKey) : new MockGateway(cfg.paystackSecretKey);
  return {
    cfg,
    db: new Db(cfg.databaseUrl),
    payments,
    identity: new MockIdentity(),
    sms: new ConsoleSms(cfg.env === 'development'),
    storage: new MockStorage(cfg.publicBaseUrl),
    now: () => Date.now(),
    ...extra,
  };
}
