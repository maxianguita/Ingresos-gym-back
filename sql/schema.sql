CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  dni VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  qr_token VARCHAR(64) NOT NULL UNIQUE,
  email TEXT,
  phone TEXT,
  address TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compatibilidad con instalaciones creadas antes de agregar datos de contacto.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address TEXT;

CREATE TABLE IF NOT EXISTS checkins (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkins_client_id ON checkins(client_id);
