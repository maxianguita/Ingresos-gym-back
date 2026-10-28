CREATE TABLE IF NOT EXISTS payment_reminders (
  id BIGSERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  end_date DATE NOT NULL,
  recipient TEXT NOT NULL,
  client_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  provider_id TEXT,
  attempted_at TIMESTAMPTZ,
  UNIQUE (client_id, end_date)
);
ALTER TABLE payment_reminders ADD COLUMN IF NOT EXISTS attempted_at TIMESTAMPTZ;
