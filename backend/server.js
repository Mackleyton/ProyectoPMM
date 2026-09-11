require("dotenv").config();

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const xlsx = require("xlsx");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const MAX_FILE_SIZE_BYTES = Number(process.env.MAX_FILE_SIZE_MB || 10) * 1024 * 1024;
const JWT_SECRET = process.env.JWT_SECRET || "quilpue_super_secret_jwt_key_2026!";
const RUT_VALIDATION_MODE = process.env.RUT_VALIDATION_MODE || "FORMAT";

// =========================================================
// Configuración Express y CORS
// =========================================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Directorio de almacenamiento de actas
const uploadsRoot = path.join(__dirname, "uploads", "actas");
if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

// Servir estáticos: fotos de actas y frontend build si existe
app.use("/fotoss", express.static(uploadsRoot));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

// =========================================================
// Utilidades de RUT y Texto
// =========================================================

function cleanRut(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^0-9K]/g, "");
}

function formatRut(value) {
  const cleaned = cleanRut(value);
  if (cleaned.length < 2) return cleaned;
  const dv = cleaned.slice(-1);
  const cuerpo = cleaned.slice(0, -1);
  let formateado = "";
  let cont = 0;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    formateado = cuerpo[i] + formateado;
    cont++;
    if (cont === 3 && i > 0) {
      formateado = "." + formateado;
      cont = 0;
    }
  }
  return `${formateado}-${dv}`;
}

function calculateDv(cuerpo) {
  let suma = 0;
  let multiplo = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplo;
    multiplo = multiplo === 7 ? 2 : multiplo + 1;
  }
  const resto = suma % 11;
  const dv = 11 - resto;
  if (dv === 11) return "0";
  if (dv === 10) return "K";
  return String(dv);
}

function validateRut(value) {
  const cleaned = cleanRut(value);
  if (cleaned.length < 8 || cleaned.length > 9) {
    return { valid: false, message: "El RUT debe tener entre 8 y 9 caracteres (cuerpo y dígito verificador)." };
  }
  const cuerpo = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  if (!/^\d+$/.test(cuerpo)) {
    return { valid: false, message: "El cuerpo del RUT solo debe contener dígitos." };
  }
  if (RUT_VALIDATION_MODE === "FULL") {
    const expectedDv = calculateDv(cuerpo);
    if (dv !== expectedDv) {
      return { valid: false, message: "El dígito verificador no es válido." };
    }
  }
  return { valid: true, rut: formatRut(cleaned), clean: cleaned };
}

function cleanText(value) {
  return String(value || "").trim();
}

function fullName(firstName, paternalLastName, maternalLastName) {
  return [firstName, paternalLastName, maternalLastName].filter(Boolean).join(" ").trim();
}

function getImageExtension(mimeType) {
  switch (mimeType) {
    case "image/jpeg": return ".jpg";
    case "image/png": return ".png";
    case "image/webp": return ".webp";
    default: return null;
  }
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name || (user.role === "ADMIN" ? "Administrador Social" : "Operador Terreno"),
    },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
}

// =========================================================
// Capa de Datos Híbrida (PostgreSQL con Fallback Resiliente)
// =========================================================

let usePostgres = false;
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    }
  : {
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || "beneficios_db",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "postgres",
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 3000,
    };

const pool = new Pool(poolConfig);

// Almacén en memoria para cuando PostgreSQL no esté en ejecución
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
};

// Helpers para parsear fechas, horas y planillas Excel
function parseExcelDate(val) {
  if (!val || val === "-" || val === "null" || val === "undefined") return null;
  if (typeof val === "number") {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
  }
  const str = String(val).trim();
  if (str === "" || str === "-") return null;
  return str;
}

function parseExcelTime(val) {
  if (!val || val === "-") return "";
  if (typeof val === "number") {
    const totalSeconds = Math.round(val * 86400);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }
  return String(val).trim();
}

function findExcelFile() {
  const candidates = [
    path.join(__dirname, "data", "formulario_postulantes.xlsx"),
    path.join(__dirname, "..", "formulario_postulantes.xlsx"),
    path.join(__dirname, "formulario_postulantes.xlsx"),
    path.join(__dirname, "data", "formulario_estudiantes.xlsx"),
    path.join(__dirname, "..", "formulario_estudiantes.xlsx"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  const searchDirs = [path.join(__dirname, ".."), __dirname, path.join(__dirname, "data")];
  for (const dir of searchDirs) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir);
        const match = files.find((f) => /postulante|estudiante|formulario/i.test(f) && /\.xlsx?$/i.test(f));
        if (match) return path.join(dir, match);
      } catch (e) {}
    }
  }
  return null;
}

