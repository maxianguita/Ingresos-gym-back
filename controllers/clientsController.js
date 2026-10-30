// controllers/clientsController.js
import crypto from 'crypto';
import { accessDecision } from '../services/access.js';
import { DateTime } from 'luxon';
import { today, addDays, daysLeft, statusColor, toISODate, TZ } from '../utils/date.js';

import {
  createClient as createClientRow,
  findById, findByQrToken, findByDni,
  updateDates,
  bindNfcUid, findByNfcUid, touchNfcSeen, deleteClientById
} from '../models/clientModel.js';
import { listClients } from '../models/clientModel.js';
import { createCheckin } from '../models/checkinModel.js';

// --- Helper de formateo de fechas ---
function fmt(dbDate) {
  const iso = toISODate(dbDate); // "YYYY-MM-DD"
  const human = iso
    ? DateTime.fromISO(iso, { zone: TZ }).toFormat('dd/LL/yyyy') // "03/10/2025"
    : null;
  return { iso, human };
}


// GET /clients?page=1&limit=20&q=texto
export async function listAll(req, res) {
  try {
    const pageValue = Number(req.query.page);
    const limitValue = Number(req.query.limit);
    const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1;
    const limit = Number.isSafeInteger(limitValue) && limitValue > 0 ? Math.min(100, limitValue) : 12;
    const qtext = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const filter = ['all', 'ok', 'warn', 'off', 'paused'].includes(req.query.filter) ? req.query.filter : 'all';
    const offset = (page - 1) * limit;

    const result = await listClients({ qtext, limit, offset, filter, todayISO: today().toISODate() });

    return res.json({
      data: result.rows,
      total: result.total,
      counts: result.counts,
      page,
      limit
    });

  } catch (e) {
    console.error("💥 ERROR:", e);

    return res.status(500).json({
      error: "Error listando clientes",
      detalle: e.message
    });
  }
}
// POST /clients
// controllers/clientsController.js
export async function createClient(req, res) {
  try {
    const body = req.body || {};

    // Tomo las props crudas del body (pueden venir undefined)
    const dniRaw = body.dni;
    const nameRaw = body.name;
    const emailRaw = body.email;
    const phoneRaw = body.phone;
    const addressRaw = body.address;

    // Normalizo con valores por defecto para no referenciar undefined
    const dni = String(dniRaw ?? '').replace(/\D/g, '');
    const name = String(nameRaw ?? '').trim();
    const email = emailRaw != null ? String(emailRaw).trim() : null;
    const phone = phoneRaw != null ? String(phoneRaw).trim() : null;
    const address = addressRaw != null ? String(addressRaw).trim() : null;

    // Validaciones mínimas
    if (!/^\d{7,9}$/.test(dni) || !name || name.length > 120) {
      return res.status(400).json({ error: 'dni y name son requeridos' });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email inválido' });

    const start = today();
    const end = addDays(start, 30);
    const qr_token = crypto.randomBytes(16).toString('hex');

    const created = await createClientRow({
      dni,
      name,
      qr_token,
      startISO: start.toISODate(),
      endISO: end.toISODate(),
      email,
      phone,
      address,
    });

    return res.status(201).json(created);
  } catch (e) {
    if (e && e.code === '23505') {
      return res.status(409).json({ error: 'DNI ya registrado' });
    }
    console.error('createClient error:', e);
    return res.status(500).json({ error: 'Error creando cliente' });
  }
}

// GET /clients/:id/status
export async function clientStatus(req, res) {
  const c = await findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'No encontrado' });

  const endISO = toISODate(c.end_date);
  const left = daysLeft(endISO);

  const start = fmt(c.start_date);
  const end = fmt(c.end_date);

  return res.json({
    dni: c.dni,
    name: c.name,

    start_date: start.iso,
    end_date: end.iso,
    start_date_human: start.human,
    end_date_human: end.human,

    days_left: left,
    status: accessDecision(c).status,
  });
}

// GET /clients/by-dni?dni=XXXX
export async function findByDniHandler(req, res) {
  let { dni } = req.query || {};
  if (!dni) return res.status(400).json({ error: 'dni requerido' });

  const digits = String(dni).replace(/\D/g, '');
  const c = await findByDni(digits);
  if (!c) return res.status(404).json({ error: 'No encontrado' });

  const endISO = toISODate(c.end_date);
  const left = daysLeft(endISO);

  const start = fmt(c.start_date);
  const end = fmt(c.end_date);

  return res.json({
    id: c.id,
    dni: c.dni,
    name: c.name,

    // Fechas claras
    start_date: start.iso,
    end_date: end.iso,
    start_date_human: start.human,
    end_date_human: end.human,

    days_left: left,
    status: accessDecision(c).status,
  });
}


// DELETE /clients/:id

