import 'dotenv/config';
import { backupDatabase } from '../services/backups.js';
try {
  const result = await backupDatabase({ force: true });
  console.log(result.skipped ? 'Ya hay un respaldo en curso.' : `Respaldo verificado: ${result.file}`);
} catch (error) { console.error('No se pudo crear el respaldo:', error.message); process.exitCode = 1; }
