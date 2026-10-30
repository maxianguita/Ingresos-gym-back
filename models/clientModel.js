// models/clientModel.js
import { q } from '../config/db.js';
import { today } from '../utils/date.js';

// models/clientModel.js
export async function createClient({
  dni,
  name,
  qr_token,
  startISO,
  endISO,
  email = null,
  phone = null,
  address = null,
}) {
  const { rows } = await q(
    `INSERT INTO clients (dni, name, qr_token, start_date, end_date, is_active, email, phone, address)
     VALUES ($1,$2,$3,$4,$5,true,$6,$7,$8)
     RETURNING id, dni, name, qr_token, email, phone, address`,
    [dni, name, qr_token, startISO, endISO, email, phone, address]
  );
  return rows[0];
}


export async function findById(id) {
  const { rows } = await q('SELECT * FROM clients WHERE id=$1', [id]);
  return rows[0] || null;
}

export async function findByDni(dni) {
  const { rows } = await q('SELECT * FROM clients WHERE dni=$1', [dni]);
  return rows[0] || null;
}

export async function findByQrToken(token) {
  const { rows } = await q('SELECT * FROM clients WHERE qr_token=$1', [token]);
  return rows[0] || null;
}

export async function updateDates({ id, startISO, endISO }) {
  const { rows } = await q(
    `UPDATE clients
     SET start_date=$1, end_date=$2, updated_at=NOW(), is_active=true
     WHERE id=$3
     RETURNING *`,
    [startISO, endISO, id]
  );
  return rows[0] || null;
}

export async function listExpiringUntil(limitISO) {
  const { rows } = await q(
    `SELECT * FROM clients
     WHERE is_active = true AND end_date <= $1
     ORDER BY end_date ASC`,
    [limitISO]
  );
  return rows;
}

export async function deactivateExpired() {
  const { rowCount } = await q(
    `UPDATE clients
     SET is_active=false, updated_at=NOW()
     WHERE end_date < $1::date AND is_active=true`,
    [today().toISODate()]
  );
  return rowCount;
}
 export async function bindNfcUid({ id, uid }) {
  const norm = String(uid).replace(/[^0-9a-f]/gi, '').toUpperCase();
  const { rows } = await q(
    `UPDATE clients
       SET nfc_uid = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, dni, name, nfc_uid`,
    [norm, id]
  );
  return rows[0] || null;
}

export async function findByNfcUid(uid) {
  const norm = String(uid).replace(/[^0-9a-f]/gi, '').toUpperCase();
  const { rows } = await q(`SELECT * FROM clients WHERE nfc_uid = $1`, [norm]);
  return rows[0] || null;
}

export async function touchNfcSeen(id) {
  await q(`UPDATE clients SET nfc_last_seen = NOW() WHERE id = $1`, [id]);
  return true;
}

// (opcional) para desasociar una tarjeta
export async function unbindNfc(id) {
  const { rows } = await q(
    `UPDATE clients SET nfc_uid = NULL, updated_at = NOW()
     WHERE id = $1
     RETURNING id, dni, name, nfc_uid`,
    [id]
  );
  return rows[0] || null;
}

// LISTAR con búsqueda opcional y paginado
export async function listClients({ qtext = '', limit = 12, offset = 0, filter = 'all', todayISO } = {}) {
  const search = `%${qtext.replace(/[\\%_]/g, '\\$&')}%`;
  const base = `FROM clients WHERE (name ILIKE $1 OR dni ILIKE $1)`;
  const { rows: [stats] } = await q(`
    SELECT COUNT(*)::int AS all,
      COUNT(*) FILTER (WHERE is_active AND NOT is_paused AND end_date - $2::date > 7)::int AS ok,
      COUNT(*) FILTER (WHERE is_active AND NOT is_paused AND end_date - $2::date BETWEEN 0 AND 7)::int AS warn,
      COUNT(*) FILTER (WHERE end_date < $2::date)::int AS off,
      COUNT(*) FILTER (WHERE is_paused)::int AS paused
    ${base}
  `, [search, todayISO]);
  const conditions = {
    all: 'TRUE',
    ok: 'is_active AND NOT is_paused AND end_date - $2::date > 7',
    warn: 'is_active AND NOT is_paused AND end_date - $2::date BETWEEN 0 AND 7',
    off: 'end_date < $2::date',
    paused: 'is_paused',
  };
  const selected = Object.hasOwn(conditions, filter) ? filter : 'all';
  const { rows } = await q(`
    SELECT id, dni, name, is_active, is_paused,
      to_char(start_date, 'YYYY-MM-DD') AS start_date,
      to_char(end_date, 'YYYY-MM-DD') AS end_date,
      end_date - $2::date AS days_left
    ${base} AND (${conditions[selected]})
    ORDER BY name ASC, id ASC
    LIMIT $3 OFFSET $4
  `, [search, todayISO, limit, offset]);

  return { rows, total: stats[selected], counts: stats };
}
 // DELETE /clients/:id
export async function deleteClientById(id) {
  const { rows } = await q(
    `DELETE FROM clients
     WHERE id = $1
     RETURNING id, dni, name`,
    [id]
  );
  return rows[0] || null;
}
