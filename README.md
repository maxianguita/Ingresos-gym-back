# Ingresos Gym — backend

API Node.js/Express y PostgreSQL para Primal Strength: socios, renovaciones,
control de ingreso por RFID, QR o DNI, acceso de administrador y recordatorios
de vencimiento por Gmail.

## Desarrollo local

Requiere Node.js 24 y PostgreSQL. Instalar dependencias con `npm ci`, copiar
`.env.example` a `.env` y completar la conexión a la base y las variables de correo.
Al iniciar, el servidor crea las tablas de socios, datos de contacto, asistencias,
campos RFID y recordatorios si no existen. La inicialización es transaccional,
no carga socios de prueba y conserva los datos existentes en los reinicios.

Generar el administrador con `npm run admin:setup` e iniciar con `npm start`.
Las credenciales iniciales se generan localmente y no se publican en GitHub.
En un hosting también se puede configurar `ADMIN_USERNAME` y `ADMIN_PASSWORD`
(mínimo 12 caracteres) como variables privadas. Estas tienen prioridad sobre
el archivo local y conservan el acceso tras los reinicios o nuevos despliegues.

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
