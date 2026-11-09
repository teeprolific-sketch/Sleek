import type { Config } from './config';
import type { Db } from './db';
import type { IdentityProvider } from './providers/identity';
import type { PaymentGateway } from './providers/payments';
import type { SmsProvider } from './providers/sms';
import type { StorageProvider } from './providers/storage';

/** Everything a service needs. `now` is injectable so time-based rules are testable. */
export interface Deps {
  cfg: Config;
  db: Db;
  payments: PaymentGateway;
  identity: IdentityProvider;
  sms: SmsProvider;
  storage: StorageProvider;
  now: () => number;
}
