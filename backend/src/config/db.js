const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const env = require("./env");
const { cleanRut } = require("../utils/rut");
const { parseExcelBeneficiaries } = require("../utils/excel");

let usePostgres = false;

const poolConfig = env.DATABASE_URL
  ? {
      connectionString: env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    }
  : {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 3000,
    };

const pool = new Pool(poolConfig);

// Almacén en memoria persistente ante desconexión de base de datos
const memoryStore = {
  users: [
    {
      id: "u-admin-01",
      username: "admin",
      password_hash: bcrypt.hashSync("Admin123!", 10),
      role: "ADMIN",
      name: "Administrador Social",
      active: true,
    },
    {
      id: "u-terreno-01",
      username: "terreno",
      password_hash: bcrypt.hashSync("Terreno123!", 10),
      role: "FIELD_AGENT",
      name: "Operador Terreno",
      active: true,
    },
  ],
  guardians: new Map(),
  students: new Map(),
  benefits: new Map(),
  deliveries: new Map(),
  evidences: new Map(),
  attentionTimes: [],
  auditLogs: [],
};

function findInitialExcelFile() {
  const candidates = [
    path.join(__dirname, "..", "..", "..", "Listado Ayuda Escolar.xlsx"),
    path.join(__dirname, "..", "..", "data", "formulario_postulantes.xlsx"),
    path.join(__dirname, "..", "..", "formulario_postulantes.xlsx"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function loadExcelToMemory(excelPath, replace = true) {
  try {
    const { results } = parseExcelBeneficiaries(excelPath);
    if (replace) {
      memoryStore.guardians.clear();
      memoryStore.students.clear();
      memoryStore.benefits.clear();
    }

    results.forEach((item) => {
      let guardian = memoryStore.guardians.get(item.guardian.rut);
      if (!guardian || replace) {
        guardian = {
          id: `g-xl-${cleanRut(item.guardian.rut)}`,
          ...item.guardian,
        };
        memoryStore.guardians.set(item.guardian.rut, guardian);
      }

      const studentId = `s-xl-${cleanRut(item.student.rut)}`;
      const student = {
        id: studentId,
        guardianId: guardian.id,
        ...item.student,
      };
      memoryStore.students.set(item.student.rut, student);

      const benefitId = `b-xl-${cleanRut(item.student.rut)}`;
      const existingBenefit = memoryStore.benefits.get(benefitId);
      
      // Si ya estaba entregado y estamos en modo actualización, conservar entrega
      const finalStatus = (!replace && existingBenefit && existingBenefit.status === "DELIVERED")
        ? "DELIVERED"
        : item.benefit.status;
      const finalDeliveredAt = (!replace && existingBenefit && existingBenefit.status === "DELIVERED")
        ? existingBenefit.deliveredAt
        : item.benefit.deliveredAt;
      const finalEvidenceId = (!replace && existingBenefit && existingBenefit.status === "DELIVERED")
        ? existingBenefit.evidenceId
        : null;

      memoryStore.benefits.set(benefitId, {
        id: benefitId,
        guardianId: guardian.id,
        guardianRut: item.guardian.rut,
        studentId: studentId,
        studentRut: item.student.rut,
        benefitName: item.benefit.name,
        status: finalStatus,
        deliveredAt: finalDeliveredAt,
        evidenceId: finalEvidenceId,
      });
    });

    console.log(`[DATA] Cargados ${results.length} beneficiarios en memoria desde ${path.basename(excelPath)}.`);
    return true;
  } catch (err) {
    console.warn("[DATA] Error al parsear planilla inicial:", err.message);
    return false;
  }
}

async function syncDataToPostgres(client, parsedItems, replace = false) {
  if (replace) {
    // Modo reemplazo total: vaciar tablas relacionales
    await client.query("DELETE FROM delivery_items;");
    await client.query("DELETE FROM beneficiary_benefits;");
    await client.query("DELETE FROM students;");
    await client.query("DELETE FROM guardians;");
  }

  for (const item of parsedItems) {
    // 1. Tipo de beneficio
    const btRes = await client.query(
      `INSERT INTO benefit_types (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id;`,
      [item.benefit.name]
    );
    const benefitTypeId = btRes.rows[0].id;

    // 2. Apoderado
    const gRes = await client.query(
      `INSERT INTO guardians (rut, first_name, paternal_last_name, maternal_last_name, birth_date, address, sector, email, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (rut) DO UPDATE SET
         first_name = EXCLUDED.first_name,
         paternal_last_name = EXCLUDED.paternal_last_name,
         maternal_last_name = EXCLUDED.maternal_last_name,
         birth_date = COALESCE(EXCLUDED.birth_date, guardians.birth_date),
         address = COALESCE(EXCLUDED.address, guardians.address),
         sector = COALESCE(EXCLUDED.sector, guardians.sector),
         email = COALESCE(EXCLUDED.email, guardians.email),
         phone = COALESCE(EXCLUDED.phone, guardians.phone),
         updated_at = CURRENT_TIMESTAMP
       RETURNING id;`,
      [
        item.guardian.rut,
        item.guardian.firstName,
        item.guardian.paternalLastName,
        item.guardian.maternalLastName,
        item.guardian.birthDate,
        item.guardian.address,
        item.guardian.sector,
        item.guardian.email,
        item.guardian.phone,
      ]
    );
    const guardianId = gRes.rows[0].id;

    // 3. Estudiante
    const sRes = await client.query(
      `INSERT INTO students (
         guardian_id, rut, first_name, paternal_last_name, maternal_last_name,
         establishment, educational_level, fibe_benefited, automatic_renewal,
         application_status, delivery_day, delivery_time, delivery_table,
         imported_delivery_date, imported_delivered_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (rut) DO UPDATE SET
         guardian_id = EXCLUDED.guardian_id,
         first_name = EXCLUDED.first_name,
         paternal_last_name = EXCLUDED.paternal_last_name,
         maternal_last_name = EXCLUDED.maternal_last_name,
         establishment = EXCLUDED.establishment,
         educational_level = EXCLUDED.educational_level,
         fibe_benefited = EXCLUDED.fibe_benefited,
         automatic_renewal = EXCLUDED.automatic_renewal,
         application_status = EXCLUDED.application_status,
         delivery_day = EXCLUDED.delivery_day,
         delivery_time = EXCLUDED.delivery_time,
         delivery_table = EXCLUDED.delivery_table,
         imported_delivery_date = EXCLUDED.imported_delivery_date,
         imported_delivered_by = EXCLUDED.imported_delivered_by,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id;`,
      [
        guardianId,
        item.student.rut,
        item.student.firstName,
        item.student.paternalLastName,
        item.student.maternalLastName,
        item.student.establishment,
        item.student.educationalLevel,
        item.student.fibeBenefited,
        item.student.renewal,
        item.student.state,
        item.student.deliveryDay,
        item.student.deliveryTime,
        item.student.deliveryTable,
        item.student.importedDeliveryDate,
        item.student.importedDeliveredBy,
      ]
    );
    const studentId = sRes.rows[0].id;

    // 4. Beneficio asignado
    await client.query(
      `INSERT INTO beneficiary_benefits (guardian_id, student_id, benefit_type_id, status, delivered_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (student_id, benefit_type_id) DO UPDATE SET
         guardian_id = EXCLUDED.guardian_id,
         status = CASE WHEN beneficiary_benefits.status = 'DELIVERED' THEN 'DELIVERED' ELSE EXCLUDED.status END,
         delivered_at = CASE WHEN beneficiary_benefits.status = 'DELIVERED' THEN beneficiary_benefits.delivered_at ELSE EXCLUDED.delivered_at END,
         evidence_id = CASE WHEN beneficiary_benefits.status = 'DELIVERED' THEN beneficiary_benefits.evidence_id ELSE beneficiary_benefits.evidence_id END,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id;`,
      [
        guardianId,
        studentId,
        benefitTypeId,
        item.benefit.status,
        item.benefit.deliveredAt ? new Date(item.benefit.deliveredAt) : null,
      ]
    );
  }
}

async function initDatabase() {
  // Pre-carga desactivada para permitir base de datos limpia y soporte de Excels masivos
  // (Si se requiere cargar, se realiza desde la interfaz de administración)

  try {
    const client = await pool.connect();
    console.log("[DB] Conexión establecida con PostgreSQL.");
    usePostgres = true;

    // Ejecutar init.sql para estructuras principales
    const initSqlPath = path.join(__dirname, "..", "..", "database", "init.sql");
    if (fs.existsSync(initSqlPath)) {
      const sql = fs.readFileSync(initSqlPath, "utf-8");
      await client.query(sql);
    }

    // Migraciones automáticas de auditoría y geolocalización
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NULL,
          username VARCHAR(100),
          action VARCHAR(80) NOT NULL,
          entity_type VARCHAR(80),
          entity_id VARCHAR(100),
          details JSONB,
          ip_address VARCHAR(80),
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
      `);

      await client.query(`
        ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7);
        ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);
        ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS captured_at TIMESTAMP;
        ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) DEFAULT 'SYNCED';
        ALTER TABLE delivery_evidences ADD COLUMN IF NOT EXISTS file_data BYTEA;
      `);
    } catch (migErr) {
      console.warn("[DB] Migración no crítica:", migErr.message);
    }

    // Asegurar usuarios iniciales
    const adminHash = await bcrypt.hash("Admin123!", 10);
    const terrenoHash = await bcrypt.hash("Terreno123!", 10);

    await client.query(
      `INSERT INTO users (username, password_hash, role, active)
       VALUES ('admin', $1, 'ADMIN', TRUE)
       ON CONFLICT (username) DO NOTHING;`,
      [adminHash]
    );
    await client.query(
      `INSERT INTO users (username, password_hash, role, active)
       VALUES ('terreno', $1, 'FIELD_AGENT', TRUE)
       ON CONFLICT (username) DO NOTHING;`,
      [terrenoHash]
    );

    // Si la base de datos está vacía y encontramos un Excel inicial, sincronizarlo
    const countRes = await client.query("SELECT COUNT(*) FROM guardians");
    if (Number(countRes.rows[0].count) === 0 && initialExcel) {
      console.log(`[DB] Población inicial de PostgreSQL desde ${path.basename(initialExcel)}...`);
      const { results } = parseExcelBeneficiaries(initialExcel);
      await syncDataToPostgres(client, results, false);
      console.log(`[DB] ${results.length} beneficiarios cargados en PostgreSQL.`);
    }

    client.release();
  } catch (error) {
    usePostgres = false;
    console.log(`[DB AVISO] PostgreSQL no disponible (${error.message}). Modo almacén local 100% activo.`);
  }
}

module.exports = {
  pool,
  get usePostgres() {
    return usePostgres;
  },
  memoryStore,
  initDatabase,
  syncDataToPostgres,
  loadExcelToMemory,
  findInitialExcelFile,
};
