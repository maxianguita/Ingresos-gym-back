// index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { pool } from './config/db.js'; // ✅ DB activa
import clientsRouter from './routes/clients.js';
import adminRouter from './routes/admin.js';
import { initializeDatabase } from './services/databaseSchema.js';
import { auth, trustedOrigin } from './services/auth.js';

// __dirname en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 🔹 CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// 🔹 Middlewares
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use(trustedOrigin);
app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});
app.use(['/auth', '/admin', '/api/clients'], (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.post('/auth/login', auth.login);
app.post('/auth/logout', auth.logout);
app.post('/auth/reception', auth.reception);
app.get('/auth/me', auth.me);

// 🔹 Logger global
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// 🔹 Archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// 🔹 Rutas de vista
app.get('/entry', (_req, res) => {
  res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/nfc`);
});

app.get('/my-pass', (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/pases?t=${encodeURIComponent(req.query.t || '')}`);
});

// 🔹 Healthcheck
app.get('/', (_req, res) => {
  return res.json({ ok: true, service: 'gym-pass-pg' });
});

// 🔹 API
app.use('/api/clients', clientsRouter);
app.use('/admin', adminRouter);

// 🔴 Error handler global
app.use((err, req, res, next) => {
  console.error("💥 ERROR GLOBAL:", err);
  return res.status(500).json({
    error: "Error interno",
  });
});

// 🔥 IMPORTANTE: puerto 3001 (evita conflicto con Next.js)
const port = process.env.PORT || 3001;

// 🔹 Start server + conexión DB
async function start() {
  try {
    await pool.query('SELECT 1');
    await initializeDatabase();
    console.log('[DB] Tablas listas: socios, asistencias, tarjetas y recordatorios.');
    // Activar las tareas únicamente cuando ya existe el esquema completo.
    await import('./cron.js');

    console.log('[DB] Conectado a:', process.env.PGDATABASE);
    console.log('DB OK');

    app.listen(port, () => {
      console.log(`🚀 Server corriendo en http://localhost:${port}`);
    });

  } catch (e) {
    console.error('❌ Error conectando a DB:', e.message);
    process.exit(1);
  }
}

start();
