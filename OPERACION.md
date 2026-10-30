# Operación de Primal Strength

## Iniciar en esta computadora

1. En una terminal del backend: `npm.cmd start`.
2. En otra terminal del frontend: `npm.cmd run dev`.
3. Abrir `http://localhost:5173`. Crear, buscar y listar socios requiere ingresar.

Se generó un administrador local. El usuario y la contraseña inicial están en
`.local/admin-access.txt`. Guardarlos en un gestor de contraseñas y eliminar ese
archivo de texto. El servidor conserva solamente un hash con sal en
`.local/admin.json`. Ambos archivos están excluidos de Git.

Para generar una nueva contraseña: `npm.cmd run admin:setup` (usuario `admin`)
o `npm.cmd run admin:setup -- nombreusuario`. Esto invalida las sesiones abiertas.
No ejecutar el comando rutinariamente: cambia la contraseña.

Las sesiones duran 12 horas y se cierran al reiniciar el backend. Las contraseñas
no se guardan en el navegador. Hay un límite de cinco intentos fallidos por IP
durante 15 minutos.

## Recepción y lector

Desde la administración elegir **Ingreso NFC**. Se abre una pestaña aparte;
la administración permanece en la original. Arrastrar la pestaña del lector
a una ventana en el segundo monitor y usar F11 para pantalla completa.
Las dos pestañas comparten la sesión: cerrar sesión o bloquear administración
afecta a ambas. Entrar al lector conserva la sesión de administrador.
Para dejar el equipo exclusivamente como lector,
elegir **Bloquear administración** dentro de `/nfc`: mantiene los ingresos activos
y exige ingresar nuevamente para administrar socios. Si se abre `/nfc` sin
sesión, ingresar habilita únicamente la recepción. Usar **Cerrar sesión** al
terminar el turno.

El lector actual debe funcionar como teclado: escribir el UID y enviar Enter.
Vincular cada tarjeta desde Buscar por DNI antes del primer uso. Un UID no puede
pertenecer a dos socios. La renovación conserva el UID y reactiva el pase.

NFC, DNI y QR verifican actividad, fecha de comienzo y vencimiento antes de
registrar una asistencia. El pase vale hasta terminar el día de vencimiento en
Argentina. Consultar el enlace personal `/pases?t=...` no registra asistencia;
el ingreso se registra únicamente desde una sesión de recepción o administración.

Todavía se necesita probar con el lector y las tarjetas físicas elegidos.

## Correo

Se envía un único aviso por socio y fecha de vencimiento, tres días antes.
Saludo: **Hola socio!!**. El envío automático no dice prueba.
Conservar email correcto en cada socio. Los clientes sin email válido se omiten.
Los rechazos confirmados pueden reintentarse; los envíos con resultado incierto
no se repiten automáticamente. Ver detalles en `RECORDATORIOS.md`.

Mantener el servidor encendido, conectado a Internet y sin suspensión. La primera
revisión es a las 09:00 de Argentina. No se recuperan avisos de días anteriores.

## Respaldos

Hay un respaldo diario a las 02:00 de Argentina y también al iniciar el backend
si todavía no hay uno de ese día. Los `.dump` se guardan en `backups/`. Se valida
su catálogo con `pg_restore --list` antes de conservarlos. Se eliminan únicamente
respaldos propios con más de 14 días, después de generar uno nuevo válido.

Para crear otro manualmente: `npm.cmd run backup`.
Requiere las herramientas PostgreSQL (`pg_dump` y `pg_restore`). En Windows se
detectan instalaciones bajo Program Files/PostgreSQL; para otra ubicación
configurar `PG_BIN` en `.env`.

La carpeta local protege frente a cambios accidentales, pero comparte el disco
con la base. Configurar `BACKUP_DIR` para un destino de respaldo independiente,
o copiar los `.dump` a un disco externo. `.env` y `.local/admin.json` no están
dentro del respaldo de PostgreSQL: guardarlos aparte de forma privada si se
necesita recuperar la instalación completa.

