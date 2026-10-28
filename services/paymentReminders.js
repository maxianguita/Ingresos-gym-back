import { DateTime } from 'luxon';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/db.js';
import { TZ } from '../utils/date.js';

const logoCid = 'primal-logo@gym-pass';
const logoPath = fileURLToPath(new URL('../assets/email/primal-logo.jpeg', import.meta.url));
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export function reminderMessage(name, endDate) {
  const date = DateTime.fromISO(endDate).toFormat('dd/LL/yyyy');
  return {
    subject: 'Tu pase de Primal Strength vence en 3 días',
    text: `Hola socio!! Tu pase de Primal Strength vence el ${date}, dentro de 3 días. Recordá actualizar tu pago en recepción para seguir entrenando. Si ya renovaste, podés ignorar este mensaje. ¡Te esperamos!`,
    html: `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f2f2f2;font-family:Arial,Helvetica,sans-serif;color:#202020;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f2f2;"><tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;">
      <tr><td align="center" bgcolor="#000000" style="padding:12px;background-color:#000000;border-bottom:4px solid #e00020;">
        <img src="cid:${logoCid}" alt="Primal Strength" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0;">
      </td></tr>
      <tr><td style="padding:32px 24px;">
        <p style="margin:0 0 12px;color:#b00019;font-size:12px;font-weight:bold;letter-spacing:2px;">RECORDATORIO DE TU PASE</p>
        <h1 style="margin:0 0 24px;font-size:26px;line-height:1.25;">¡Seguí entrenando con nosotros!</h1>
        <p style="font-size:16px;line-height:1.6;">Hola socio!!</p>
        <p style="font-size:16px;line-height:1.6;">Tu pase de <strong>Primal Strength</strong> vence dentro de <strong>3 días</strong>.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:20px;background-color:#f5f5f5;border-left:4px solid #e00020;">
          <p style="margin:0 0 8px;font-size:12px;color:#555555;">FECHA DE VENCIMIENTO</p>
          <p style="margin:0;font-size:24px;font-weight:bold;">${escapeHtml(date)}</p>
        </td></tr></table>
        <p style="font-size:16px;line-height:1.6;">Recordá actualizar tu pago en recepción para seguir entrenando.</p>
        <p style="font-size:14px;line-height:1.6;color:#555555;">Si ya renovaste, podés ignorar este mensaje.</p>
        <p style="margin:24px 0 0;font-size:16px;font-weight:bold;">¡Te esperamos!<br>Equipo Primal Strength</p>
      </td></tr>
      <tr><td align="center" style="padding:20px;background-color:#eeeeee;font-size:12px;color:#555555;">Primal Strength · Recordatorio automático de tu membresía</td></tr>
    </table>
  </td></tr></table>
</body></html>`,
    attachments: [{
      filename: 'primal-logo.jpeg', path: logoPath, cid: logoCid,
      contentType: 'image/jpeg', contentDisposition: 'inline',
    }],
  };
}

export function createGmailTransport() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) throw new Error('Falta configurar Gmail');
  return nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: process.env.GMAIL_USER.trim(), pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, '') },
    connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 30000,
  });
}

export async function sendReminderEmail(reminder, transport = createGmailTransport()) {
  const data = await transport.sendMail({
    from: { name: 'Primal Strength', address: process.env.GMAIL_USER.trim() },
    to: reminder.recipient,
    messageId: `<gym-payment-reminder-${reminder.id}@${process.env.GMAIL_USER.trim().split('@')[1]}>`,
    ...reminderMessage(reminder.client_name, reminder.end_date),
  });
  if (!data.accepted?.length) throw new Error('Gmail no confirmó la aceptación del mensaje');
  return data.messageId;
}

export async function notifyPaymentReminders({ db = pool, send = sendReminderEmail, now = DateTime.now().setZone(TZ) } = {}) {
  if (send === sendReminderEmail && (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD)) return { enabled: false, sent: 0, failed: 0 };
  const connection = await db.connect();
  let locked = false;
  const result = { enabled: true, sent: 0, failed: 0 };
  try {
    const { rows: [lock] } = await connection.query('SELECT pg_try_advisory_lock(73190214) AS locked');
    locked = lock.locked;
    if (!locked) return { ...result, busy: true };
    const targetDate = now.setZone(TZ).plus({ days: 3 }).toISODate();
    // Un aviso por cliente y fecha de vencimiento.
    await connection.query(`
      INSERT INTO payment_reminders (client_id, end_date, recipient, client_name)
      SELECT id, end_date, trim(email), name FROM clients
      WHERE is_active = true AND end_date = $1::date
        AND email IS NOT NULL AND trim(email) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
      ON CONFLICT (client_id, end_date) DO NOTHING
    `, [targetDate]);
    const { rows } = await connection.query(`
      SELECT r.id, r.client_name, r.recipient, to_char(r.end_date, 'YYYY-MM-DD') AS end_date
      FROM payment_reminders r JOIN clients c ON c.id = r.client_id
      WHERE r.sent_at IS NULL AND r.attempted_at IS NULL AND r.end_date = $1::date
        AND c.end_date = r.end_date AND c.is_active = true
      ORDER BY r.id
    `, [targetDate]);
    for (const reminder of rows) {
      try {
        // SMTP no ofrece idempotencia: si el resultado es incierto, no reenviar.
        await connection.query('UPDATE payment_reminders SET attempted_at = NOW() WHERE id = $1', [reminder.id]);
        const providerId = await send(reminder);
        await connection.query('UPDATE payment_reminders SET sent_at = NOW(), provider_id = $2 WHERE id = $1', [reminder.id, providerId]);
        result.sent++;
      } catch (error) {
        result.failed++;
        if (error.responseCode >= 400 || ['EAUTH', 'EDNS'].includes(error.code)) {
          await connection.query('UPDATE payment_reminders SET attempted_at = NULL WHERE id = $1', [reminder.id]);
        }
        console.error(`[recordatorios] Falló aviso ${reminder.id}: ${error.message}`);
      }
    }
    return result;
  } finally {
    try { if (locked) await connection.query('SELECT pg_advisory_unlock(73190214)'); }
    finally { connection.release(); }
  }
}