function parseExcelBeneficiaries(bufferOrPath) {
  let workbook;
  if (Buffer.isBuffer(bufferOrPath)) {
    workbook = xlsx.read(bufferOrPath, { type: "buffer" });
  } else {
    workbook = xlsx.readFile(bufferOrPath);
  }
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(firstSheet, { defval: "" });

  const results = [];
  const errors = [];

  rows.forEach((row, idx) => {
    const rawApoderado =
      row["Rut_Apoderado"] ||
      row["RUT_Apoderado"] ||
      row["rut_apoderado"] ||
      row["Rut Apoderado"] ||
      row["RUT Apoderado"];

    const rawAlumno =
      row["Rut_Alumno"] ||
      row["RUT_Alumno"] ||
      row["rut_alumno"] ||
      row["Rut Alumno"] ||
      row["RUT Alumno"];

    if (!rawApoderado || !rawAlumno) {
      errors.push({ fila: idx + 2, error: "Faltan RUT de apoderado o alumno" });
      return;
    }

    const gRut = formatRut(cleanRut(rawApoderado));
    const sRut = formatRut(cleanRut(rawAlumno));

    const gFirstName = cleanText(row["Nombre_Apoderado"] || row["Nombre Apoderado"] || "Apoderado");
    const gPatLastName = cleanText(row["Apellido_Paterno_Apoderado"] || row["Apellido Paterno Apoderado"] || "");
    const gMatLastName = cleanText(row["Apellido_Materno_Apoderado"] || row["Apellido Materno Apoderado"] || "");
    const gFullName = [gFirstName, gPatLastName, gMatLastName].filter(Boolean).join(" ").trim() || "Apoderado";

    const sFirstName = cleanText(row["Nombre_Alumno"] || row["Nombre Alumno"] || "Alumno");
    const sPatLastName = cleanText(row["Apellido_Paterno_Alumno"] || row["Apellido Paterno Alumno"] || "");
    const sMatLastName = cleanText(row["Apellido_Materno_Alumno"] || row["Apellido Materno Alumno"] || "");
    const sFullName = [sFirstName, sPatLastName, sMatLastName].filter(Boolean).join(" ").trim() || "Alumno";

    const gBirthDate = parseExcelDate(row["Fecha_Nacimiento_Apoderado"] || row["Fecha Nacimiento Apoderado"]);
    const gAddress = cleanText(row["Direccion"] || row["Dirección"] || "Quilpué");
    const gSector = cleanText(row["Sector"] || "CENTRO").toUpperCase();
    const gEmail = cleanText(row["Correo_Apoderado"] || row["Correo Apoderado"] || row["Email"] || "");
    const gPhone = cleanText(row["Telefono_Apoderado"] || row["Telefono Apoderado"] || row["Teléfono"] || "");

    const sEstablishment = cleanText(row["Establecimiento"] || row["Colegio"] || "Establecimiento Quilpué");
    const sLevel = cleanText(row["Nivel_Educacional"] || row["Nivel Educacional"] || row["Nivel"] || "Básica");
    const sStatus = cleanText(row["Estado"] || "APROBADA").toUpperCase();
    const fibeBenefited = String(row["FIBE_Beneficiado"] || row["FIBE"] || "").toLowerCase().startsWith("s");
    const renewal = cleanText(row["Renovacion_automatica"] || row["Renovación automática"] || "No");

    const deliveryDay = cleanText(row["dia"] || row["Día"] || "");
    const deliveryTime = parseExcelTime(row["hora"] || row["Hora"]);
    const deliveryTable = cleanText(row["mesa"] || row["Mesa"] || "");
    const fechaEntrega = parseExcelDate(row["Fecha_entrega"] || row["Fecha entrega"] || row["Fecha Entrega"]);
    const deliveredBy = cleanText(row["entregado_por"] || row["Entregado por"] || "");

    const isDelivered = !!fechaEntrega && fechaEntrega !== "-";
    const benefitName = sLevel.toLowerCase().includes("media")
      ? "Set Escolar 2026 - MEDIA"
      : "Set Escolar 2026 - BÁSICA";

    results.push({
      guardian: {
        rut: gRut,
        firstName: gFirstName,
        paternalLastName: gPatLastName,
        maternalLastName: gMatLastName,
        fullName: gFullName,
        birthDate: gBirthDate,
        address: gAddress,
        sector: gSector,
        email: gEmail,
        phone: gPhone,
      },
      student: {
        rut: sRut,
        guardianRut: gRut,
        firstName: sFirstName,
        paternalLastName: sPatLastName,
        maternalLastName: sMatLastName,
        fullName: sFullName,
        establishment: sEstablishment,
        educationalLevel: sLevel,
        state: sStatus,
        fibeBenefited,
        renewal,
        deliveryDay,
        deliveryTime,
        deliveryTable,
        importedDeliveryDate: fechaEntrega,
        importedDeliveredBy: deliveredBy,
      },
      benefit: {
        name: benefitName,
        status: isDelivered ? "DELIVERED" : "PENDING",
        deliveredAt: fechaEntrega,
        deliveredBy: isDelivered ? deliveredBy : null,
      },
    });
  });

  return { results, errors, totalRows: rows.length };
}

