import 'dotenv/config';
import { DateTime } from 'luxon';
import { createGmailTransport, reminderMessage } from '../services/paymentReminders.js';
import { TZ } from '../utils/date.js';

const recipient = process.argv[2];
if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
  console.error('Indicá un destinatario: node --use-system-ca scripts/send-test-email.js correo@example.com');
  process.exitCode = 1;
} else {
  let transport;
  try {
    transport = createGmailTransport();
    const preview = reminderMessage('Atleta', DateTime.now().setZone(TZ).plus({ days: 3 }).toISODate());
    const warning = 'ESTO ES UNA PRUEBA. La fecha es de ejemplo; no indica un vencimiento real ni requiere un pago.';
    const result = await transport.sendMail({
      from: { name: 'Primal Strength', address: process.env.GMAIL_USER.trim() },
      to: recipient,
      subject: 'Prueba con logo - Primal Strength',
      text: `${warning}\n\n${preview.text}`,
      html: preview.html.replace('<h1 ', `<p style="padding:12px;background:#fff1c2;color:#3b3000;font-weight:bold;">${warning}</p><h1 `),
      attachments: preview.attachments,
    });
    if (!result.accepted?.length) throw new Error('Gmail no aceptó el destinatario');
    console.log('Gmail aceptó el correo de prueba con logo. Revisá la bandeja y Spam.');
  } catch (error) {
    console.error('No se confirmó el envío:', error.code || '', error.message);
    process.exitCode = 1;
  } finally { transport?.close(); }
}
