import { Router } from 'express';
import { DateTime } from 'luxon';
import { pool } from '../config/db.js';
import { auth } from '../services/auth.js';
import { accessDecision } from '../services/access.js';
import { today, toISODate, TZ } from '../utils/date.js';

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function id(value) { if (!/^[1-9]\d{0,9}$/.test(String(value)) || Number(value) > 2147483647) fail('Socio inválido'); return Number(value); }
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !DateTime.fromISO(value, { zone: TZ }).isValid) fail('Fecha inválida');
  return value;
}
function period(query) {
  const from = date(query.from || today().minus({ days: 29 }).toISODate());
  const to = date(query.to || today().toISODate());
  if (from > to || DateTime.fromISO(to).diff(DateTime.fromISO(from), 'days').days > 366) fail('Elegí un período de hasta un año');
  return { from, to, start: DateTime.fromISO(from, { zone: TZ }).toISO(), end: DateTime.fromISO(to, { zone: TZ }).plus({ days: 1 }).toISO() };
}
function paging(query) { const page = Number(query.page || 1); if (!Number.isSafeInteger(page) || page < 1 || page > 100000) fail('Página inválida'); return { page, limit: 25, offset: (page - 1) * 25 }; }
const member = row => ({ ...row, start_date: toISODate(row.start_date), end_date: toISODate(row.end_date), ...accessDecision(row) });

