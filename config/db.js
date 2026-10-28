import pkg from 'pg';
const { Pool } = pkg;

for (const key of ['PGHOST', 'PGUSER', 'PGPASSWORD', 'PGDATABASE']) {
  if (!process.env[key]) throw new Error(`Falta configurar ${key} en .env`);
}

export const pool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  connectionTimeoutMillis: 5000,
});

export const q = async (text, params = []) => {
  try {

    const res = await pool.query(text, params);

    return res;

  } catch (err) {
    console.error('[DB] Error en consulta:', err.code || 'desconocido');
    throw err;
  }
};