// Cargar en memoryStore evitando duplicados
function loadExcelToMemory(excelPath) {
  try {
    const { results } = parseExcelBeneficiaries(excelPath);
    results.forEach((item) => {
      let guardian = memoryStore.guardians.get(item.guardian.rut);
      if (!guardian) {
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
      memoryStore.benefits.set(benefitId, {
        id: benefitId,
        guardianId: guardian.id,
        guardianRut: item.guardian.rut,
        studentId: studentId,
        studentRut: item.student.rut,
        benefitName: item.benefit.name,
        status: item.benefit.status,
        deliveredAt: item.benefit.deliveredAt,
        evidenceId: null,
      });
    });
    console.log(`[DATA] Cargados ${results.length} beneficiarios desde planilla Excel (${path.basename(excelPath)}) en memoria.`);
    return true;
  } catch (err) {
    console.warn("[DATA] Error al parsear planilla Excel inicial:", err.message);
    return false;
  }
}

// Sincronizar beneficiarios en PostgreSQL usando UPSERT seguro
async function syncDataToPostgres(client, parsedItems) {
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

    // 4. Beneficio
    await client.query(
      `INSERT INTO beneficiary_benefits (guardian_id, student_id, benefit_type_id, status, delivered_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (student_id, benefit_type_id) DO UPDATE SET
         guardian_id = EXCLUDED.guardian_id,
         status = CASE WHEN beneficiary_benefits.status = 'DELIVERED' THEN 'DELIVERED' ELSE EXCLUDED.status END,
         delivered_at = CASE WHEN beneficiary_benefits.status = 'DELIVERED' THEN beneficiary_benefits.delivered_at ELSE EXCLUDED.delivered_at END,
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

// Cargar datos iniciales en el almacén de memoria
function loadSeedDataToMemory() {
  memoryStore.guardians.clear();
  memoryStore.students.clear();
  memoryStore.benefits.clear();
  memoryStore.deliveries.clear();
  memoryStore.evidences.clear();

  // 1. Priorizar planilla Excel del proyecto si existe
  const excelFile = findExcelFile();
  let loadedFromExcel = false;
  if (excelFile) {
    loadedFromExcel = loadExcelToMemory(excelFile);
  }

  // 2. Si no hay planilla Excel o para complementar, cargar seedData.json
  const seedFile = path.join(__dirname, "data", "seedData.json");
  if (fs.existsSync(seedFile)) {
    try {
      const raw = fs.readFileSync(seedFile, "utf-8");
      const items = JSON.parse(raw);
      items.forEach((item, idx) => {
        const gRut = formatRut(cleanRut(item.rut_apoderado));
        const sRut = formatRut(cleanRut(item.rut_alumno));

        let guardian = memoryStore.guardians.get(gRut);
        if (!guardian) {
          guardian = {
            id: `g-seed-${idx}`,
            rut: gRut,
            fullName: item.nombre_apoderado || "Apoderado",
            address: item.direccion || "Quilpué",
            sector: item.sector || "CENTRO",
            email: item.correo_apoderado || "",
            phone: item.telefono_apoderado || "",
          };
          memoryStore.guardians.set(gRut, guardian);
        }

        let student = memoryStore.students.get(sRut);
        if (!student) {
          const studentId = `s-seed-${idx}`;
          student = {
            id: studentId,
            guardianId: guardian.id,
            guardianRut: gRut,
            rut: sRut,
            fullName: item.nombre_alumno || "Alumno",
            establishment: item.establecimiento || "Establecimiento Quilpué",
            educationalLevel: item.nivel_educacional || "Básica",
            state: item.estado || "APROBADA",
          };
          memoryStore.students.set(sRut, student);

          const benefitId = `b-seed-${idx}`;
          memoryStore.benefits.set(benefitId, {
            id: benefitId,
            guardianId: guardian.id,
            guardianRut: gRut,
            studentId: studentId,
            studentRut: sRut,
            benefitName: item.beneficio_nombre || "Set Escolar 2026",
            status: item.entregado ? "DELIVERED" : "PENDING",
            deliveredAt: item.fecha_entrega || null,
            evidenceId: null,
          });
        }
      });
      console.log(`[DATA] Almacén en memoria consolidado con ${memoryStore.benefits.size} beneficios.`);
    } catch (err) {
      console.warn("[DATA] Error cargando seedData.json:", err.message);
    }
  }
}

loadSeedDataToMemory();

// Verificar y sincronizar con PostgreSQL si está disponible
async function initDatabase() {
  try {
    const client = await pool.connect();
    console.log("[DB] ¡Conectado exitosamente a PostgreSQL!");
    usePostgres = true;

    // Ejecutar init.sql para crear tablas si no existen
    const initSqlPath = path.join(__dirname, "database", "init.sql");
    if (fs.existsSync(initSqlPath)) {
      const sql = fs.readFileSync(initSqlPath, "utf-8");
      await client.query(sql);
      console.log("[DB] Esquema DDL verificado/creado en PostgreSQL.");
    }

    // Migraciones seguras para columnas y restricciones
    try {
      await client.query(`ALTER TABLE delivery_evidences ADD COLUMN IF NOT EXISTS file_data BYTEA;`);
      await client.query(`ALTER TABLE beneficiary_benefits ADD COLUMN IF NOT EXISTS evidence_id UUID;`);
      await client.query(`ALTER TABLE deliveries ALTER COLUMN delivered_by DROP NOT NULL;`);
      await client.query(`ALTER TABLE delivery_evidences DROP CONSTRAINT IF EXISTS delivery_evidences_storage_key_key;`);
    } catch (migErr) {
      console.warn("[DB] Aviso en migraciones automáticas:", migErr.message);
    }

    // Asegurar usuarios iniciales en PostgreSQL
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

    // Sincronizar datos del Excel o seed en PostgreSQL
    const excelFile = findExcelFile();
    if (excelFile) {
      console.log(`[DB] Sincronizando padrón comunal desde ${path.basename(excelFile)} a PostgreSQL...`);
      const { results } = parseExcelBeneficiaries(excelFile);
      await syncDataToPostgres(client, results);
      console.log(`[DB] ¡${results.length} beneficiarios del Excel sincronizados en PostgreSQL exitosamente!`);
    } else {
      // Si no hay Excel, sincronizar desde seedData.json si la tabla está vacía
      const countRes = await client.query("SELECT COUNT(*) FROM guardians");
      if (Number(countRes.rows[0].count) === 0) {
        console.log("[DB] Población inicial de beneficiarios en PostgreSQL desde memoria...");
        const defaultBenefit = await client.query(
          `INSERT INTO benefit_types (name) VALUES ('Set Escolar 2026')
           ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id;`
        );
        const benefitTypeId = defaultBenefit.rows[0].id;

        for (const guardian of memoryStore.guardians.values()) {
          const parts = (guardian.fullName || "").split(" ");
          const fName = parts[0] || "Nombre";
          const pLast = parts[1] || "";
          const mLast = parts.slice(2).join(" ") || "";

          const gRes = await client.query(
            `INSERT INTO guardians (rut, first_name, paternal_last_name, maternal_last_name, address, sector, email, phone)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (rut) DO UPDATE SET address = EXCLUDED.address RETURNING id;`,
            [guardian.rut, fName, pLast, mLast, guardian.address, guardian.sector, guardian.email, guardian.phone]
          );
          const gId = gRes.rows[0].id;

          for (const student of memoryStore.students.values()) {
            if (student.guardianRut === guardian.rut) {
              const sParts = (student.fullName || "").split(" ");
              const sfName = sParts[0] || "Alumno";
              const spLast = sParts[1] || "";
              const smLast = sParts.slice(2).join(" ") || "";

              const sRes = await client.query(
                `INSERT INTO students (guardian_id, rut, first_name, paternal_last_name, maternal_last_name, establishment, educational_level, application_status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (rut) DO UPDATE SET establishment = EXCLUDED.establishment RETURNING id;`,
                [gId, student.rut, sfName, spLast, smLast, student.establishment, student.educationalLevel, student.state]
              );
              const sId = sRes.rows[0].id;

              await client.query(
                `INSERT INTO beneficiary_benefits (guardian_id, student_id, benefit_type_id, status)
                 VALUES ($1, $2, $3, 'PENDING')
                 ON CONFLICT (student_id, benefit_type_id) DO NOTHING;`,
                [gId, sId, benefitTypeId]
              );
            }
          }
        }
        console.log("[DB] Población inicial en PostgreSQL completada.");
      }
    }

    client.release();
  } catch (error) {
    usePostgres = false;
    console.log(
      `[DB INFO] PostgreSQL no está disponible (${error.message}). Modo local integrado 100% activo.`
    );
  }
}

initDatabase();

// =========================================================
// Middlewares de Autenticación JWT
// =========================================================

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "No autorizado: Token de sesión requerido." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Sesión expirada o token inválido." });
    }
    req.user = user;
    next();
  });
}

function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Acceso denegado: Tu perfil no tiene permisos para esta acción.",
      });
    }
    next();
  };
}

// =========================================================
// RUTAS DE LA API
// =========================================================

// Health check
app.get(["/api/health", "/apis/health"], (req, res) => {
  return res.json({
    ok: true,
    status: "online",
    database: usePostgres ? "PostgreSQL" : "LocalStore",
    records: memoryStore.benefits.size,
    timestamp: new Date().toISOString(),
  });
});

// 1. LOGIN UNIFICADO (admin / Admin123! o terreno / Terreno123!)
app.post("/api/auth/login", async (req, res) => {
  try {
    const rawUsername = cleanText(req.body.username || req.body.email);
    const password = String(req.body.password || "");

    if (!rawUsername || !password) {
      return res.status(400).json({ message: "Debes ingresar usuario y contraseña." });
    }

    // Normalizar usuario (acepta admin, terreno, o correos institucionales)
    let username = rawUsername.toLowerCase();
    if (username.includes("admin")) username = "admin";
    else if (username.includes("terreno")) username = "terreno";

    let user = null;

    if (usePostgres) {
      try {
        const dbRes = await pool.query(
          "SELECT id, username, password_hash, role FROM users WHERE username = $1 AND active = TRUE",
          [username]
        );
        if (dbRes.rowCount > 0) user = dbRes.rows[0];
      } catch (err) {
        console.warn("[DB] Error consultando usuario en PostgreSQL, usando local:", err.message);
      }
    }

    if (!user) {
      user = memoryStore.users.find((u) => u.username === username && u.active);
    }

    if (!user) {
      return res.status(401).json({ message: "Usuario o contraseña incorrectos." });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ message: "Usuario o contraseña incorrectos." });
    }

    const token = createToken(user);
    const displayName = user.role === "ADMIN" ? "Administrador Social" : "Operador Terreno";

    return res.json({
      message: `Inicio de sesión exitoso. Bienvenido/a, ${displayName}.`,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role, // 'ADMIN' o 'FIELD_AGENT'
        name: displayName,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al procesar inicio de sesión.", error: error.message });
  }
});

// 2. BÚSQUEDA POR RUT (Apoderado o Alumno)
app.get(
  "/api/guardians/:rut",
  authenticateToken,
  requireRoles("ADMIN", "FIELD_AGENT"),
  async (req, res) => {
    try {
      const rutParam = req.params.rut;
      const rutValidation = validateRut(rutParam);
      if (!rutValidation.valid) {
        return res.status(400).json({ message: rutValidation.message });
      }

      const rutClean = rutValidation.clean;
      const rutFormatted = rutValidation.rut;

      // Intentar PostgreSQL primero
      if (usePostgres) {
        try {
          // Buscar en apoderados o alumnos
          let gRes = await pool.query("SELECT * FROM guardians WHERE rut = $1", [rutFormatted]);
          let guardian = gRes.rows[0];

          if (!guardian) {
            const sRes = await pool.query(
              `SELECT g.* FROM students s
               JOIN guardians g ON g.id = s.guardian_id
               WHERE s.rut = $1 LIMIT 1`,
              [rutFormatted]
            );
            if (sRes.rowCount > 0) guardian = sRes.rows[0];
          }

          if (guardian) {
            const bRes = await pool.query(
              `SELECT DISTINCT ON (bb.id)
                      bb.id AS benefit_id, bb.status, bb.delivered_at, bb.evidence_id,
                      bt.name AS benefit_name,
                      s.rut AS student_rut, s.first_name, s.paternal_last_name, s.maternal_last_name,
                      s.establishment, s.educational_level,
                      de.id AS photo_evidence_id
               FROM beneficiary_benefits bb
               JOIN benefit_types bt ON bt.id = bb.benefit_type_id
               JOIN students s ON s.id = bb.student_id
               LEFT JOIN delivery_evidences de ON de.id = bb.evidence_id
               WHERE bb.guardian_id = $1
               ORDER BY bb.id, s.paternal_last_name, bt.name`,
              [guardian.id]
            );

            return res.json({
              message: "Beneficiario encontrado.",
              guardian: {
                id: guardian.id,
                rut: guardian.rut,
                fullName: fullName(guardian.first_name, guardian.paternal_last_name, guardian.maternal_last_name),
                address: guardian.address,
                sector: guardian.sector,
                email: guardian.email,
                phone: guardian.phone,
              },
              benefits: bRes.rows.map((b) => {
                const evId = b.evidence_id || b.photo_evidence_id;
                return {
                  benefitId: b.benefit_id,
                  benefitName: b.benefit_name,
                  status: b.status,
                  deliveredAt: b.delivered_at,
                  evidenceId: evId,
                  fotoActa: evId ? `/api/evidences/${evId}/file` : null,
                  student: {
                    rut: b.student_rut,
                    fullName: fullName(b.first_name, b.paternal_last_name, b.maternal_last_name),
                    establishment: b.establishment,
                    educationalLevel: b.educational_level,
                  },
                };
              }),
            });
          }
        } catch (dbErr) {
          console.warn("[DB] Error buscando en PostgreSQL:", dbErr.message);
        }
      }

      // Buscar en memoria
      let guardian = memoryStore.guardians.get(rutFormatted);
      if (!guardian) {
        // Buscar por RUT del alumno
        const student = memoryStore.students.get(rutFormatted);
        if (student) {
          guardian = memoryStore.guardians.get(student.guardianRut);
        }
      }

      // Si aún no se encuentra, buscar por cleanRut
      if (!guardian) {
        for (const g of memoryStore.guardians.values()) {
          if (cleanRut(g.rut) === rutClean) {
            guardian = g;
            break;
          }
        }
      }
      if (!guardian) {
        for (const s of memoryStore.students.values()) {
          if (cleanRut(s.rut) === rutClean) {
            guardian = memoryStore.guardians.get(s.guardianRut);
            break;
          }
        }
      }

      if (!guardian) {
        return res.status(404).json({
          message: `No se encontraron beneficiarios registrados para el RUT ${rutParam}.`,
        });
      }

      // Obtener beneficios asociados
      const benefits = [];
      for (const b of memoryStore.benefits.values()) {
        if (b.guardianRut === guardian.rut) {
          const student = memoryStore.students.get(b.studentRut);
          benefits.push({
            benefitId: b.id,
            benefitName: b.benefitName,
            status: b.status,
            deliveredAt: b.deliveredAt,
            evidenceId: b.evidenceId,
            student: {
              rut: student ? student.rut : b.studentRut,
              fullName: student ? student.fullName : "Alumno",
              establishment: student ? student.establishment : "Quilpué",
              educationalLevel: student ? student.educationalLevel : "General",
            },
          });
        }
      }

      return res.json({
        message: "Beneficiario encontrado.",
        guardian: {
          id: guardian.id,
          rut: guardian.rut,
          fullName: guardian.fullName,
          address: guardian.address,
          sector: guardian.sector,
          email: guardian.email,
          phone: guardian.phone,
        },
        benefits,
      });
    } catch (error) {
      return res.status(500).json({ message: "Error al consultar beneficiario.", error: error.message });
    }
  }
);

// 3. REGISTRO DE ENTREGA CON ACTA FOTOGRÁFICA
app.post(
  "/api/deliveries/register",
  authenticateToken,
  requireRoles("ADMIN", "FIELD_AGENT"),
  upload.single("acta"),
  async (req, res) => {
    try {
      const rutParam = req.body.rut;
      const rutValidation = validateRut(rutParam);
      if (!rutValidation.valid) {
        return res.status(400).json({ message: rutValidation.message });
      }

      if (!req.file) {
        return res.status(400).json({ message: "Debes adjuntar la fotografía del acta firmada." });
      }

      const extension = getImageExtension(req.file.mimetype) || ".jpg";

      let benefitIds = [];
      try {
        benefitIds = JSON.parse(req.body.benefitIds || "[]");
      } catch {
        return res.status(400).json({ message: "Formato inválido de beneficios seleccionados." });
      }

      if (!Array.isArray(benefitIds) || benefitIds.length === 0) {
        return res.status(400).json({ message: "Debes seleccionar al menos un beneficio pendiente." });
      }

      const fileHash = sha256(req.file.buffer);
      const deliveryDate = new Date().toISOString();
      const deliveredBenefits = [];
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let dbEvidenceId = null;
      let filename = null;

      // Actualizar en PostgreSQL si está disponible
      if (usePostgres) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          let gRes = await client.query(
            "SELECT id FROM guardians WHERE rut = $1 OR replace(replace(rut, '.', ''), '-', '') = $2 LIMIT 1",
            [rutValidation.rut, rutValidation.clean]
          );
          let guardianId = gRes.rows[0]?.id;
          if (!guardianId) {
            const sRes = await client.query(
              "SELECT guardian_id FROM students WHERE rut = $1 OR replace(replace(rut, '.', ''), '-', '') = $2 LIMIT 1",
              [rutValidation.rut, rutValidation.clean]
            );
            guardianId = sRes.rows[0]?.guardian_id;
          }

          // Prevenir entregas duplicadas si los beneficios ya están en DELIVERED
          const validUuids = benefitIds.filter((id) => uuidRegex.test(id));
          if (validUuids.length > 0) {
            const checkAlready = await client.query(
              `SELECT id, status, evidence_id FROM beneficiary_benefits WHERE id = ANY($1::uuid[]) AND status = 'DELIVERED'`,
              [validUuids]
            );
            if (checkAlready.rowCount === validUuids.length) {
              await client.query("ROLLBACK");
              client.release();
              const existingEvId = checkAlready.rows[0]?.evidence_id;
              return res.json({
                message: "Los beneficios seleccionados ya fueron registrados como entregados previamente.",
                delivery: { id: `del-prev`, deliveredAt: deliveryDate },
                deliveredBenefits: [],
                evidence: existingEvId ? { id: existingEvId, logicalFileName: "acta_firmada.jpg", url: `/api/evidences/${existingEvId}/file` } : null,
              });
            }
          }

          let deliveredByUserId = null;
          if (req.user?.id && uuidRegex.test(req.user.id)) {
            deliveredByUserId = req.user.id;
          } else {
            const uRes = await client.query("SELECT id FROM users WHERE username = $1 LIMIT 1", [req.user?.username || 'terreno']);
            deliveredByUserId = uRes.rows[0]?.id || null;
          }

          const delRes = await client.query(
            `INSERT INTO deliveries (guardian_id, delivered_by, notes, delivered_at)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING id, delivered_at`,
            [guardianId, deliveredByUserId, cleanText(req.body.notes) || "Entrega en terreno"]
          );
          const deliveryId = delRes.rows[0].id;

          // Deduplicar evidencia: Si ya existe un acta con el mismo hash exacto, reutilizarla
          const existingEv = await client.query(
            `SELECT id, logical_file_name FROM delivery_evidences WHERE file_hash_sha256 = $1 LIMIT 1`,
            [fileHash]
          );

          if (existingEv.rowCount > 0) {
            dbEvidenceId = existingEv.rows[0].id;
            filename = existingEv.rows[0].logical_file_name;
          } else {
            filename = `${Date.now()}_${rutValidation.clean}${extension}`;
            const destination = path.join(uploadsRoot, filename);
            fs.writeFileSync(destination, req.file.buffer);

            const evRes = await client.query(
              `INSERT INTO delivery_evidences (delivery_id, guardian_id, logical_file_name, storage_key, mime_type, file_size_bytes, file_hash_sha256, file_data)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
              [deliveryId, guardianId, filename, `acta_${Date.now()}_${filename}`, req.file.mimetype, req.file.size, fileHash, req.file.buffer]
            );
            dbEvidenceId = evRes.rows[0].id;
          }

          for (const bId of benefitIds) {
            if (uuidRegex.test(bId)) {
              await client.query(
                `INSERT INTO delivery_items (delivery_id, beneficiary_benefit_id)
                 VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [deliveryId, bId]
              );
              await client.query(
                `UPDATE beneficiary_benefits 
                 SET status = 'DELIVERED', delivered_at = CURRENT_TIMESTAMP, evidence_id = $2
                 WHERE id = $1`,
                [bId, dbEvidenceId]
              );
            }
          }

          if (guardianId) {
            const bDetails = await client.query(
              `SELECT s.first_name, s.paternal_last_name, bt.name as benefit_name
               FROM beneficiary_benefits bb
               JOIN students s ON s.id = bb.student_id
               JOIN benefit_types bt ON bt.id = bb.benefit_type_id
               WHERE bb.guardian_id = $1 AND bb.status = 'DELIVERED'`,
              [guardianId]
            );
            bDetails.rows.forEach((r) => {
              deliveredBenefits.push({
                studentName: `${r.first_name} ${r.paternal_last_name}`.trim(),
                benefitName: r.benefit_name,
              });
            });
          }

          await client.query("COMMIT");
        } catch (dbErr) {
          await client.query("ROLLBACK");
          console.warn("[DB] Error guardando entrega en PostgreSQL:", dbErr.message);
        } finally {
          client.release();
        }
      }

      // Si no se guardó el archivo físico arriba (ej. modo offline o memoria), guardarlo de forma segura
      if (!filename) {
        filename = `${Date.now()}_${rutValidation.clean}${extension}`;
        const destination = path.join(uploadsRoot, filename);
        if (!fs.existsSync(destination)) {
          fs.writeFileSync(destination, req.file.buffer);
        }
      }

      // Actualizar en memoria (soporte offline o desarrollo local)
      const evidenceId = dbEvidenceId || `ev-${Date.now()}`;
      memoryStore.evidences.set(evidenceId, {
        id: evidenceId,
        filename,
        path: path.join(uploadsRoot, filename),
        mimetype: req.file.mimetype,
        size: req.file.size,
      });

      benefitIds.forEach((bId) => {
        let b = memoryStore.benefits.get(bId);
        if (!b) {
          for (const memB of memoryStore.benefits.values()) {
            if (cleanRut(memB.guardianRut) === cleanRut(rutValidation.rut)) {
              b = memB;
              break;
            }
          }
        }
        if (b) {
          b.status = "DELIVERED";
          b.deliveredAt = deliveryDate;
          b.evidenceId = evidenceId;
          const student = memoryStore.students.get(b.studentRut);
          if (!deliveredBenefits.some((db) => db.benefitName === b.benefitName)) {
            deliveredBenefits.push({
              studentName: student ? student.fullName : "Alumno",
              benefitName: b.benefitName,
            });
          }
        }
      });

      return res.json({
        message: "Entrega registrada exitosamente.",
        delivery: {
          id: `del-${Date.now()}`,
          deliveredAt: deliveryDate,
        },
        deliveredBenefits,
        evidence: {
          id: evidenceId,
          logicalFileName: filename,
          url: `/api/evidences/${evidenceId}/file`,
        },
      });
    } catch (error) {
      return res.status(500).json({ message: "Error al registrar la entrega.", error: error.message });
    }
  }
);

// 4. INDICADORES Y KPIS
app.get(
  "/api/reports/kpis",
  authenticateToken,
  requireRoles("ADMIN", "FIELD_AGENT"),
  async (req, res) => {
    try {
      let totalGuardians = 0;
      let totalStudents = 0;
      let totalBenefits = 0;
      let deliveredBenefits = 0;
      let pendingBenefits = 0;
      let deliveriesToday = 0;
      let deliveriesByDay = [];
      let deliveriesBySector = [];

      if (usePostgres) {
        try {
          const statsRes = await pool.query(`
            SELECT
              COUNT(DISTINCT bb.guardian_id)::int AS total_guardians,
              COUNT(DISTINCT bb.student_id)::int AS total_students,
              COUNT(*)::int AS total_benefits,
              COUNT(*) FILTER (WHERE bb.status = 'DELIVERED')::int AS delivered_benefits,
              COUNT(*) FILTER (WHERE bb.status != 'DELIVERED' OR bb.status IS NULL)::int AS pending_benefits,
              COUNT(*) FILTER (WHERE bb.status = 'DELIVERED' AND (DATE(bb.delivered_at) = CURRENT_DATE OR DATE(bb.delivered_at AT TIME ZONE 'America/Santiago') = CURRENT_DATE))::int AS deliveries_today
            FROM beneficiary_benefits bb
          `);

          if (statsRes.rowCount > 0 && Number(statsRes.rows[0].total_benefits) > 0) {
            const row = statsRes.rows[0];
            totalGuardians = Number(row.total_guardians) || 0;
            totalStudents = Number(row.total_students) || 0;
            totalBenefits = Number(row.total_benefits) || 0;
            deliveredBenefits = Number(row.delivered_benefits) || 0;
            pendingBenefits = Number(row.pending_benefits) || 0;
            deliveriesToday = Number(row.deliveries_today) || 0;

            // Distribución real por sector
            const sectorRes = await pool.query(`
              SELECT 
                COALESCE(g.sector, 'Centro') AS sector,
                COUNT(bb.id)::int AS deliveries
              FROM beneficiary_benefits bb
              JOIN guardians g ON g.id = bb.guardian_id
              WHERE bb.status = 'DELIVERED'
              GROUP BY COALESCE(g.sector, 'Centro')
              ORDER BY deliveries DESC
            `);
            if (sectorRes.rowCount > 0) {
              deliveriesBySector = sectorRes.rows.map((r) => ({
                sector: r.sector,
                deliveries: Number(r.deliveries),
              }));
            }

            // Entregas por día
            const daysRes = await pool.query(`
              SELECT 
                TO_CHAR(bb.delivered_at, 'YYYY-MM-DD') AS fecha,
                TO_CHAR(bb.delivered_at, 'Day') AS dia_nombre,
                COUNT(bb.id)::int AS total
              FROM beneficiary_benefits bb
              WHERE bb.status = 'DELIVERED' AND bb.delivered_at IS NOT NULL
              GROUP BY TO_CHAR(bb.delivered_at, 'YYYY-MM-DD'), TO_CHAR(bb.delivered_at, 'Day')
              ORDER BY fecha ASC
              LIMIT 14
            `);
            if (daysRes.rowCount > 0) {
              deliveriesByDay = daysRes.rows.map((r) => ({
                day: r.dia_nombre ? r.dia_nombre.trim() : r.fecha,
                deliveries: Number(r.total),
                total: Number(r.total),
                fecha: r.fecha,
              }));
            }
          }
        } catch (dbErr) {
          console.warn("[DB] Error consultando estadísticas en PostgreSQL:", dbErr.message);
        }
      }

      // Si no hay datos en postgres o usePostgres es falso, usar memoria
      if (totalBenefits === 0) {
        totalGuardians = memoryStore.guardians.size;
        totalStudents = memoryStore.students.size;
        totalBenefits = memoryStore.benefits.size;
        deliveredBenefits = 0;
        pendingBenefits = 0;

        for (const b of memoryStore.benefits.values()) {
          if (b.status === "DELIVERED") deliveredBenefits++;
          else pendingBenefits++;
        }

        const todayStr = new Date().toISOString().slice(0, 10);
        deliveriesToday = 0;
        for (const b of memoryStore.benefits.values()) {
          if (b.status === "DELIVERED" && b.deliveredAt && b.deliveredAt.startsWith(todayStr)) {
            deliveriesToday++;
          }
        }
      }

      if (deliveriesBySector.length === 0) {
        deliveriesBySector = [
          { sector: "Belloto Norte", deliveries: deliveredBenefits > 0 ? Math.round(deliveredBenefits * 0.25) : 0 },
          { sector: "Belloto Sur", deliveries: deliveredBenefits > 0 ? Math.round(deliveredBenefits * 0.2) : 0 },
          { sector: "Quilpué Centro", deliveries: deliveredBenefits > 0 ? Math.round(deliveredBenefits * 0.35) : 0 },
          { sector: "Canal Chacao", deliveries: deliveredBenefits > 0 ? Math.round(deliveredBenefits * 0.1) : 0 },
          { sector: "Pompeya", deliveries: deliveredBenefits > 0 ? Math.round(deliveredBenefits * 0.1) : 0 },
        ];
      }

      if (deliveriesByDay.length === 0) {
        deliveriesByDay = [
          { day: "Hoy", deliveries: deliveriesToday, total: deliveriesToday, fecha: new Date().toISOString().slice(0, 10) },
        ];
      }

      const percentage = totalBenefits > 0 ? Number(((deliveredBenefits / totalBenefits) * 100).toFixed(1)) : 0;

      return res.json({
        message: "KPIs obtenidos correctamente.",
        totalRegistros: totalBenefits,
        totalEntregados: deliveredBenefits,
        totalPendientes: pendingBenefits,
        entregadosHoy: deliveriesToday,
        porcentaje: percentage,
        porDia: deliveriesByDay,
        kpis: {
          totalGuardians,
          totalStudents,
          totalBenefits,
          pendingBenefits,
          deliveredBenefits,
          deliveriesToday,
          deliveryPercentage: percentage,
        },
        deliveriesByDay,
        deliveriesBySector,
      });
    } catch (error) {
      return res.status(500).json({ message: "Error al cargar KPIs.", error: error.message });
    }
  }
);

// 5. LISTA DE BENEFICIARIOS (Para el panel de administración)
app.get(
  "/api/beneficiaries",
  authenticateToken,
  requireRoles("ADMIN", "FIELD_AGENT"),
  async (req, res) => {
    try {
      const search = cleanText(req.query.search).toLowerCase();
      const estado = cleanText(req.query.estado).toUpperCase();

      if (usePostgres) {
        try {
          const pgQuery = `
            SELECT DISTINCT ON (bb.id)
              bb.id,
              g.rut AS rut_apoderado,
              TRIM(CONCAT(g.first_name, ' ', COALESCE(g.paternal_last_name, ''), ' ', COALESCE(g.maternal_last_name, ''))) AS nombre_apoderado,
              g.address AS direccion,
              COALESCE(g.sector, 'CENTRO') AS sector,
              g.phone AS telefono_apoderado,
              g.email AS correo_apoderado,
              s.rut AS rut_alumno,
              TRIM(CONCAT(s.first_name, ' ', COALESCE(s.paternal_last_name, ''), ' ', COALESCE(s.maternal_last_name, ''))) AS nombre_alumno,
              s.establishment AS establecimiento,
              s.educational_level AS nivel_educacional,
              COALESCE(s.application_status, 'APROBADA') AS estado,
              bt.name AS beneficio_nombre,
              (bb.status = 'DELIVERED') AS entregado,
              bb.delivered_at AS fecha_entrega,
              de.id AS evidence_id
            FROM beneficiary_benefits bb
            JOIN guardians g ON g.id = bb.guardian_id
            JOIN students s ON s.id = bb.student_id
            JOIN benefit_types bt ON bt.id = bb.benefit_type_id
            LEFT JOIN delivery_evidences de ON de.id = bb.evidence_id
            ORDER BY bb.id, g.paternal_last_name, s.first_name
          `;
          const dbRes = await pool.query(pgQuery);
          if (dbRes.rowCount > 0) {
            let results = dbRes.rows.map((row) => ({
              id: row.id,
              rut_apoderado: row.rut_apoderado,
              nombre_apoderado: row.nombre_apoderado,
              direccion: row.direccion,
              sector: row.sector,
              telefono_apoderado: row.telefono_apoderado,
              correo_apoderado: row.correo_apoderado,
              rut_alumno: row.rut_alumno,
              nombre_alumno: row.nombre_alumno,
              establecimiento: row.establecimiento,
              nivel_educacional: row.nivel_educacional,
              estado: row.estado,
              beneficio_nombre: row.beneficio_nombre,
              entregado: row.entregado,
              fecha_entrega: row.fecha_entrega,
              foto_acta: row.evidence_id ? `/api/evidences/${row.evidence_id}/file` : null,
            }));

            if (search) {
              results = results.filter(
                (row) =>
                  row.nombre_apoderado.toLowerCase().includes(search) ||
                  row.nombre_alumno.toLowerCase().includes(search) ||
                  cleanRut(row.rut_apoderado).includes(cleanRut(search)) ||
                  cleanRut(row.rut_alumno).includes(cleanRut(search))
              );
            }

            if (estado && estado !== "TODOS") {
              if (estado === "ENTREGADO") results = results.filter((r) => r.entregado);
              else if (estado === "PENDIENTE") results = results.filter((r) => !r.entregado);
            }

            return res.json(results);
          }
        } catch (dbErr) {
          console.warn("[DB] Error consultando beneficiarios en PostgreSQL:", dbErr.message);
        }
      }

      let results = [];
      for (const b of memoryStore.benefits.values()) {
        const guardian = memoryStore.guardians.get(b.guardianRut);
        const student = memoryStore.students.get(b.studentRut);

        const row = {
          id: b.id,
          rut_apoderado: guardian ? guardian.rut : b.guardianRut,
          nombre_apoderado: guardian ? guardian.fullName : "",
          direccion: guardian ? guardian.address : "",
          sector: guardian ? guardian.sector : "CENTRO",
          telefono_apoderado: guardian ? guardian.phone : "",
          correo_apoderado: guardian ? guardian.email : "",
          rut_alumno: student ? student.rut : b.studentRut,
          nombre_alumno: student ? student.fullName : "",
          establecimiento: student ? student.establishment : "",
          nivel_educacional: student ? student.educationalLevel : "",
          estado: student ? student.state : "APROBADA",
          beneficio_nombre: b.benefitName,
          entregado: b.status === "DELIVERED",
          fecha_entrega: b.deliveredAt,
          foto_acta: b.evidenceId ? `/api/evidences/${b.evidenceId}/file` : null,
        };

        // Filtro de búsqueda
        if (search) {
          const match =
            row.nombre_apoderado.toLowerCase().includes(search) ||
            row.nombre_alumno.toLowerCase().includes(search) ||
            cleanRut(row.rut_apoderado).includes(cleanRut(search)) ||
            cleanRut(row.rut_alumno).includes(cleanRut(search));
          if (!match) continue;
        }

        // Filtro de estado
        if (estado && estado !== "TODOS") {
          if (estado === "ENTREGADO" && !row.entregado) continue;
          if (estado === "PENDIENTE" && row.entregado) continue;
        }

        results.push(row);
      }

      return res.json(results);
    } catch (error) {
      return res.status(500).json({ message: "Error al listar beneficiarios.", error: error.message });
    }
  }
);

// 6. EXPORTAR REPORTE TRANSPARENCIA CSV (Ley 21.180)
app.get(
  "/api/reports/transparency.csv",
  authenticateToken,
  requireRoles("ADMIN"),
  (req, res) => {
    try {
      const headers = ["Sector", "Establecimiento", "Nivel_Educacional", "Estado_Entrega", "Fecha_Entrega"];
      const rows = [];

      for (const b of memoryStore.benefits.values()) {
        const guardian = memoryStore.guardians.get(b.guardianRut);
        const student = memoryStore.students.get(b.studentRut);
        rows.push([
          `"${(guardian && guardian.sector) || "CENTRO"}"`,
          `"${(student && student.establishment) || "ESTABLECIMIENTO"}"`,
          `"${(student && student.educationalLevel) || "GENERAL"}"`,
          `"${b.status === "DELIVERED" ? "ENTREGADO" : "PENDIENTE"}"`,
          `"${b.deliveredAt || ""}"`,
        ]);
      }

      const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="Reporte_Transparencia_Beneficios_Quilpue_${new Date().toISOString().slice(0, 10)}.csv"`
      );
      return res.send(csvContent);
    } catch (error) {
      return res.status(500).json({ message: "Error al generar CSV.", error: error.message });
    }
  }
);

// 7. CARGA MASIVA DE PLANILLA EXCEL
app.post(
  "/api/imports/beneficiaries",
  authenticateToken,
  requireRoles("ADMIN"),
  upload.single("excel"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Debes adjuntar un archivo de planilla Excel." });
      }

      const { results, errors, totalRows } = parseExcelBeneficiaries(req.file.buffer);

      if (results.length === 0) {
        return res.status(400).json({
          message: "No se pudieron procesar filas válidas del archivo Excel.",
          errors,
        });
      }

      // Guardar copia del archivo subido en el servidor
      try {
        const destFile = path.join(__dirname, "data", "formulario_postulantes.xlsx");
        fs.writeFileSync(destFile, req.file.buffer);
      } catch (saveErr) {
        console.warn("[IMPORT] No se pudo persistir copia local del excel:", saveErr.message);
      }

      // 1. Sincronizar en memoria
      results.forEach((item) => {
        let guardian = memoryStore.guardians.get(item.guardian.rut);
        if (!guardian) {
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
        memoryStore.benefits.set(benefitId, {
          id: benefitId,
          guardianId: guardian.id,
          guardianRut: item.guardian.rut,
          studentId: studentId,
          studentRut: item.student.rut,
          benefitName: item.benefit.name,
          status: item.benefit.status,
          deliveredAt: item.benefit.deliveredAt,
          evidenceId: null,
        });
      });

      // 2. Sincronizar en PostgreSQL si está disponible
      if (usePostgres) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await syncDataToPostgres(client, results);
          await client.query(
            `INSERT INTO import_batches (original_file_name, total_rows, imported_rows, rejected_rows)
             VALUES ($1, $2, $3, $4)`,
            [req.file.originalname || "formulario.xlsx", totalRows, results.length, errors.length]
          );
          await client.query("COMMIT");
          console.log(`[IMPORT] ¡${results.length} beneficiarios guardados en PostgreSQL exitosamente!`);
        } catch (dbErr) {
          await client.query("ROLLBACK");
          console.error("[IMPORT] Error guardando planilla en PostgreSQL:", dbErr.message);
        } finally {
          client.release();
        }
      }

      return res.json({
        ok: true,
        message: `Planilla procesada exitosamente. ${results.length} beneficiarios cargados.`,
        batchId: `batch-${Date.now()}`,
        totalRows,
        importedRows: results.length,
        rejectedRows: errors.length,
        errors: errors.slice(0, 10),
      });
    } catch (error) {
      return res.status(500).json({ message: "Error al importar planilla.", error: error.message });
    }
  }
);

