-- Sleek schema v1.
-- Domain objects are stored as JSONB with exactly the shapes in src/domain/types.ts,
-- plus indexed columns for everything we filter, join or lock on.

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  role        TEXT NOT NULL CHECK (role IN ('customer', 'artisan', 'admin')),
  phone       TEXT NOT NULL UNIQUE,
  suspended   BOOLEAN NOT NULL DEFAULT FALSE,
  city        TEXT,
  online      BOOLEAN NOT NULL DEFAULT FALSE,
  data        JSONB NOT NULL,
  -- bumped to revoke every agent token issued to this user
  agent_token_version INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_role_city ON users (role, city) WHERE NOT suspended;

CREATE TABLE IF NOT EXISTS otps (
  phone       TEXT PRIMARY KEY,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  sent_count  INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT PRIMARY KEY,
  customer_id  TEXT NOT NULL REFERENCES users(id),
  artisan_id   TEXT NOT NULL REFERENCES users(id),
  status       TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end   TIMESTAMPTZ NOT NULL,
  data         JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_customer ON jobs (customer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS jobs_artisan ON jobs (artisan_id, status, window_start);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs (status);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  job_id     TEXT NOT NULL REFERENCES jobs(id),
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_job ON messages (job_id, created_at);

CREATE TABLE IF NOT EXISTS violations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  reviewed   BOOLEAN NOT NULL DEFAULT FALSE,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS violations_user ON violations (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS disputes (
  id         TEXT PRIMARY KEY,
  job_id     TEXT NOT NULL UNIQUE REFERENCES jobs(id),
  status     TEXT NOT NULL,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id         TEXT PRIMARY KEY,
  job_id     TEXT UNIQUE,
  artisan_id TEXT NOT NULL REFERENCES users(id),
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reviews_artisan ON reviews (artisan_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  read       BOOLEAN NOT NULL DEFAULT FALSE,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications (user_id, created_at DESC);

-- Money: an append-only ledger. Balance = SUM(amount).
CREATE TABLE IF NOT EXISTS ledger (
  id         TEXT PRIMARY KEY,
  artisan_id TEXT NOT NULL REFERENCES users(id),
  job_id     TEXT,
  type       TEXT NOT NULL,
  amount     BIGINT NOT NULL,
  note       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_artisan ON ledger (artisan_id, created_at DESC);
-- one release per job per type: protects against double release
CREATE UNIQUE INDEX IF NOT EXISTS ledger_job_once ON ledger (job_id, type) WHERE job_id IS NOT NULL;

-- Every PSP charge/refund/transfer, keyed by our reference. Makes webhooks idempotent.
CREATE TABLE IF NOT EXISTS payments (
  reference  TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('escrow', 'order', 'refund', 'payout')),
  target_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  amount     BIGINT NOT NULL,
  status     TEXT NOT NULL,
  data       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_target ON payments (target_id);

CREATE TABLE IF NOT EXISTS payouts (
  id         TEXT PRIMARY KEY,
  artisan_id TEXT NOT NULL REFERENCES users(id),
  status     TEXT NOT NULL,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  status     TEXT NOT NULL,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_user ON orders (user_id, created_at DESC);

-- Controlled uploads audit log (who, what for, when).
CREATE TABLE IF NOT EXISTS media (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  job_id     TEXT,
  purpose    TEXT NOT NULL,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS liveness_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  worker_id   TEXT,
  challenges  JSONB NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_requests (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  status     TEXT NOT NULL,
  data       JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_requests_user ON agent_requests (user_id, status);

CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  actor_id   TEXT,
  action     TEXT NOT NULL,
  target_id  TEXT,
  detail     JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
