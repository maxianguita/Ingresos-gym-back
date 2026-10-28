import { spawn } from 'node:child_process';
import { mkdir, readdir, rename, unlink, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DateTime } from 'luxon';
import { TZ } from '../utils/date.js';

const defaultDirectory = fileURLToPath(new URL('../backups/', import.meta.url));
let running = false;

export async function postgresTool(name) {
  if (process.env.PG_BIN) return path.join(process.env.PG_BIN, process.platform === 'win32' ? `${name}.exe` : name);
  if (process.platform === 'win32') {
    const root = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL');
    const versions = await readdir(root).catch(() => []);
    for (const version of versions.sort((a, b) => Number(b) - Number(a))) {
      const candidate = path.join(root, version, 'bin', `${name}.exe`);
      try { await access(candidate); return candidate; } catch { /* Probar siguiente instalación. */ }
    }
  }
  return name;
}

export function runTool(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env: process.env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', chunk => { error = (error + chunk).slice(-2000); });
    const timer = setTimeout(() => { child.kill(); }, 5 * 60_000);
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`La herramienta PostgreSQL terminó con código ${code}: ${error}`));
    });
  });
}

export async function backupDatabase({ force = false } = {}) {
  if (running) return { skipped: true };
  running = true;
  let partial;
  try {
    const directory = path.resolve(process.env.BACKUP_DIR || defaultDirectory);
    await mkdir(directory, { recursive: true });
    const today = DateTime.now().setZone(TZ).toISODate();
    const files = (await readdir(directory)).filter(name => /^gym-pass-\d{4}-\d{2}-\d{2}-\d{13}-[a-f0-9]{8}\.dump$/.test(name)).sort();
    if (!force && files.some(name => name.startsWith(`gym-pass-${today}-`))) return { skipped: true };
    const { randomBytes } = await import('node:crypto');
    const destination = path.join(directory, `gym-pass-${today}-${Date.now()}-${randomBytes(4).toString('hex')}.dump`);
    partial = `${destination}.partial`;
    await runTool(await postgresTool('pg_dump'), ['--no-password', '--format=custom', '--no-owner', '--no-acl', '--file', partial]);
    // Confirmar que pg_restore puede leer el catálogo antes de conservarlo.
    await runTool(await postgresTool('pg_restore'), ['--list', partial]);
    await rename(partial, destination);
    partial = null;
    // Borrar únicamente archivos propios de días anteriores, tras un respaldo válido.
    const oldest = DateTime.now().setZone(TZ).minus({ days: 14 }).toISODate();
    for (const name of files) if (name.slice(9, 19) < oldest) await unlink(path.join(directory, name));
    return { skipped: false, file: destination };
  } finally {
    if (partial) await unlink(partial).catch(() => {});
    running = false;
  }
}
