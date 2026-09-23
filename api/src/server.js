const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 3000);

const pool = new Pool({
  host: process.env.DB_HOST || 'database',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'rrhh',
  user: process.env.DB_USER || 'rrhh_user',
  password: process.env.DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
});

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function normalizeTime(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value).slice(0, 5);
}

function isRealDate(value) {
  if (!datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateMarcacion(body = {}) {
  const data = {
    codigo_empleado: String(body.codigo_empleado || '').trim().toUpperCase(),
    nombre_empleado: String(body.nombre_empleado || '').trim(),
    fecha: String(body.fecha || '').trim(),
    hora_ingreso_programada: normalizeTime(body.hora_ingreso_programada),
    hora_ingreso_real: normalizeTime(body.hora_ingreso_real),
    hora_salida_programada: normalizeTime(body.hora_salida_programada),
    hora_salida_real: normalizeTime(body.hora_salida_real),
    observacion: String(body.observacion || '').trim() || null,
  };

  const errors = [];
  if (!data.codigo_empleado) errors.push('El código de empleado es obligatorio.');
  if (data.codigo_empleado.length > 20) errors.push('El código de empleado admite hasta 20 caracteres.');
  if (!data.nombre_empleado) errors.push('El nombre del empleado es obligatorio.');
  if (data.nombre_empleado.length > 120) errors.push('El nombre admite hasta 120 caracteres.');
  if (!isRealDate(data.fecha)) errors.push('La fecha es obligatoria y debe usar el formato AAAA-MM-DD.');

  for (const [field, label, required] of [
    ['hora_ingreso_programada', 'hora programada de ingreso', true],
    ['hora_ingreso_real', 'hora real de ingreso', false],
    ['hora_salida_programada', 'hora programada de salida', true],
    ['hora_salida_real', 'hora real de salida', false],
  ]) {
    const value = data[field];
    if (required && !value) errors.push(`La ${label} es obligatoria.`);
    if (value && !timePattern.test(value)) errors.push(`La ${label} debe usar el formato HH:mm.`);
  }

  if (
    data.hora_ingreso_programada &&
    data.hora_salida_programada &&
    data.hora_salida_programada < data.hora_ingreso_programada
  ) {
    errors.push('La hora programada de salida no puede ser anterior a la de ingreso.');
  }

  if (
    data.hora_ingreso_real &&
    data.hora_salida_real &&
    data.hora_salida_real < data.hora_ingreso_real
  ) {
    errors.push('La hora real de salida no puede ser anterior a la de ingreso.');
  }

  if (data.observacion && data.observacion.length > 500) {
    errors.push('La observación admite hasta 500 caracteres.');
  }

  if (errors.length > 0) return { errors };

  data.estado =
    !data.hora_ingreso_real || !data.hora_salida_real
      ? 'INCOMPLETO'
      : data.hora_ingreso_real <= data.hora_ingreso_programada
        ? 'PUNTUAL'
        : 'ATRASO';

  return { data };
}

function serialize(row) {
  return {
    ...row,
    fecha: row.fecha instanceof Date ? row.fecha.toISOString().slice(0, 10) : row.fecha,
    hora_ingreso_programada: normalizeTime(row.hora_ingreso_programada),
    hora_ingreso_real: normalizeTime(row.hora_ingreso_real),
    hora_salida_programada: normalizeTime(row.hora_salida_programada),
    hora_salida_real: normalizeTime(row.hora_salida_real),
  };
}

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', database: 'connected' });
  } catch (_error) {
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

app.get('/api/marcaciones', async (req, res, next) => {
  try {
    const filters = [];
    const values = [];

    if (req.query.empleado) {
      values.push(`%${String(req.query.empleado).trim()}%`);
      filters.push(`(codigo_empleado ILIKE $${values.length} OR nombre_empleado ILIKE $${values.length})`);
    }

    if (req.query.fecha) {
      const fecha = String(req.query.fecha).trim();
      if (!isRealDate(fecha)) {
        return res.status(400).json({ error: 'La fecha del filtro debe usar el formato AAAA-MM-DD.' });
      }
      values.push(fecha);
      filters.push(`fecha = $${values.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT * FROM marcaciones ${where} ORDER BY fecha DESC, hora_ingreso_programada ASC, id DESC`,
      values,
    );
    res.status(200).json(result.rows.map(serialize));
  } catch (error) {
    next(error);
  }
});

app.get('/api/marcaciones/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
    const result = await pool.query('SELECT * FROM marcaciones WHERE id = $1', [id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Marcación no encontrada.' });
    res.status(200).json(serialize(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.post('/api/marcaciones', async (req, res, next) => {
  try {
    const validation = validateMarcacion(req.body);
    if (validation.errors) return res.status(400).json({ errors: validation.errors });
    const d = validation.data;
    const result = await pool.query(
      `INSERT INTO marcaciones (
        codigo_empleado, nombre_empleado, fecha,
        hora_ingreso_programada, hora_ingreso_real,
        hora_salida_programada, hora_salida_real,
        estado, observacion
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [
        d.codigo_empleado,
        d.nombre_empleado,
        d.fecha,
        d.hora_ingreso_programada,
        d.hora_ingreso_real,
        d.hora_salida_programada,
        d.hora_salida_real,
        d.estado,
        d.observacion,
      ],
    );
    res.status(201).json(serialize(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.put('/api/marcaciones/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
    const validation = validateMarcacion(req.body);
    if (validation.errors) return res.status(400).json({ errors: validation.errors });
    const d = validation.data;
    const result = await pool.query(
      `UPDATE marcaciones SET
        codigo_empleado = $1,
        nombre_empleado = $2,
        fecha = $3,
        hora_ingreso_programada = $4,
        hora_ingreso_real = $5,
        hora_salida_programada = $6,
        hora_salida_real = $7,
        estado = $8,
        observacion = $9,
        updated_at = NOW()
      WHERE id = $10
      RETURNING *`,
      [
        d.codigo_empleado,
        d.nombre_empleado,
        d.fecha,
        d.hora_ingreso_programada,
        d.hora_ingreso_real,
        d.hora_salida_programada,
        d.hora_salida_real,
        d.estado,
        d.observacion,
        id,
      ],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Marcación no encontrada.' });
    res.status(200).json(serialize(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/marcaciones/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
    const result = await pool.query('DELETE FROM marcaciones WHERE id = $1 RETURNING id', [id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Marcación no encontrada.' });
    res.status(200).json({ message: 'Marcación eliminada.', id });
  } catch (error) {
    next(error);
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo JSON no es válido.' });
  }
  console.error(error);
  return res.status(500).json({ error: 'Error interno del servidor.' });
});

const server = app.listen(port, () => {
  console.log(`API RRHH escuchando en el puerto ${port}`);
});

async function shutdown(signal) {
  console.log(`${signal}: cerrando API`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
