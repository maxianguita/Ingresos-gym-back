import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { pool } from '../config/db.js';
import { applySchema } from '../services/databaseSchema.js';

test('fresh database is empty and initialization preserves existing clients and cards', async () => {
  const client = await pool.connect();
  const schema = `test_schema_${randomBytes(8).toString('hex')}`;
  try {
    await client.query('BEGIN');
    // Esquema aislado, completamente revertido al finalizar la prueba.
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await applySchema(client);
    for (const table of ['clients', 'checkins', 'payment_reminders']) {
      const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
      assert.equal(rows[0].count, 0);
    }
    await client.query(`INSERT INTO clients (dni,name,qr_token,email,phone,address,start_date,end_date,nfc_uid)
      VALUES ('12345678','Schema test','test-token','test@example.com','123','Test address','2030-01-01','2030-01-31','A1B2')`);
    await applySchema(client);
    const { rows } = await client.query('SELECT name,email,nfc_uid FROM clients');
    assert.deepEqual(rows, [{ name: 'Schema test', email: 'test@example.com', nfc_uid: 'A1B2' }]);
    await assert.rejects(client.query(`INSERT INTO clients (dni,name,qr_token,start_date,end_date,nfc_uid)
      VALUES ('87654321','Duplicate card','other-token','2030-01-01','2030-01-31','A1B2')`), { code: '23505' });
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
