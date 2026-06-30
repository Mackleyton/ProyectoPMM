const express = require('express');
const cors = require('cors');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Database = require('better-sqlite3');

const app = express();
const PORT = 3013;

app.use(cors());
app.use(express.json());

const EXCEL_PATH = path.join(__dirname, '..', 'Listado Ayuda Escolar.xlsx');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DB_PATH = path.join(__dirname, 'entregas.db');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use('/fotoss', express.static(UPLOADS_DIR));

// Multer para fotos de entrega
const fotoStorage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  },
});
const uploadFoto = multer({
  storage: fotoStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    cb(null, /\.(jpg|jpeg|png|webp|heic)$/i.test(file.originalname));
  },
});

// Multer para subir nueva planilla Excel
const excelStorage = multer.diskStorage({
  destination: path.dirname(EXCEL_PATH),
  filename: (_, __, cb) => cb(null, path.basename(EXCEL_PATH)),
});
const uploadExcel = multer({
  storage: excelStorage,
  fileFilter: (_, file, cb) => {
    const ok = /\.xlsx?$/i.test(file.originalname);
    cb(null, ok);
  },
});

// SQLite
const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS entregas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    rut_apoderado TEXT NOT NULL,
    rut_alumno    TEXT NOT NULL UNIQUE,
    foto_path     TEXT,
    created_at    TEXT DEFAULT (datetime('now', 'localtime')),
    fecha_date    TEXT DEFAULT (date('now', 'localtime'))
  )
`);

// ─── Excel ───────────────────────────────────────────────────────────────────

let registros = [];

function limpiarClaves(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k.replace(/^﻿/, '')] = v;
  return out;
}

function excelSerialToDate(val) {
  if (typeof val !== 'number') return val ? String(val).trim() : '';
  const parsed = xlsx.SSF.parse_date_code(val);
  if (!parsed) return '';
  return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)).toLocaleDateString('es-CL');
}

function cargarExcel() {
  if (!fs.existsSync(EXCEL_PATH)) { console.log('Excel no encontrado'); return; }
  const wb = xlsx.readFile(EXCEL_PATH);
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const datos = xlsx.utils.sheet_to_json(hoja, { defval: '' }).map(limpiarClaves);

  registros = datos.map((row) => ({
    rut_apoderado: String(row['Rut_Apoderado'] ?? '').trim(),
    nombre_apoderado: [row['Nombre_Apoderado'], row['Apellido_Paterno_Apoderado'], row['Apellido_Materno_Apoderado']]
      .filter(Boolean).map((s) => String(s).trim()).join(' ').trim(),
    fecha_nacimiento_apoderado: excelSerialToDate(row['Fecha_Nacimiento_Apoderado']),
    direccion: String(row['Direccion'] ?? '').trim(),
    sector: String(row['Sector'] ?? '').trim(),
    correo_apoderado: String(row['Correo_Apoderado'] ?? '').trim(),
    telefono_apoderado: String(row['Telefono_Apoderado'] ?? '').trim(),
    rut_alumno: String(row['Rut_Alumno'] ?? '').trim(),
    nombre_alumno: [row['Nombre_Alumno'], row['Apellido_Paterno_Alumno'], row['Apellido_Materno_Alumno']]
      .filter(Boolean).map((s) => String(s).trim()).join(' ').trim(),
    fibe_beneficiado: String(row['FIBE_Beneficiado'] ?? '').trim(),
    renovacion_automatica: String(row['Renovacion_automatica'] ?? '').trim(),
    establecimiento: String(row['Establecimiento'] ?? '').trim(),
    nivel_educacional: String(row['Nivel_Educacional'] ?? '').trim(),
    estado: String(row['Estado'] ?? '').trim(),
    fecha_postulacion: excelSerialToDate(row['Fecha_Postulacion']),
  }));

  console.log(`Excel cargado: ${registros.length} registros`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizarRut(rut) {
  return String(rut).replace(/\./g, '').replace(/-/g, '').toUpperCase().trim();
}

function enriquecerConEntrega(r) {
  const entrega = db.prepare('SELECT * FROM entregas WHERE rut_alumno = ?').get(r.rut_alumno);
  return {
    ...r,
    entregado: !!entrega,
    entrega_id: entrega?.id ?? null,
    foto_entrega: entrega?.foto_path ? `/fotoss/${entrega.foto_path}` : null,
    fecha_entrega_registro: entrega?.created_at ?? null,
  };
}

// ─── Rutas ───────────────────────────────────────────────────────────────────

app.get('/apis/buscar', (req, res) => {
  const { rut } = req.query;
  if (!rut?.trim()) return res.status(400).json({ error: 'Debe ingresar un RUT' });

  const rutBuscado = normalizarRut(rut);
  const resultados = registros
    .filter((r) =>
      normalizarRut(r.rut_apoderado) === rutBuscado ||
      normalizarRut(r.rut_alumno) === rutBuscado
    )
    .map(enriquecerConEntrega);

  res.json({ total: resultados.length, resultados });
});

app.post('/apis/entregas', uploadFoto.single('foto'), (req, res) => {
  const { rut_apoderado, rut_alumno } = req.body;
  if (!rut_apoderado || !rut_alumno) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'La foto es obligatoria para validar la entrega' });
  }

  const existing = db.prepare('SELECT id FROM entregas WHERE rut_alumno = ?').get(rut_alumno);
  if (existing) {
    return res.status(409).json({ error: 'Este alumno ya tiene una entrega registrada' });
  }

  const result = db
    .prepare('INSERT INTO entregas (rut_apoderado, rut_alumno, foto_path) VALUES (?, ?, ?)')
    .run(rut_apoderado, rut_alumno, req.file.filename);

  res.json({ id: result.lastInsertRowid, ok: true });
});

app.get('/apis/kpis', (_, res) => {
  const totalRegistros = registros.length;
  const totalEntregados = db.prepare('SELECT COUNT(*) as c FROM entregas').get().c;
  const porDia = db.prepare(`
    SELECT fecha_date as fecha, COUNT(*) as total
    FROM entregas
    GROUP BY fecha_date
    ORDER BY fecha_date DESC
    LIMIT 30
  `).all();

  res.json({ totalRegistros, totalEntregados, porDia });
});

app.post('/apis/upload-excel', uploadExcel.single('excel'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo Excel' });
  cargarExcel();
  res.json({ ok: true, registros: registros.length });
});

app.get('/apis/health', (_, res) => {
  res.json({ ok: true, registros: registros.length });
});

cargarExcel();

app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