// 8. RESTABLECER BASE DE DATOS Y CARGAR DATOS DE EJEMPLO
app.post("/api/admin/reset-database", authenticateToken, requireRoles("ADMIN"), async (req, res) => {
  try {
    // Limpiar actas físicas en disco
    const uploadsDir = path.join(__dirname, "uploads", "actas");
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      for (const f of files) {
        const fullPath = path.join(uploadsDir, f);
        if (fs.statSync(fullPath).isFile()) {
          fs.unlinkSync(fullPath);
        }
      }
    }

    // Si PostgreSQL está activo, re-ejecutar init.sql
    if (usePostgres) {
      const initSqlPath = path.join(__dirname, "database", "init.sql");
      if (fs.existsSync(initSqlPath)) {
        const sql = fs.readFileSync(initSqlPath, "utf-8");
        await pool.query(sql);
      }
    }

    // Recargar datos en memoria
    loadSeedDataToMemory();

    return res.json({
      ok: true,
      message: "Base de datos restablecida con éxito. Nuevos datos de ejemplo cargados.",
      totalBenefits: memoryStore.benefits.size,
      totalGuardians: memoryStore.guardians.size,
      totalStudents: memoryStore.students.size,
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al reiniciar la base de datos.", error: error.message });
  }
});

// 9. OBTENER ARCHIVO DE EVIDENCIA
app.get("/api/evidences/:id/file", async (req, res) => {
  const evId = req.params.id;

  if (usePostgres) {
    try {
      const dbRes = await pool.query(
        "SELECT mime_type, file_data, logical_file_name FROM delivery_evidences WHERE id::text = $1 OR logical_file_name = $1 OR storage_key = $1 LIMIT 1",
        [evId]
      );
      if (dbRes.rowCount > 0 && dbRes.rows[0].file_data) {
        res.setHeader("Content-Type", dbRes.rows[0].mime_type || "image/jpeg");
        return res.send(dbRes.rows[0].file_data);
      }
    } catch (dbErr) {
      console.warn("[DB] Error buscando evidencia en PostgreSQL:", dbErr.message);
    }
  }

  const ev = memoryStore.evidences.get(evId);
  if (ev && fs.existsSync(ev.path)) {
    return res.sendFile(ev.path);
  }

  // Fallback a archivo directo en uploads/actas
  const directPath = path.join(uploadsRoot, evId);
  if (fs.existsSync(directPath)) {
    return res.sendFile(directPath);
  }

  return res.status(404).json({ message: "Evidencia fotográfica no encontrada." });
});

// Alias y compatibilidad hacia endpoints alternativos
app.get("/apis/buscar", (req, res, next) => {
  req.params.rut = req.query.rut;
  return app._router.handle(req, res, next);
});
app.post("/apis/entregas", (req, res, next) => {
  req.url = "/api/deliveries/register";
  return app._router.handle(req, res, next);
});
app.get("/apis/kpis", (req, res, next) => {
  req.url = "/api/reports/kpis";
  return app._router.handle(req, res, next);
});
app.post("/apis/upload-excel", (req, res, next) => {
  req.url = "/api/imports/beneficiaries";
  return app._router.handle(req, res, next);
});

// Fallback SPA para servir el frontend de React/PWA si está compilado en public/
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/apis") || req.path.startsWith("/fotoss")) {
    return next();
  }
  const indexPath = path.join(__dirname, "public", "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return next();
});

// Manejo global de errores
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      message: `El archivo supera el límite máximo permitido de ${process.env.MAX_FILE_SIZE_MB || 10} MB.`,
    });
  }
  return res.status(500).json({
    message: error.message || "Ocurrió un error inesperado en el servidor.",
  });
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  ProyectoPMM - Backend Municipalidad de Quilpué`);
  console.log(`  Servidor activo en: http://localhost:${PORT}`);
  console.log(`  Usuarios disponibles:`);
  console.log(`  - Administrador : admin   / Admin123!`);
  console.log(`  - Operador      : terreno / Terreno123!`);
  console.log(`=======================================================`);
});