export function createManagementRouter(db = pool, authorize = auth.requireAdmin) {
  const router = Router();
  router.use(authorize);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  async function transaction(work) {
    const connection = await db.connect();
    try { await connection.query('BEGIN'); const result = await work(connection); await connection.query('COMMIT'); return result; }
    catch (error) { await connection.query('ROLLBACK'); throw error; }
    finally { connection.release(); }
  }
  async function locked(connection, clientId) {
    const { rows } = await connection.query('SELECT * FROM clients WHERE id=$1 FOR UPDATE', [clientId]);
    if (!rows[0]) fail('Socio no encontrado', 404);
    return rows[0];
  }
  router.get('/clients/:id', async (req, res) => {
    const clientId = id(req.params.id);
    const { rows } = await db.query('SELECT * FROM clients WHERE id=$1', [clientId]);
    if (!rows[0]) fail('Socio no encontrado', 404);
    const payments = await db.query('SELECT * FROM payments WHERE client_id=$1 ORDER BY paid_on DESC,id DESC LIMIT 25', [clientId]);
    const cards = await db.query('SELECT uid,reason,blocked_at,blocked_by FROM blocked_nfc_uids WHERE client_id=$1 ORDER BY blocked_at DESC LIMIT 20', [clientId]);
    res.json({ client: member(rows[0]), payments: payments.rows, blocked_cards: cards.rows });
  });
  router.patch('/clients/:id', async (req, res) => {
    const clientId = id(req.params.id);
    const allowed = ['dni','name','email','phone','address'];
    const body = req.body || {};
    if (!Object.keys(body).length || Object.keys(body).some(key => !allowed.includes(key))) fail('Campos de edición inválidos');
    const values = {};
    for (const key of Object.keys(body)) {
      if (body[key] !== null && typeof body[key] !== 'string') fail('Datos de contacto inválidos');
      values[key] = String(body[key] || '').trim();
    }
    if ('dni' in values && !/^\d{7,9}$/.test(values.dni)) fail('El DNI debe tener entre 7 y 9 números');
    if ('name' in values && (!values.name || values.name.length > 120)) fail('Nombre requerido, hasta 120 caracteres');
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) fail('Email inválido');
    if ((values.email?.length || 0) > 254 || (values.phone?.length || 0) > 40 || (values.address?.length || 0) > 500) fail('Los datos de contacto son demasiado largos');
    const keys = Object.keys(values);
    const { rows } = await db.query(`UPDATE clients SET ${keys.map((key, index) => `${key}=$${index + 2}`).join(',')},updated_at=NOW() WHERE id=$1 RETURNING *`, [clientId, ...keys.map(key => values[key] || null)]);
    if (!rows[0]) fail('Socio no encontrado', 404);
    res.json(member(rows[0]));
  });
  router.post('/clients/:id/state', async (req, res) => {
    if (typeof req.body?.paused !== 'boolean') fail('Indicá si la membresía queda pausada');
    const { rows } = await db.query('UPDATE clients SET is_paused=$2,is_active=CASE WHEN $2 THEN is_active ELSE end_date >= $3::date END,updated_at=NOW() WHERE id=$1 RETURNING *', [id(req.params.id), req.body.paused, today().toISODate()]);
    if (!rows[0]) fail('Socio no encontrado', 404);
    res.json(member(rows[0]));
  });
  router.post('/clients/:id/payments', async (req, res) => {
    const clientId = id(req.params.id);
    const body = req.body || {};
    const amount = String(body.amount ?? '');
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) fail('Ingresá un monto positivo con hasta dos decimales');
    if (!['cash','transfer','debit','credit','other'].includes(body.method)) fail('Medio de pago inválido');
    const days = body.renewal_days ?? 30;
    if (!Number.isInteger(days) || days < 0 || days > 365) fail('Los días de renovación deben estar entre 0 y 365');
    const paidOn = date(body.paid_on || today().toISODate());
    if (paidOn > today().toISODate()) fail('No se puede registrar un pago futuro');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id || '')) fail('Identificador de pago inválido');
    if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 500)) fail('Notas de hasta 500 caracteres');
    const notes = (body.notes || '').trim();
    const result = await transaction(async connection => {
      // Serializar también reintentos simultáneos del mismo cobro.
      await connection.query('SELECT pg_advisory_xact_lock(hashtext($1))', [body.request_id]);
      const client = await locked(connection, clientId);
      const existing = await connection.query('SELECT * FROM payments WHERE request_id=$1', [body.request_id]);
      if (existing.rows[0]) {
        const old = existing.rows[0];
        if (old.client_id !== clientId || Number(old.amount) !== Number(amount) || old.method !== body.method || old.renewal_days !== days || toISODate(old.paid_on) !== paidOn || old.notes !== notes) fail('Este identificador ya pertenece a otro pago', 409);
        return { payment: old, client: member(client), repeated: true };
      }
      const previous = toISODate(client.end_date);
      let next = previous;
      if (days) {
        const start = previous < today().toISODate() ? today().toISODate() : toISODate(client.start_date);
        next = DateTime.fromISO(previous < today().toISODate() ? today().toISODate() : previous, { zone: TZ }).plus({ days }).toISODate();
        const updated = await connection.query('UPDATE clients SET start_date=$2,end_date=$3,is_active=true,is_paused=false,updated_at=NOW() WHERE id=$1 RETURNING *', [clientId, start, next]);
        Object.assign(client, updated.rows[0]);
      }
      const payment = await connection.query(`INSERT INTO payments (client_id,request_id,amount,method,paid_on,renewal_days,previous_end_date,new_end_date,notes,recorded_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [clientId, body.request_id, amount, body.method, paidOn, days, previous, next, notes, req.session.username]);
      return { payment: payment.rows[0], client: member(client), repeated: false };
    });
    res.status(result.repeated ? 200 : 201).json(result);
  });
  async function changeCard(req, res, remove = false) {
    const clientId = id(req.params.id);
    const uid = String(req.body?.uid || '').trim().toUpperCase();
    if (!remove && !/^[0-9A-F]{4,40}$/.test(uid)) fail('Código de llavero inválido (4 a 40 caracteres hexadecimales)');
    const reason = remove ? 'Llavero perdido o bloqueado' : 'Reemplazo de llavero';
    const result = await transaction(async connection => {
      const client = await locked(connection, clientId);
      for (const card of [...new Set([client.nfc_uid, remove ? null : uid].filter(Boolean))].sort()) {
        await connection.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`card:${card}`]);
      }
      if (!remove) {
        const blocked = await connection.query('SELECT uid FROM blocked_nfc_uids WHERE uid=$1', [uid]);
        if (blocked.rows.length) fail('Este llavero está bloqueado y no se puede reutilizar', 409);
        const assigned = await connection.query('SELECT id FROM clients WHERE nfc_uid=$1 AND id<>$2', [uid, clientId]);
        if (assigned.rows.length) fail('Este llavero pertenece a otro socio', 409);
      }
      if (client.nfc_uid && (remove || client.nfc_uid !== uid)) {
        await connection.query('INSERT INTO blocked_nfc_uids (uid,client_id,reason,blocked_by) VALUES ($1,$2,$3,$4) ON CONFLICT (uid) DO NOTHING', [client.nfc_uid, clientId, reason, req.session.username]);
      }
      const updated = await connection.query('UPDATE clients SET nfc_uid=$2,updated_at=NOW() WHERE id=$1 RETURNING *', [clientId, remove ? null : uid]);
      return member(updated.rows[0]);
    });
    res.json(result);
  }
  router.post('/clients/:id/cards', (req, res) => changeCard(req, res));
  router.delete('/clients/:id/cards', (req, res) => changeCard(req, res, true));
  // Compatibilidad con la pantalla anterior de vinculación.
  router.post('/clients/:id/bind-nfc', (req, res) => changeCard(req, res));
  router.get('/checkins', async (req, res) => {
    const dates = period(req.query);
    const page = paging(req.query);
    const clientId = req.query.client_id ? id(req.query.client_id) : null;
    const parameters = [dates.start, dates.end, clientId];
    const where = 'FROM checkins k JOIN clients c ON c.id=k.client_id WHERE k.scanned_at >= $1::timestamptz AND k.scanned_at < $2::timestamptz AND ($3::int IS NULL OR c.id=$3)';
    const count = await db.query(`SELECT COUNT(*)::int AS total ${where}`, parameters);
    const entries = await db.query(`SELECT k.id,k.client_id,k.scanned_at,c.name,c.dni ${where} ORDER BY k.scanned_at DESC,k.id DESC LIMIT $4 OFFSET $5`, [...parameters, page.limit, page.offset]);
    res.json({ data: entries.rows, total: count.rows[0].total, page: page.page, limit: page.limit });
  });
  router.get('/dashboard', async (_req, res) => {
    const now = today();
    const counts = await db.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER(WHERE is_active AND NOT is_paused AND start_date <= $1 AND end_date >= $1)::int AS active,
      COUNT(*) FILTER(WHERE is_active AND NOT is_paused AND end_date BETWEEN $1 AND $1::date+7)::int AS expiring,
      COUNT(*) FILTER(WHERE end_date < $1)::int AS expired,
      COUNT(*) FILTER(WHERE is_paused)::int AS paused FROM clients`, [now.toISODate()]);
    const visits = await db.query('SELECT COUNT(*)::int AS entries,COUNT(DISTINCT client_id)::int AS unique_members FROM checkins WHERE scanned_at >= $1 AND scanned_at < $2', [now.toISO(), now.plus({ days: 1 }).toISO()]);
    const payments = await db.query('SELECT COUNT(*)::int AS payments,COALESCE(SUM(amount),0)::text AS total_amount FROM payments WHERE paid_on=$1', [now.toISODate()]);
    const entries = await db.query('SELECT k.id,k.client_id,k.scanned_at,c.name,c.dni FROM checkins k JOIN clients c ON c.id=k.client_id WHERE k.scanned_at >= $1 AND k.scanned_at < $2 ORDER BY k.scanned_at DESC,k.id DESC LIMIT 10', [now.toISO(), now.plus({ days: 1 }).toISO()]);
    const expiring = await db.query('SELECT id,name,dni,to_char(end_date,\'YYYY-MM-DD\') AS end_date FROM clients WHERE is_active AND NOT is_paused AND end_date BETWEEN $1 AND $1::date+7 ORDER BY end_date,id LIMIT 10', [now.toISODate()]);
    res.json({ date: now.toISODate(), counts: counts.rows[0], today: { ...visits.rows[0], ...payments.rows[0] }, entries: entries.rows, expiring: expiring.rows });
  });
  router.use((error, _req, res, _next) => {
    if (error.code === '23505') return res.status(409).json({ error: 'El DNI, llavero o pago ya está registrado' });
    if (!error.status) console.error('[gestión]', error.code || error.message);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'No se pudo completar la operación' });
  });
  return router;
}

export default createManagementRouter();
