ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  request_id UUID NOT NULL UNIQUE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency = 'ARS'),
  method TEXT NOT NULL CHECK (method IN ('cash','transfer','debit','credit','other')),
  paid_on DATE NOT NULL,
  renewal_days INTEGER NOT NULL CHECK (renewal_days BETWEEN 0 AND 365),
  previous_end_date DATE NOT NULL,
  new_end_date DATE NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  recorded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payments_client_date ON payments (client_id, paid_on DESC, id DESC);
CREATE INDEX IF NOT EXISTS payments_date ON payments (paid_on);
CREATE INDEX IF NOT EXISTS checkins_scanned_at ON checkins (scanned_at DESC);
CREATE TABLE IF NOT EXISTS blocked_nfc_uids (
  uid TEXT PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  blocked_by TEXT NOT NULL,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
