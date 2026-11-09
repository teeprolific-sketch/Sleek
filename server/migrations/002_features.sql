-- v2: two-way reviews, safety alerts, referrals, protection claims, admin notes,
-- notification preferences, tips.

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_kind_check;
ALTER TABLE payments ADD CONSTRAINT payments_kind_check CHECK (kind IN ('escrow', 'order', 'refund', 'payout', 'tip', 'protection'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS customer_reviews (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL UNIQUE REFERENCES jobs(id),
  customer_id TEXT NOT NULL REFERENCES users(id),
  artisan_id  TEXT NOT NULL REFERENCES users(id),
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS safety_alerts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  job_id     TEXT,
  status     TEXT NOT NULL,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS safety_alerts_open ON safety_alerts (status, created_at DESC);

CREATE TABLE IF NOT EXISTS referrals (
  id          TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL REFERENCES users(id),
  referee_id  TEXT NOT NULL UNIQUE REFERENCES users(id),
  status      TEXT NOT NULL,
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guarantee_claims (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL UNIQUE REFERENCES jobs(id),
  customer_id TEXT NOT NULL REFERENCES users(id),
  status      TEXT NOT NULL,
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_notes (
  id          TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  author_id   TEXT NOT NULL REFERENCES users(id),
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_notes_target ON admin_notes (target_type, target_id);
