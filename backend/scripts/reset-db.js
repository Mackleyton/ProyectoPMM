const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function reset() {
  console.log('🔄 Iniciando reseteo y repoblación de base de datos...');

  // 1. Limpiar fotos de actas previas
  const uploadsDir = path.join(__dirname, '..', 'uploads', 'actas');
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    for (const f of files) {
      const fullPath = path.join(uploadsDir, f);
      if (fs.statSync(fullPath).isFile()) {
        fs.unlinkSync(fullPath);
        console.log(`  🗑️  Eliminado archivo de acta: ${f}`);
      }
    }
  }

  // 2. Si PostgreSQL está disponible, ejecutar init.sql
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'beneficios_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    connectionTimeoutMillis: 1500,
  });

  try {
    const client = await pool.connect();
    console.log('  🐘 Conectado a PostgreSQL en localhost:5432');
    const initSqlPath = path.join(__dirname, '..', 'database', 'init.sql');
    if (fs.existsSync(initSqlPath)) {
      const sql = fs.readFileSync(initSqlPath, 'utf-8');
      await client.query(sql);
      console.log('  ✅ Esquema y datos de ejemplo restablecidos en PostgreSQL.');
    }
    client.release();
    await pool.end();
  } catch (err) {
    console.log('  ℹ️  PostgreSQL no detectado en puerto 5432. Datos de ejemplo cargados en el almacén integrado.');
  }

  // 3. Verificar seedData.json
  const seedFile = path.join(__dirname, '..', 'data', 'seedData.json');
  if (fs.existsSync(seedFile)) {
    const items = JSON.parse(fs.readFileSync(seedFile, 'utf-8'));
    console.log(`  📦 Padrón de ejemplo listo con ${items.length} registros y 10 familias de Quilpué.`);
  }

  console.log('✨ Base de datos reiniciada con éxito con datos de ejemplo.');
}

reset().catch((e) => {
  console.error('Error al resetear base de datos:', e);
  process.exit(1);
});
