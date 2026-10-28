// utils/date.js
import { DateTime } from 'luxon';

export const TZ = process.env.TZ || 'America/Argentina/Buenos_Aires';

/**
 * Si COUNT_TODAY = false:
 *  - Alta hoy con end_date = hoy + 30 → muestra 30
 * Si COUNT_TODAY = true:
 *  - Muestra 31 (cuenta el día en curso completo)
 */
const COUNT_TODAY = false;

export const today = () => DateTime.now().setZone(TZ).startOf('day');

/**
 * addDays: suma días a un DateTime de Luxon o a un string 'YYYY-MM-DD'
 */
export function addDays(d, n) {
  const base = typeof d === 'string' ? DateTime.fromISO(d, { zone: TZ }) : d;
  return base.plus({ days: n });
}

/**
 * daysLeft: calcula días restantes contra hoy
 * endDateISO debe ser 'YYYY-MM-DD'
 */
export function daysLeft(endDateISO) {
  const end = DateTime.fromISO(endDateISO, { zone: TZ }).endOf('day');
  const now = today();
  const diff = end.diff(now, 'days').days;
  return COUNT_TODAY ? Math.ceil(diff) : Math.floor(diff);
}

/**
 * statusColor: mapea días → estado
 */
export function statusColor(days) {
  if (days < 0) return 'expired';  // rojo
  if (days <= 3) return 'danger';  // rojo
  if (days <= 7) return 'warning'; // amarillo
  return 'ok';                     // verde
}

/**
 * toISODate: normaliza fecha de Postgres a 'YYYY-MM-DD'
 * PG suele devolver DATE como string. Esto evita usar .toISOString() sobre string.
 */
export function toISODate(dbDate) {
  if (!dbDate) return null;
  if (typeof dbDate === 'string') return dbDate.slice(0, 10);
  if (dbDate instanceof Date) return dbDate.toISOString().slice(0, 10);
  if (typeof dbDate?.toISODate === 'function') return dbDate.toISODate(); // Luxon
  try { return String(dbDate).slice(0, 10); } catch { return null; }
}
