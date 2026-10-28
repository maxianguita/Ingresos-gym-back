// cron.js
import cron from 'node-cron';
import { deactivateExpired } from './models/clientModel.js';

const TZ = process.env.TZ || 'America/Argentina/Buenos_Aires';
import { notifyPaymentReminders } from './services/paymentReminders.js';
import { backupDatabase } from './services/backups.js';

async function backup() {
  try {
    const result = await backupDatabase();
    if (!result.skipped) console.log(`[backup] Respaldo verificado: ${result.file}`);
  } catch (error) { console.error('[backup] Error:', error.message); }
}
cron.schedule('0 2 * * *', backup, { timezone: TZ });
// Recuperar el respaldo del día si el equipo estuvo apagado a las 02:00.
backup();

// --- 1) Desactivar vencidos todos los días 03:00 (hora AR) ---
cron.schedule('0 3 * * *', async () => {
  try {
    const n = await deactivateExpired();
    if (n) console.log(`[cron] Inactivados por vencimiento: ${n}`);
  } catch (e) {
    console.error('[cron] Error en deactivateExpired:', e.message);
  }
}, { timezone: TZ });

// --- 2) Notificar vencimientos todos los días 09:00 (hora AR) ---
async function notify() {
  try {
    const result = await notifyPaymentReminders();
    console.log(result.enabled
      ? `[recordatorios] Enviados: ${result.sent}. Fallidos: ${result.failed}.`
      : '[recordatorios] Sin activar: configurá GMAIL_USER y GMAIL_APP_PASSWORD.');
  } catch (e) {
    console.error('[cron] Error en notify:', e.message);
  }
}

cron.schedule('0 9-23 * * *', () => notify(), { timezone: TZ });

// --- Opcional: correr notify una vez al iniciar para probar ---
if (process.env.CRON_RUN_ON_START === 'true') {
  notify().catch(() => {});
}
