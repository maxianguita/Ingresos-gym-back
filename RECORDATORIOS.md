Recordatorios por email
======================

Ejecutar sql/payment-reminders.sql en la base del backend.
Usar una cuenta gratuita de Gmail. No hace falta comprar un dominio.
Activar la verificación en dos pasos y generar una contraseña de aplicación:
https://myaccount.google.com/apppasswords
Agregar al .env existente (conservar las variables de conexión):

    GMAIL_USER=tu-cuenta@gmail.com
    GMAIL_APP_PASSWORD=tu_contraseña_de_aplicación

La contraseña de aplicación se guarda solo en .env. No usar la contraseña
habitual de la cuenta. Se puede comprobar la conexión sin enviar correos con:

    node --use-system-ca --input-type=module -e "import 'dotenv/config'; import { createGmailTransport } from './services/paymentReminders.js'; const t = createGmailTransport(); await t.verify(); t.close(); console.log('Gmail conectado');"

Reiniciar el backend. Debe permanecer encendido y conectado a Internet.
Se revisan a las 09:00, hora argentina, los pases activos que vencen exactamente
en tres días: en un pase de 30 días, corresponde al día 27 del período.
No se repite cada 27 días desde el aviso: se calcula según cada vencimiento.
Se omiten clientes sin email válido. Los rechazos confirmados se reintentan
cada hora hasta las 23:00. Una renovación invalida el aviso de la fecha anterior.
No se envían avisos retroactivos si el servidor estuvo apagado todo ese día.

payment_reminders registra la aceptación del proveedor, que no garantiza la
entrega en bandeja. Se registra un aviso por cliente y vencimiento para evitar
duplicados. Gmail SMTP no ofrece idempotencia: ante un corte de conexión con
resultado incierto, el aviso queda con attempted_at y sin sent_at y no se
reenvía automáticamente. Revisar Enviados en Gmail antes de volver a habilitar
ese aviso. Lo mismo aplica si el proceso se interrumpe durante un envío.
Sin ambas variables de correo, el envío queda desactivado.
GET /admin/notify-expiring ya no simula ni dispara envíos.

Gmail tiene límites de envío compartidos con el resto de la cuenta:
https://support.google.com/mail/answer/22839?hl=es
Contraseñas de aplicación: https://support.google.com/accounts/answer/185833?hl=es

Uso real y tarjetas NFC
----------------------

Iniciar el backend con `npm start` (requiere una versión de Node que admita
`--use-system-ca`, como la utilizada en la prueba de correo). Mantenerlo
encendido, con Internet y sin suspensión para ejecutar los horarios previstos.
Los envíos automáticos ya son reales: no llevan la etiqueta de prueba y saludan
con "Hola socio!!". Usan el email y la fecha de vencimiento de cada socio.
El script scripts/send-test-email.js conserva la advertencia de prueba porque
usa una fecha de ejemplo; no usarlo para avisos reales.

El aviso actual se envía tres días ANTES del vencimiento. No hay un segundo
correo automático después de que la membresía vence.

Los correos se programan por fecha, independientemente del uso de la tarjeta.
La tarjeta identifica al socio; la vigencia se consulta en la base. Renovar
actualiza las fechas y reactiva el pase sin cambiar la tarjeta vinculada.

Antes de habilitar el lector en recepción, comprobar con una tarjeta física:
1. Que el lector escriba el UID y Enter en el campo de la pantalla /nfc.
   La pantalla actual admite lectores que funcionan como teclado; un lector
   que requiera un SDK necesita su propia integración.
2. Vincular la tarjeta desde la búsqueda del socio y verificar que no permita
   asignar la misma tarjeta a otro socio.
3. Con pase vigente, comprobar que permita el ingreso y registre asistencia.
4. Con pase vencido, comprobar que rechace el ingreso y no registre asistencia.
5. Renovar desde administración y comprobar que la misma tarjeta permita ingresar.

La prueba de correo fue aceptada por Gmail desde la terminal local. Aún debe
comprobarse el recorrido físico con el modelo de lector y las tarjetas elegidas.
