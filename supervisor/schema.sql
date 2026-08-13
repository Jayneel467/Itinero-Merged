-- Itinero consumer ledger (Neon Postgres). Device-scoped until real auth.

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE devices ADD COLUMN IF NOT EXISTS user_id TEXT;
CREATE INDEX IF NOT EXISTS devices_user_idx ON devices (user_id);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  name TEXT,
  newsletter BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uidx ON users (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_uidx ON users (phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS otp_challenges (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'sms',
  code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'sms';
CREATE INDEX IF NOT EXISTS otp_phone_created_idx ON otp_challenges (phone, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id);

CREATE TABLE IF NOT EXISTS pending_signups (
  id TEXT PRIMARY KEY,
  phone TEXT,
  email TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE pending_signups ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE pending_signups ADD COLUMN IF NOT EXISTS email TEXT;

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  title TEXT,
  origin TEXT,
  destination TEXT,
  depart_date DATE,
  return_date DATE,
  source TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trips_device_updated_idx
  ON trips (device_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL,
  device_id TEXT,
  kind TEXT NOT NULL,
  supplier_booking_id TEXT,
  pnr TEXT,
  payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  amount NUMERIC,
  currency TEXT DEFAULT 'INR',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bookings_supplier_uidx
  ON bookings (supplier_booking_id)
  WHERE supplier_booking_id IS NOT NULL AND btrim(supplier_booking_id) <> '';

CREATE INDEX IF NOT EXISTS bookings_payment_idx ON bookings (payment_id);
CREATE INDEX IF NOT EXISTS bookings_device_idx ON bookings (device_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  trip_id TEXT,
  device_id TEXT,
  provider TEXT NOT NULL DEFAULT 'stripe',
  amount NUMERIC,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'captured',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  payment_id TEXT,
  booking_id TEXT,
  trip_id TEXT,
  amount NUMERIC,
  currency TEXT DEFAULT 'INR',
  status TEXT,
  reason TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cancel_events (
  id TEXT PRIMARY KEY,
  booking_id TEXT,
  trip_id TEXT,
  supplier_booking_id TEXT,
  status TEXT,
  pending BOOLEAN NOT NULL DEFAULT false,
  cancellation_fee NUMERIC,
  refund_amount NUMERIC,
  destination TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Checkout intents — orphan recovery / analytics for Stripe Payment SDK path
CREATE TABLE IF NOT EXISTS payment_intents (
  id TEXT PRIMARY KEY,
  prebook_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  device_id TEXT,
  session_id TEXT,
  amount NUMERIC,
  currency TEXT NOT NULL DEFAULT 'INR',
  email TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  razorpay_payment_id TEXT,
  booking_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_intents_prebook_idx ON payment_intents (prebook_id, status);
CREATE INDEX IF NOT EXISTS payment_intents_payment_idx ON payment_intents (razorpay_payment_id);

-- Itinero Rewards (LiteAPI-backed earn rules; balance stored here)
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INT NOT NULL DEFAULT 0,
  pending_balance INT NOT NULL DEFAULT 0,
  lifetime_earned INT NOT NULL DEFAULT 0,
  liteapi_guest_id INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_point_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  guest_email TEXT,
  booking_id TEXT,
  booking_kind TEXT,
  points INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT NOT NULL,
  check_out_date DATE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  available_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS loyalty_events_user_idx
  ON loyalty_point_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS loyalty_events_email_idx
  ON loyalty_point_events (lower(guest_email), status)
  WHERE guest_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS loyalty_events_booking_idx
  ON loyalty_point_events (booking_id)
  WHERE booking_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS loyalty_redemptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points INT NOT NULL,
  discount_amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'reserved',
  booking_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS loyalty_redemptions_user_idx
  ON loyalty_redemptions (user_id, status, created_at DESC);

-- LiteAPI webhook delivery log (idempotency + audit)
CREATE TABLE IF NOT EXISTS liteapi_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS liteapi_webhook_events_name_idx
  ON liteapi_webhook_events (event_name, created_at DESC);

-- ── Itinero Marketing OS ──────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS acq_source TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS acq_medium TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS acq_campaign TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS landing_path TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_unsub_token_uidx
  ON users (unsubscribe_token) WHERE unsubscribe_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_uidx
  ON users (referral_code) WHERE referral_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_interests (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  home_airport TEXT,
  home_city TEXT,
  home_country TEXT,
  vibes JSONB NOT NULL DEFAULT '[]'::jsonb,
  destinations JSONB NOT NULL DEFAULT '[]'::jsonb,
  trip_styles JSONB NOT NULL DEFAULT '[]'::jsonb,
  budget_band TEXT,
  preferred_currency TEXT,
  mail_frequency TEXT NOT NULL DEFAULT 'daily',
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interest_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  lead_email TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  weight NUMERIC NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS interest_events_user_idx
  ON interest_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS interest_events_email_idx
  ON interest_events (lower(lead_email), created_at DESC)
  WHERE lead_email IS NOT NULL;

CREATE TABLE IF NOT EXISTS contact_scores (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  engagement NUMERIC NOT NULL DEFAULT 0,
  recency_days INT,
  booking_value NUMERIC NOT NULL DEFAULT 0,
  score NUMERIC NOT NULL DEFAULT 0,
  preferred_send_hour INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_leads (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  vibes JSONB NOT NULL DEFAULT '[]'::jsonb,
  acq_source TEXT,
  acq_medium TEXT,
  acq_campaign TEXT,
  landing_path TEXT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_leads_email_uidx
  ON marketing_leads (lower(email));

CREATE TABLE IF NOT EXISTS marketing_offers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  copy TEXT,
  image_url TEXT,
  targets JSONB NOT NULL DEFAULT '{}'::jsonb,
  discount_type TEXT NOT NULL DEFAULT 'percent',
  discount_value NUMERIC NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  max_redemptions INT,
  redemption_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_offers_code_uidx
  ON marketing_offers (lower(code));

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  lead_email TEXT,
  workflow TEXT NOT NULL,
  step TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS workflow_runs_due_idx
  ON workflow_runs (status, due_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS workflow_runs_user_wf_idx
  ON workflow_runs (user_id, workflow, step);

CREATE TABLE IF NOT EXISTS email_sends (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  campaign TEXT NOT NULL,
  template TEXT NOT NULL,
  variant TEXT,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_sends_user_campaign_idx
  ON email_sends (user_id, campaign, sent_at DESC);

CREATE TABLE IF NOT EXISTS email_engagement (
  id TEXT PRIMARY KEY,
  send_id TEXT NOT NULL REFERENCES email_sends(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_engagement_send_idx
  ON email_engagement (send_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  referrer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  referee_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reward_status TEXT NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS referrals_code_uidx ON referrals (lower(code));
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_user_id);

CREATE TABLE IF NOT EXISTS marketing_segments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ab_subject_locks (
  campaign TEXT PRIMARY KEY,
  winner_variant TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stats JSONB NOT NULL DEFAULT '{}'::jsonb
);