Para restaurar, detener el backend y usar `pg_restore --no-owner --no-acl
--dbname=NOMBRE_DE_BASE_NUEVA ARCHIVO.dump` sobre una base nueva y vacía.
Verificar los datos antes de cambiar `PGDATABASE`. Nunca usar la base activa como
destino de una prueba de restauración. La comprobación automática del catálogo
no reemplaza una prueba de restauración completa.

## Al publicar

Usar HTTPS y servir frontend y API desde el mismo sitio (por ejemplo, mediante
un proxy que derive `/api`, `/auth` y `/admin` al backend). Ajustar `FRONTEND_URL`
al origen real del frontend, `COOKIE_SECURE=true` y las variables de la base.
No colocar contraseñas en variables `VITE_*`, ya que son públicas.

En Render configurar `ADMIN_USERNAME` y `ADMIN_PASSWORD` (de 12 a 256 caracteres)
en Environment. No guardarlos en el repositorio. El acceso se conserva al
reiniciar el servicio; las sesiones abiertas sí requieren volver a ingresar.
Como alternativa con almacenamiento persistente se puede crear el administrador
en el servidor con `npm.cmd run admin:setup`. Instalar
las herramientas PostgreSQL y ejecutar las migraciones `sql/payment-reminders.sql`
y `sql/rfid.sql` sobre la base correspondiente. Configurar el inicio automático
del servicio en el servidor elegido. Esta preparación local no publica el sitio.

## Gestión de recepción

El menú **Resumen** muestra socios vigentes, próximos vencimientos, pausados,
vencidos, ingresos y pagos del día en horario argentino. Usar Actualizar para
consultar nuevos movimientos. Los importes corresponden a pagos registrados,
no a cargos automáticos ni a facturas fiscales.

En **Socios → Ver ficha** se pueden corregir datos de contacto y DNI, pausar o
reactivar la membresía, registrar pagos, consultar asistencias y gestionar el
llavero. Pausar bloquea el acceso pero NO congela ni extiende los días del pase.
Reactivar conserva el vencimiento; si está vencido, hace falta renovar.

En **Pagos**, registrar únicamente dinero ya recibido. Se guardan monto en ARS,
fecha, medio de pago, notas y el usuario que lo registró. Los días de renovación
se suman al vencimiento vigente o, si ya venció, a la fecha actual. Una renovación
reactiva el pase y levanta la pausa. El alta ya incluye el primer período:
para registrar ese pago sin extenderlo otra vez, usar 0 días. Los reintentos
del mismo formulario utilizan un identificador único para evitar duplicados.
Si se pierde la conexión, revisar el historial antes de volver a cargar el pago.
El historial de pagos impide eliminar al socio; pausar en lugar de borrarlo.

En **Llavero**, reemplazar o bloquear un llavero perdido deja bloqueado el código
anterior. Un código bloqueado no puede reutilizarse ni asignarse a otro socio.
El historial muestra quién lo bloqueó y cuándo. La nueva tarjeta debe vincularse
antes de usarla. La compatibilidad física sigue pendiente del lector real.

En **Asistencias**, filtrar por fechas (hasta un año por consulta). La ficha
individual permite consultar solo los ingresos de ese socio. Se listan 25 por
página y únicamente entradas que fueron permitidas.

Las nuevas tablas y columnas se crean automáticamente al iniciar el servidor,
sin borrar ni importar datos. Subir primero el backend y esperar que el despliegue
termine antes de publicar el frontend actualizado.

## Comprobaciones del código

- Backend: `npm.cmd test`. Usa tablas temporales para las pruebas de base y no
  envía correos reales.
- Frontend: `npm.cmd run lint` y `npm.cmd run build`.
- En entornos con acceso restringido a carpetas superiores:
  `npm.cmd run build -- --configLoader runner`.
