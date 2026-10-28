import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import express from 'express';
import { createAuth, trustedOrigin } from '../services/auth.js';

test('login, reception isolation, logout, expiry, credential rotation and login throttling', async () => {
  let time = Date.now();
  const credentials = { username: 'admin', salt: 'test-salt', hash: scryptSync('test-password', 'test-salt', 64).toString('hex') };
  const auth = createAuth({ credentials, now: () => time });
  const app = express();
  app.use(express.json(), trustedOrigin);
  app.post('/login', auth.login);
  app.post('/logout', auth.logout);
  app.post('/reception', auth.reception);
  app.get('/me', auth.me);
  app.get('/admin', auth.requireAdmin, (_req, res) => res.json({ ok: true }));
  app.post('/scan', auth.requireSession, (_req, res) => res.json({ ok: true }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, { cookie, body, origin, method = body ? 'POST' : 'GET' } = {}) => fetch(base + url, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }), ...(origin && { Origin: origin }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const login = role => request('/login', { body: { username: 'admin', password: 'test-password', role } });
  try {
    assert.equal((await request('/admin')).status, 401);
    assert.equal((await request('/scan', { method: 'POST' })).status, 401);
    assert.equal((await request('/login', { body: {}, origin: 'https://evil.example' })).status, 403);
    const response = await login('admin');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);
    assert.match(response.headers.get('set-cookie'), /SameSite=Strict/);
    let cookie = response.headers.get('set-cookie').split(';')[0];
    assert.equal((await request('/admin', { cookie })).status, 200);
    assert.equal((await request('/reception', { cookie, method: 'POST' })).status, 200);
    assert.equal((await request('/admin', { cookie })).status, 403);
    assert.equal((await request('/scan', { cookie, method: 'POST' })).status, 200);
    assert.equal((await request('/logout', { cookie, method: 'POST' })).status, 200);
    assert.equal((await request('/me', { cookie })).status, 401);
    cookie = (await login('reception')).headers.get('set-cookie').split(';')[0];
    time += 13 * 60 * 60_000;
    assert.equal((await request('/scan', { cookie, method: 'POST' })).status, 401);
    cookie = (await login('admin')).headers.get('set-cookie').split(';')[0];
    credentials.hash = scryptSync('changed-password', credentials.salt, 64).toString('hex');
    assert.equal((await request('/admin', { cookie })).status, 401);
    for (let i = 0; i < 5; i++) assert.equal((await login('admin')).status, 401);
    assert.equal((await login('admin')).status, 429);
    time += 16 * 60_000;
    assert.equal((await login('admin')).status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
