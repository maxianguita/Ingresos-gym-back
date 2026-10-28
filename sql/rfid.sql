-- Ejecutar una vez antes de vincular llaveros. No reemplaza tarjetas existentes.
BEGIN;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS nfc_uid TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS nfc_last_seen TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS clients_nfc_uid_unique ON clients (nfc_uid);
COMMIT;
