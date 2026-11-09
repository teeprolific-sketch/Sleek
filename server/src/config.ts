/** All runtime configuration comes from environment variables. */
function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export interface Config {
  env: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  paymentProvider: 'mock' | 'paystack';
  paystackSecretKey: string;
  paystackCallbackUrl: string;
  /** Paystack requires an email per charge; customers sign up with phone only. */
  customerEmailDomain: string;
  publicBaseUrl: string;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as Config['env'];
  const cfg: Config = {
    env: nodeEnv,
    port: Number(env('PORT', '8080')),
    databaseUrl: env('DATABASE_URL', 'postgres://sleek@localhost:5433/sleek?host=/tmp'),
    jwtSecret: env('JWT_SECRET', nodeEnv === 'production' ? undefined : 'dev-only-secret-change-me-0123456789'),
    paymentProvider: env('PAYMENT_PROVIDER', nodeEnv === 'production' ? 'paystack' : 'mock') as Config['paymentProvider'],
    paystackSecretKey: env('PAYSTACK_SECRET_KEY', nodeEnv === 'production' ? undefined : 'sk_test_mock'),
    paystackCallbackUrl: env('PAYSTACK_CALLBACK_URL', 'sleek://payment-complete'),
    customerEmailDomain: env('CUSTOMER_EMAIL_DOMAIN', 'customers.sleek.ng'),
    publicBaseUrl: env('PUBLIC_BASE_URL', 'http://localhost:8080'),
    ...overrides,
  };
  if (cfg.env === 'production' && cfg.jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production');
  if (cfg.env === 'production' && cfg.paymentProvider === 'mock') throw new Error('The mock payment provider cannot run in production');
  return cfg;
}
