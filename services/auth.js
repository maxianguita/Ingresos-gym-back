import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const adminFile = new URL('../.local/admin.json', import.meta.url);
const hashToken = token => createHash('sha256').update(token).digest('hex');
const cookieName = 'gym_session';

export function createAuth({ credentials, now = Date.now, secure = process.env.COOKIE_SECURE === 'true' } = {}) {
  const sessions = new Map();
  const attempts = new Map();
  function config() {
    if (credentials) return credentials;
    try { return JSON.parse(readFileSync(adminFile, 'utf8')); } catch { return null; }
  }
  function cookie(res, value, maxAge) {
    res.cookie(cookieName, value, { httpOnly: true, sameSite: 'strict', secure, path: '/', maxAge });
  }
  function session(req) {
    const token = String(req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!token) return null;
    const key = hashToken(token);
    const entry = sessions.get(key);
    if (!entry || entry.expires <= now()) { sessions.delete(key); return null; }
    // Rotar credenciales invalida también las sesiones abiertas.
    if (entry.version !== config()?.hash) { sessions.delete(key); return null; }
    return { ...entry, key };
  }
  function requireSession(req, res, next) {
    const entry = session(req);
    if (!entry) return res.status(401).json({ error: 'Ingresá para continuar' });
    req.session = entry;
    next();
  }
  function requireAdmin(req, res, next) {
    requireSession(req, res, () => {
      if (req.session.role !== 'admin') return res.status(403).json({ error: 'Se requiere acceso de administrador' });
      next();
    });
  }
  function login(req, res) {
    const time = now();
    for (const [key, value] of sessions) if (value.expires <= time) sessions.delete(key);
    for (const [key, value] of attempts) if (value.until <= time) attempts.delete(key);
    const address = req.ip;
    const attempt = attempts.get(address) || { count: 0, until: time + 15 * 60_000 };
    if (attempt.count >= 5) {
      res.set('Retry-After', String(Math.ceil((attempt.until - time) / 1000)));
      return res.status(429).json({ error: 'Demasiados intentos. Esperá 15 minutos.' });
    }
    const stored = config();
    if (!stored) return res.status(503).json({ error: 'Falta configurar el administrador en el servidor' });
    const { username, password, role = 'admin' } = req.body || {};
    const supplied = typeof password === 'string' && password.length <= 256
      ? scryptSync(password, stored.salt, 64) : Buffer.alloc(64);
    const expected = Buffer.from(stored.hash, 'hex');
    if (username !== stored.username || expected.length !== supplied.length || !timingSafeEqual(expected, supplied) || !['admin', 'reception'].includes(role)) {
      attempt.count++;
      attempts.set(address, attempt);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    attempts.delete(address);
    // Invalidar la sesión anterior al volver a ingresar.
    const old = session(req);
    if (old) sessions.delete(old.key);
    const token = randomBytes(32).toString('hex');
    const lifetime = 12 * 60 * 60_000;
    sessions.set(hashToken(token), { username: stored.username, role, expires: time + lifetime, version: stored.hash });
    cookie(res, token, lifetime);
    res.json({ username: stored.username, role });
  }
  function logout(req, res) {
    const entry = session(req);
    if (entry) sessions.delete(entry.key);
    cookie(res, '', 0);
    res.json({ ok: true });
  }
  function me(req, res) {
    const entry = session(req);
    if (!entry) return res.status(401).json({ error: 'Ingresá para continuar' });
    res.json({ username: entry.username, role: entry.role });
  }
  function reception(req, res) {
    requireSession(req, res, () => {
      const entry = sessions.get(req.session.key);
      entry.role = 'reception';
      res.json({ username: entry.username, role: entry.role });
    });
  }
  return { login, logout, me, reception, requireSession, requireAdmin };
}

export const auth = createAuth();

// Bloquear solicitudes de otros sitios incluso en el despliegue sin proxy.
export function trustedOrigin(req, res, next) {
  const allowed = [process.env.FRONTEND_URL || 'http://localhost:5173', `${req.protocol}://${req.get('host')}`];
  const origin = req.get('origin');
  if ((origin && !allowed.includes(origin)) || req.get('sec-fetch-site') === 'cross-site') {
    return res.status(403).json({ error: 'Origen no permitido' });
  }
  next();
}
