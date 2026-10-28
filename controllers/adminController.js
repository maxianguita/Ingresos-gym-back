// controllers/adminController.js
import { DateTime } from 'luxon';
import { listExpiringUntil } from '../models/clientModel.js';

const TZ = process.env.TZ || 'America/Argentina/Buenos_Aires';

// GET /admin/expiring?days=5
export async function getExpiring(req, res) {
  const days = parseInt(req.query.days || '5', 10);
  const onlyUpcoming = req.query.onlyUpcoming === 'true'
  const now = DateTime.now().setZone(TZ).startOf('day');
  const limit = now.plus({ days }).endOf('day').toISODate();
  const rows = await listExpiringUntil(limit);
  res.json(rows);
}

// GET /admin/notify-expiring (stub)
export async function notifyExpiring(_req, res) {
  res.status(410).json({ error: 'Los recordatorios se envían automáticamente desde el programador del servidor.' });
}