export async function deleteClient(req, res) {
  const { id } = req.params;

  try {
    const client = await findById(id);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

    const deleted = await deleteClientById(id);

    if (!deleted) {
      // Esto puede pasar si hay restricciones de FK, o no se eliminó nada
      return res.status(400).json({ error: 'No se pudo eliminar el cliente, verifica dependencias' });
    }

    return res.json({ message: `Cliente "${client.name}" eliminado correctamente`, id: client.id });
  } catch (err) {
    console.error('Error borrando cliente:', err);

    // Detectar error de FK (Postgres code 23503)
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'Este socio tiene pagos registrados. Conservá su historial y pausá la membresía.'
      });
    }

    return res.status(500).json({ error: 'Error eliminando cliente' });
  }
}

// Las tres formas de ingreso usan la misma validación.
async function recordEntry(c, res, nfc = false) {
  const decision = accessDecision(c);
  const { allowed, ...details } = decision;
  const dates = { start_date: fmt(c.start_date).iso, end_date: fmt(c.end_date).iso,
    start_date_human: fmt(c.start_date).human, end_date_human: fmt(c.end_date).human };
  if (!allowed) return res.status(403).json({ ...details, ...dates });
  await createCheckin(c.id);
  if (nfc) await touchNfcSeen(c.id);
  return res.json({ ...details, ...dates });
}

export async function publicPass(req, res) {
  const token = req.query.token;
  if (typeof token !== 'string' || !/^[0-9a-f]{32}$/i.test(token)) return res.status(400).json({ error: 'Código inválido' });
  const c = await findByQrToken(token);
  if (!c) return res.status(404).json({ error: 'Pase no encontrado' });
  const decision = accessDecision(c);
  const { allowed, name, days_left, status, end_date, message } = decision;
  res.set('Cache-Control', 'no-store');
  // Consultar un pase personal no registra asistencia.
  return res.json({ name, days_left, status, end_date, message, valid: allowed });
}

export async function scanQR(req, res) {
  const { qr_token } = req.body || {};
  if (typeof qr_token !== 'string' || !/^[0-9a-f]{32}$/i.test(qr_token)) return res.status(400).json({ error: 'QR inválido' });
  const c = await findByQrToken(qr_token);
  if (!c) return res.status(404).json({ error: 'QR inválido' });
  return recordEntry(c, res);
}

export async function scanByDni(req, res) {
  const digits = String(req.body?.dni ?? '').replace(/\D/g, '');
  if (!/^\d{7,9}$/.test(digits)) return res.status(400).json({ error: 'DNI inválido' });
  const c = await findByDni(digits);
  if (!c) return res.status(404).json({ error: 'No encontrado' });
  return recordEntry(c, res);
}

// GET /clients/:id/qr-link
export async function getQrLink(req, res) {
  const c = await findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'No encontrado' });
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const url = `${base}/my-pass?t=${c.qr_token}`;
  res.json({ id: c.id, name: c.name, url });
}

// POST /clients/:id/renew
export async function renewClient(req, res) {
  const c = await findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'No encontrado' });

  const nowISO = today().toISODate();
  const endISO = toISODate(c.end_date);
  const left = daysLeft(endISO);

  let newStartISO = c.start_date;
  let newEndISO;

  if (left < 0) {
    newStartISO = nowISO;
    newEndISO = addDays(today(), 30).toISODate();
  } else {
    newEndISO = addDays(DateTime.fromISO(endISO), 30).toISODate();
  }

  const u = await updateDates({ id: c.id, startISO: newStartISO, endISO: newEndISO });
  const left2 = daysLeft(toISODate(u.end_date));

  const start = fmt(u.start_date);
  const end = fmt(u.end_date);

  return res.json({
    id: u.id,
    dni: u.dni,
    name: u.name,

    start_date: start.iso,
    end_date: end.iso,
    start_date_human: start.human,
    end_date_human: end.human,

    days_left: left2,
    status: statusColor(left2),
  });
}

export async function bindNfc(req, res) {
  const { id } = req.params;
  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: 'uid requerido' });

  const norm = String(uid).replace(/[^0-9a-f]/gi, '').toUpperCase();
  if (!/^[0-9a-f]+$/i.test(String(uid).trim())) {
    return res.status(400).json({ error: 'Código de llavero inválido' });
  }

  const c = await findById(id);
  if (!c) return res.status(404).json({ error: 'No encontrado' });

  const assigned = await findByNfcUid(norm);
  if (assigned && String(assigned.id) !== String(id)) {
    return res.status(409).json({ error: 'Este llavero ya pertenece a otro cliente' });
  }
  try {
    const out = await bindNfcUid({ id, uid: norm });
    return res.json(out);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Este llavero ya pertenece a otro cliente' });
    }
    throw error;
  }
}

export async function scanNfc(req, res) {
  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: 'uid requerido' });
  if (!/^[0-9a-f]+$/i.test(String(uid).trim())) {
    return res.status(400).json({ error: 'Código de llavero inválido' });
  }

  const norm = String(uid).replace(/[^0-9a-f]/gi, '').toUpperCase();
  const c = await findByNfcUid(norm);
  if (!c) return res.status(404).json({ error: 'Tarjeta no vinculada' });
  return recordEntry(c, res, true);
}
