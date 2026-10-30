import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { accessDecision } from '../services/access.js';
import { today } from '../utils/date.js';
import { pool } from '../config/db.js';
import clientsRouter from '../routes/clients.js';

test('QR, DNI and NFC deny inactive/expired passes and accept the same card after renewal', async () => {
  const client = await pool.connect();
  const originalQuery = pool.query;
  // Los datos de integración viven en tablas temporales y se revierten al terminar.
  const { scanQR, scanByDni, scanNfc, publicPass, renewClient, bindNfc } = await import('../controllers/clientsController.js');
  const app = express();
  app.use(express.json());
  app.use('/api/clients', clientsRouter);
  app.post('/qr', scanQR); app.post('/dni', scanByDni); app.post('/nfc', scanNfc); app.get('/pass', publicPass);
  app.post('/clients/:id/renew', renewClient);
  app.post('/clients/:id/bind-nfc', bindNfc);
  app.use((_err, _req, res, _next) => res.status(500).json({ error: 'Test route error' }));
  let server;
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE clients (id SERIAL PRIMARY KEY, dni TEXT, name TEXT, email TEXT, qr_token TEXT, start_date DATE, end_date DATE, is_active BOOLEAN, is_paused BOOLEAN DEFAULT FALSE, nfc_uid TEXT, nfc_last_seen TIMESTAMPTZ, updated_at TIMESTAMPTZ)`);
    await client.query(`CREATE TEMP TABLE checkins (client_id INTEGER, scanned_at TIMESTAMPTZ DEFAULT NOW())`);
    pool.query = (...args) => client.query(...args);
    await client.query(`INSERT INTO clients (dni,name,qr_token,start_date,end_date,is_active,nfc_uid) VALUES ('12345678','Test',$1,$2,$3,true,'AB12')`, ['a'.repeat(32), today().toISODate(), today().plus({ days: 3 }).toISODate()]);
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const scan = (route, body) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const methods = [['/qr', { qr_token: 'a'.repeat(32) }], ['/dni', { dni: '12345678' }], ['/nfc', { uid: 'ab12' }]];
    assert.equal((await fetch(`${base}/api/clients`)).status, 401);
    assert.equal((await scan('/api/clients/scan-nfc', { uid: 'AB12' })).status, 401);
    for (const [route, body] of methods) assert.equal((await scan(route, body)).status, 200);
    const count = async () => (await client.query('SELECT COUNT(*)::int AS n FROM checkins')).rows[0].n;
    assert.equal(await count(), 3);
    assert.equal((await fetch(`${base}/pass?token=${'a'.repeat(32)}`)).status, 200);
    assert.equal(await count(), 3, 'consultar el pase no registra ingreso');
    await client.query('UPDATE clients SET is_paused=true');
    for (const [route, body] of methods) {
      const response = await scan(route, body);
      assert.equal(response.status, 403);
      assert.equal((await response.json()).status, 'paused');
    }
    assert.equal(await count(), 3, 'un socio pausado no registra asistencia');
    await client.query('UPDATE clients SET is_paused=false');
    await client.query('UPDATE clients SET is_active=false');
    for (const [route, body] of methods) assert.equal((await scan(route, body)).status, 403);
    await client.query('UPDATE clients SET is_active=true, end_date=$1', [today().minus({ days: 1 }).toISODate()]);
    for (const [route, body] of methods) {
      const response = await scan(route, body);
      assert.equal(response.status, 403);
      assert.equal((await response.json()).status, 'expired');
    }
    assert.equal(await count(), 3);
    assert.equal((await scan('/clients/1/renew', {})).status, 200);
    assert.equal((await scan('/nfc', { uid: 'AB12' })).status, 200);
    assert.equal(await count(), 4);
    await client.query(`INSERT INTO clients (dni,name,qr_token,start_date,end_date,is_active) VALUES ('87654321','Other',$1,$2,$2,true)`, ['b'.repeat(32), today().toISODate()]);
    assert.equal((await scan('/clients/2/bind-nfc', { uid: 'AB12' })).status, 409);
    const baseClient = { id: 1, name: 'Test', start_date: today().toISODate(), end_date: today().toISODate(), is_active: true };
    assert.equal(accessDecision(baseClient).allowed, true, 'el pase vale durante el día de vencimiento');
    assert.equal(accessDecision({ ...baseClient, end_date: null }).allowed, false);
    assert.equal(accessDecision({ ...baseClient, start_date: today().plus({ days: 1 }).toISODate() }).allowed, false);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    pool.query = originalQuery;
    await client.query('ROLLBACK'); client.release(); await pool.end();
  }
});
