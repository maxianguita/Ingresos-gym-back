import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes, scryptSync } from 'node:crypto';
import { adminFile } from '../services/auth.js';

const username = process.argv[2] || 'admin';
if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) throw new Error('Usá un usuario de 3 a 40 caracteres: letras, números, punto, guion o guion bajo.');
const password = randomBytes(18).toString('base64url');
const salt = randomBytes(16).toString('hex');
await mkdir(new URL('../.local/', import.meta.url), { recursive: true });
const accessFile = new URL('../.local/admin-access.txt', import.meta.url);
await writeFile(accessFile, `Primal Strength - acceso local\nUsuario: ${username}\nContraseña: ${password}\n\nGuardá estos datos en un gestor de contraseñas y eliminá este archivo.\nPara generar otra contraseña: npm run admin:setup\n`, { mode: 0o600 });
await writeFile(adminFile, JSON.stringify({ username, salt, hash: scryptSync(password, salt, 64).toString('hex') }, null, 2), { mode: 0o600 });
console.log('Administrador configurado. Credenciales en .local/admin-access.txt (no se incluyen en Git). Las sesiones anteriores quedan invalidadas.');
