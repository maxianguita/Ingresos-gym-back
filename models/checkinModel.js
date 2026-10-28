// models/checkinModel.js
import { q } from '../config/db.js';

export async function createCheckin(client_id) {
  await q('INSERT INTO checkins (client_id) VALUES ($1)', [client_id]);
  return true;
}

export async function listByClient(client_id, limit = 50) {
  const { rows } = await q(
    `SELECT * FROM checkins
     WHERE client_id=$1
     ORDER BY scanned_at DESC
     LIMIT $2`,
    [client_id, limit]
  );
  return rows;
}
