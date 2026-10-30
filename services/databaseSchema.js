import { readFile } from 'node:fs/promises';
import { pool } from '../config/db.js';

export async function applySchema(connection) {
  for (const name of ['schema.sql', 'rfid.sql', 'payment-reminders.sql', 'management.sql']) {
    const sql = await readFile(new URL(`../sql/${name}`, import.meta.url), 'utf8');
    // La inicialización controla una única transacción para todos los archivos.
    await connection.query(sql.replace(/^\s*(?:BEGIN|COMMIT);\s*$/gim, ''));
  }
}

export async function initializeDatabase(db = pool) {
  const connection = await db.connect();
  try {
    await connection.query('BEGIN');
    await connection.query('SELECT pg_advisory_xact_lock(73190215)');
    await applySchema(connection);
    await connection.query('COMMIT');
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally { connection.release(); }
}
