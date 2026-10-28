# Ingresos Gym — backend

API Node.js/Express y PostgreSQL para Primal Strength: socios, renovaciones,
control de ingreso por RFID, QR o DNI, acceso de administrador y recordatorios
de vencimiento por Gmail.

## Desarrollo local

Requiere Node.js 24 y PostgreSQL. Instalar dependencias con `npm ci`, copiar
`.env.example` a `.env` y completar la conexión a la base y las variables de correo.
La base debe tener el esquema de socios, datos de contacto, asistencias, campos
RFID y recordatorios. Ver los archivos de `sql/`; una instalación nueva necesita
también las columnas de contacto `email`, `phone` y `address` en `clients`.

Generar el administrador con `npm run admin:setup` e iniciar con `npm start`.
Las credenciales iniciales se generan localmente y no se publican en GitHub.

- `npm test`: pruebas de acceso, autenticación y recordatorios, sin correos reales.
- `npm run backup`: respaldo manual PostgreSQL.
- `OPERACION.md`: operación local, lector y consideraciones de publicación.
- `RECORDATORIOS.md`: configuración del correo y horarios.

## Publicación

El repositorio contiene el código; no incluye socios, credenciales ni respaldos.
Antes de usarlo en un hosting deben configurarse PostgreSQL, las migraciones,
HTTPS, el origen del frontend, las cookies y el almacenamiento persistente del
administrador y los respaldos. El correo actual requiere acceso SMTP a Gmail.

No subir `.env`, `.local`, `backups` ni `node_modules`.
