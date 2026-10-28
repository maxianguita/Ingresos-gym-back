import { daysLeft, statusColor, toISODate, today } from '../utils/date.js';

export function accessDecision(client) {
  const endDate = toISODate(client.end_date);
  const startDate = toISODate(client.start_date);
  const left = daysLeft(endDate);
  const details = { client_id: client.id, name: client.name, days_left: Number.isFinite(left) ? left : null, status: statusColor(left), end_date: endDate };
  if (!Number.isFinite(left)) return { allowed: false, ...details, status: 'inactive', message: 'Fecha de membresía inválida. Acercate a recepción.' };
  if (left < 0) return { allowed: false, ...details, status: 'expired', message: 'Pase vencido. Por favor, acercate a renovar.' };
  if (client.is_active !== true) return { allowed: false, ...details, status: 'inactive', message: 'Pase inactivo. Acercate a recepción.' };
  if (startDate && startDate > today().toISODate()) return { allowed: false, ...details, status: 'inactive', message: 'Tu membresía todavía no comenzó. Acercate a recepción.' };
  return { allowed: true, ...details };
}
