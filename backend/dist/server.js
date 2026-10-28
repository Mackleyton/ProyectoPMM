var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// src/middlewares/rateLimit.js
var require_rateLimit = __commonJS({
  "src/middlewares/rateLimit.js"(exports2, module2) {
    var rateLimit = require("express-rate-limit");
    var loginLimiter = rateLimit({
      windowMs: 5 * 60 * 1e3,
      // 5 minutos
      max: 15,
      // Máximo 15 intentos por IP
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        message: "Demasiados intentos de inicio de sesi\xF3n. Por favor espera 5 minutos antes de volver a intentar."
      }
    });
    var apiLimiter = rateLimit({
      windowMs: 1 * 60 * 1e3,
      // 1 minuto
      max: 180,
      // 180 solicitudes por minuto
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        message: "L\xEDmite de solicitudes superado. Por favor reduce la frecuencia de consultas."
      }
    });
    module2.exports = {
      loginLimiter,
      apiLimiter
    };
  }
});

// src/config/env.js
var require_env = __commonJS({
  "src/config/env.js"(exports2, module2) {
    var path = require("path");
    require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });
    require("dotenv").config();
    var JWT_SECRET = process.env.JWT_SECRET || "quilpue_dideco_jwt_secure_secret_2026_prod!";
    if (!process.env.JWT_SECRET) {
      console.warn("[SEGURIDAD ADVERTENCIA] JWT_SECRET no est\xE1 definido en las variables de entorno. Usando clave de respaldo para entorno de desarrollo local.");
    }
    module2.exports = {
      PORT: Number(process.env.PORT || 3e3),
      JWT_SECRET,
      JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "10h",
      MAX_FILE_SIZE_MB: Number(process.env.MAX_FILE_SIZE_MB || 10),
      RUT_VALIDATION_MODE: process.env.RUT_VALIDATION_MODE || "FULL",
      // Módulo 11 estricto requerido
      DATABASE_URL: process.env.DATABASE_URL || null,
      DB_HOST: process.env.DB_HOST || "localhost",
      DB_PORT: Number(process.env.DB_PORT || 5432),
      DB_NAME: process.env.DB_NAME || "beneficios_db",
      DB_USER: process.env.DB_USER || "postgres",
      DB_PASSWORD: process.env.DB_PASSWORD || "postgres",
      DB_SSL: process.env.DB_SSL === "true"
    };
  }
});

// src/utils/rut.js
var require_rut = __commonJS({
  "src/utils/rut.js"(exports2, module2) {
    var { RUT_VALIDATION_MODE } = require_env();
    function cleanRut(value) {
      return String(value || "").trim().toUpperCase().replace(/[^0-9K]/g, "");
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
    function validateRut(value, mode = RUT_VALIDATION_MODE) {
      const cleaned = cleanRut(value);
      if (cleaned.length < 8 || cleaned.length > 9) {
        return {
          valid: false,
          message: "El RUT debe contener entre 7 u 8 d\xEDgitos m\xE1s el d\xEDgito verificador."
        };
      }
      const cuerpo = cleaned.slice(0, -1);
      const dv = cleaned.slice(-1);
      if (!/^\d+$/.test(cuerpo)) {
        return { valid: false, message: "El cuerpo del RUT debe ser num\xE9rico." };
      }
      if (mode === "FULL") {
        const expectedDv = calculateDv(cuerpo);
        if (dv !== expectedDv) {
          return {
            valid: false,
            message: `D\xEDgito verificador inv\xE1lido para el RUT ingresado (se esperaba '${expectedDv}').`
          };
        }
      }
      return { valid: true, rut: formatRut(cleaned), clean: cleaned };
    }
    module2.exports = {
      cleanRut,
      formatRut,
      calculateDv,
      validateRut
    };
  }
});

// src/utils/excel.js
var require_excel = __commonJS({
  "src/utils/excel.js"(exports2, module2) {
    var xlsx = require("xlsx");
    var { cleanRut, formatRut } = require_rut();
    function cleanText(value) {
      return String(value || "").trim().replace(/\s+/g, " ");
    }
    function parseExcelDate(val) {
      if (!val || val === "-" || val === "null" || val === "undefined") return null;
      if (typeof val === "number") {
        const d = new Date(Math.round((val - 25569) * 86400 * 1e3));
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
        const minutes = Math.floor(totalSeconds % 3600 / 60);
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
      }
      return String(val).trim();
    }
    function normalizeHeaderName(key) {
      return String(key || "").replace(/^\uFEFF/, "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    }
    function getRowValue(rowMap, ...potentialKeys) {
      for (const k of potentialKeys) {
        const norm = normalizeHeaderName(k);
        if (rowMap[norm] !== void 0 && rowMap[norm] !== null && String(rowMap[norm]).trim() !== "") {
          return rowMap[norm];
        }
      }
      return "";
    }
    function parseExcelBeneficiaries(bufferOrPath) {
      let workbook;
      if (Buffer.isBuffer(bufferOrPath)) {
        try {
          workbook = xlsx.read(bufferOrPath, { type: "buffer", cellDates: true });
        } catch {
          const text = bufferOrPath.toString("utf8");
          workbook = xlsx.read(text, { type: "string", cellDates: true });
        }
      } else {
        workbook = xlsx.readFile(bufferOrPath, { cellDates: true });
      }
      let firstSheet = null;
      for (const name of workbook.SheetNames) {
        const s = workbook.Sheets[name];
        if (s && s["!ref"]) {
          firstSheet = s;
          break;
        }
      }
      if (!firstSheet && workbook.SheetNames.length > 0) {
        firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      }
      if (!firstSheet) {
        return { results: [], errors: [{ fila: 0, error: "La planilla no contiene hojas legibles" }], totalRows: 0 };
      }
      const matrix = xlsx.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
      let headerRowIdx = -1;
      const maxScan = Math.min(25, matrix.length);
      for (let i = 0; i < maxScan; i++) {
        const row = matrix[i];
        if (!Array.isArray(row)) continue;
        const rowStr = row.map((cell) => normalizeHeaderName(cell)).join(" ");
        if ((rowStr.includes("rut") || rowStr.includes("run")) && (rowStr.includes("apoderado") || rowStr.includes("alumno") || rowStr.includes("estudiante") || rowStr.includes("nombre"))) {
          headerRowIdx = i;
          break;
        }
      }
      let rawRows = [];
      if (headerRowIdx !== -1) {
        const headers = matrix[headerRowIdx].map((h) => String(h || "").trim());
        for (let r = headerRowIdx + 1; r < matrix.length; r++) {
          const rowArr = matrix[r];
          if (!Array.isArray(rowArr) || rowArr.length === 0) continue;
          const rowObj = {};
          let hasData = false;
          headers.forEach((h, colIdx) => {
            if (!h) return;
            const val = rowArr[colIdx] !== void 0 ? rowArr[colIdx] : "";
            rowObj[h] = val;
            if (String(val).trim()) hasData = true;
          });
          if (hasData) rawRows.push(rowObj);
        }
      } else {
        rawRows = xlsx.utils.sheet_to_json(firstSheet, { defval: "" });
      }
      const results = [];
      const errors = [];
      rawRows.forEach((row, idx) => {
        const rowMap = {};
        for (const [key, value] of Object.entries(row)) {
          rowMap[normalizeHeaderName(key)] = value;
        }
        const rawApoderado = getRowValue(
          rowMap,
          "rutapoderado",
          "rut_apoderado",
          "rut apoderado",
          "runapoderado",
          "run_apoderado",
          "apoderadorut"
        );
        const rawAlumno = getRowValue(
          rowMap,
          "rutalumno",
          "rut_alumno",
          "rut alumno",
          "runalumno",
          "run_alumno",
          "rutestudiante",
          "rut_estudiante",
          "alumnorut"
        );
        if (!rawApoderado || !rawAlumno) {
          errors.push({ fila: idx + 2, error: "Faltan RUT de apoderado o RUT de alumno" });
          return;
        }
        const gRutClean = cleanRut(rawApoderado);
        const sRutClean = cleanRut(rawAlumno);
        if (gRutClean.length < 8 || sRutClean.length < 8) {
          errors.push({ fila: idx + 2, error: `RUT con longitud inv\xE1lida (Apoderado: ${rawApoderado}, Alumno: ${rawAlumno})` });
          return;
        }
        const gRut = formatRut(gRutClean);
        const sRut = formatRut(sRutClean);
        const gFirstName = cleanText(getRowValue(rowMap, "nombreapoderado", "nombre_apoderado", "apoderadonombre") || "Apoderado");
        const gPatLastName = cleanText(getRowValue(rowMap, "apellidopaternoapoderado", "apellido_paterno_apoderado") || "");
        const gMatLastName = cleanText(getRowValue(rowMap, "apellidomaternoapoderado", "apellido_materno_apoderado") || "");
        const gFullName = [gFirstName, gPatLastName, gMatLastName].filter(Boolean).join(" ").trim() || "Apoderado";
        const sFirstName = cleanText(getRowValue(rowMap, "nombrealumno", "nombre_alumno", "alumnonombre") || "Alumno");
        const sPatLastName = cleanText(getRowValue(rowMap, "apellidopaternoalumno", "apellido_paterno_alumno") || "");
        const sMatLastName = cleanText(getRowValue(rowMap, "apellidomaternoalumno", "apellido_materno_alumno") || "");
        const sFullName = [sFirstName, sPatLastName, sMatLastName].filter(Boolean).join(" ").trim() || "Alumno";
        const gBirthDate = parseExcelDate(getRowValue(rowMap, "fechanacimientoapoderado", "fecha_nacimiento_apoderado"));
        const gAddress = cleanText(getRowValue(rowMap, "direccion", "direccionapoderado") || "Quilpu\xE9");
        const gSector = cleanText(getRowValue(rowMap, "sector") || "CENTRO").toUpperCase();
        const gEmail = cleanText(getRowValue(rowMap, "correoapoderado", "correo_apoderado", "email") || "");
        const gPhone = cleanText(getRowValue(rowMap, "telefonoapoderado", "telefono_apoderado", "telefono") || "");
        const sEstablishment = cleanText(getRowValue(rowMap, "establecimiento", "colegio") || "Establecimiento Quilpu\xE9");
        const sLevel = cleanText(getRowValue(rowMap, "niveleducacional", "nivel_educacional", "nivel") || "B\xE1sica");
        const rawEstado = cleanText(getRowValue(rowMap, "estado") || "APROBADA").toUpperCase();
        const sStatus = rawEstado || "APROBADA";
        const fibeBenefited = String(getRowValue(rowMap, "fibebeneficiado", "fibe") || "").toLowerCase().startsWith("s");
        const renewal = cleanText(getRowValue(rowMap, "renovacionautomatica", "renovacion_automatica") || "No");
        const deliveryDay = cleanText(getRowValue(rowMap, "dia") || "");
        const deliveryTime = parseExcelTime(getRowValue(rowMap, "hora"));
        const deliveryTable = cleanText(getRowValue(rowMap, "mesa") || "");
        const fechaEntrega = parseExcelDate(getRowValue(rowMap, "fechaentrega", "fecha_entrega"));
        const deliveredBy = cleanText(getRowValue(rowMap, "entregadopor", "entregado_por") || "");
        const isDelivered = !!fechaEntrega && fechaEntrega !== "-";
        let benefitName = "Set Escolar 2026 - B\xC1SICA";
        const lvlLower = sLevel.toLowerCase();
        if (lvlLower.includes("pre") || lvlLower.includes("kinder") || lvlLower.includes("k\xEDnder")) {
          benefitName = "Set Escolar 2026 - PRE-B\xC1SICA (K\xCDNDER)";
        } else if (lvlLower.includes("media") || lvlLower.includes("secundaria")) {
          benefitName = "Set Escolar 2026 - MEDIA";
        } else if (lvlLower.includes("segundo") || lvlLower.includes("5") || lvlLower.includes("8")) {
          benefitName = "Set Escolar 2026 - B\xC1SICA SEGUNDO CICLO (5\xB0 A 8\xB0 B\xC1SICO)";
        } else {
          benefitName = "Set Escolar 2026 - B\xC1SICA PRIMER CICLO (1\xB0 A 4\xB0 B\xC1SICO)";
        }
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
            phone: gPhone
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
            importedDeliveredBy: deliveredBy
          },
          benefit: {
            name: benefitName,
            status: isDelivered ? "DELIVERED" : "PENDING",
            deliveredAt: fechaEntrega,
            deliveredBy: isDelivered ? deliveredBy : null
          }
        });
      });
      return { results, errors, totalRows: rawRows.length };
    }
    module2.exports = {
      parseExcelBeneficiaries,
      parseExcelDate,
      parseExcelTime,
      normalizeHeaderName,
      getRowValue
    };
  }
});

// src/config/db.js
var require_db = __commonJS({
  "src/config/db.js"(exports2, module2) {
    var { Pool } = require("pg");
    var bcrypt = require("bcryptjs");
    var fs = require("fs");
    var path = require("path");
    var env2 = require_env();
    var { cleanRut } = require_rut();
    var { parseExcelBeneficiaries } = require_excel();
    var usePostgres = false;
    var poolConfig = env2.DATABASE_URL ? {
      connectionString: env2.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5e3
    } : {
      host: env2.DB_HOST,
      port: env2.DB_PORT,
      database: env2.DB_NAME,
      user: env2.DB_USER,
      password: env2.DB_PASSWORD,
      ssl: env2.DB_SSL ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 3e3
    };
    var pool = new Pool(poolConfig);
    var memoryStore = {
      users: [
        {
          id: "u-admin-01",
          username: "admin",
          password_hash: bcrypt.hashSync("Admin123!", 10),
          role: "ADMIN",
          name: "Administrador Social",
          active: true
        },
        {
          id: "u-terreno-01",
          username: "terreno",
          password_hash: bcrypt.hashSync("Terreno123!", 10),
          role: "FIELD_AGENT",
          name: "Operador Terreno",
          active: true
        }
      ],
      guardians: /* @__PURE__ */ new Map(),
      students: /* @__PURE__ */ new Map(),
      benefits: /* @__PURE__ */ new Map(),
      deliveries: /* @__PURE__ */ new Map(),
      evidences: /* @__PURE__ */ new Map(),
      attentionTimes: [],
      auditLogs: []
    };
    function findInitialExcelFile() {
      const candidates = [
        path.join(__dirname, "..", "..", "..", "Listado Ayuda Escolar.xlsx"),
        path.join(__dirname, "..", "..", "data", "formulario_postulantes.xlsx"),
        path.join(__dirname, "..", "..", "formulario_postulantes.xlsx")
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
              ...item.guardian
            };
            memoryStore.guardians.set(item.guardian.rut, guardian);
          }
          const studentId = `s-xl-${cleanRut(item.student.rut)}`;
          const student = {
            id: studentId,
            guardianId: guardian.id,
            ...item.student
          };
          memoryStore.students.set(item.student.rut, student);
          const benefitId = `b-xl-${cleanRut(item.student.rut)}`;
          const existingBenefit = memoryStore.benefits.get(benefitId);
          const finalStatus = !replace && existingBenefit && existingBenefit.status === "DELIVERED" ? "DELIVERED" : item.benefit.status;
          const finalDeliveredAt = !replace && existingBenefit && existingBenefit.status === "DELIVERED" ? existingBenefit.deliveredAt : item.benefit.deliveredAt;
          const finalEvidenceId = !replace && existingBenefit && existingBenefit.status === "DELIVERED" ? existingBenefit.evidenceId : null;
          memoryStore.benefits.set(benefitId, {
            id: benefitId,
            guardianId: guardian.id,
            guardianRut: item.guardian.rut,
            studentId,
            studentRut: item.student.rut,
            benefitName: item.benefit.name,
            status: finalStatus,
            deliveredAt: finalDeliveredAt,
            evidenceId: finalEvidenceId
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
        await client.query("DELETE FROM delivery_items;");
        await client.query("DELETE FROM beneficiary_benefits;");
        await client.query("DELETE FROM students;");
        await client.query("DELETE FROM guardians;");
      }
      for (const item of parsedItems) {
        const btRes = await client.query(
          `INSERT INTO benefit_types (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id;`,
          [item.benefit.name]
        );
        const benefitTypeId = btRes.rows[0].id;
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
            item.guardian.phone
          ]
        );
        const guardianId = gRes.rows[0].id;
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
            item.student.importedDeliveredBy
          ]
        );
        const studentId = sRes.rows[0].id;
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
            item.benefit.deliveredAt ? new Date(item.benefit.deliveredAt) : null
          ]
        );
      }
    }
    async function initDatabase2() {
      const initialExcel = findInitialExcelFile();
      if (initialExcel) {
        loadExcelToMemory(initialExcel, true);
      }
      try {
        const client = await pool.connect();
        console.log("[DB] Conexi\xF3n establecida con PostgreSQL.");
        usePostgres = true;
        const initSqlPath = path.join(__dirname, "..", "..", "database", "init.sql");
        if (fs.existsSync(initSqlPath)) {
          const sql = fs.readFileSync(initSqlPath, "utf-8");
          await client.query(sql);
        }
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
          console.warn("[DB] Migraci\xF3n no cr\xEDtica:", migErr.message);
        }
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
        const countRes = await client.query("SELECT COUNT(*) FROM guardians");
        if (Number(countRes.rows[0].count) === 0 && initialExcel) {
          console.log(`[DB] Poblaci\xF3n inicial de PostgreSQL desde ${path.basename(initialExcel)}...`);
          const { results } = parseExcelBeneficiaries(initialExcel);
          await syncDataToPostgres(client, results, false);
          console.log(`[DB] ${results.length} beneficiarios cargados en PostgreSQL.`);
        }
        client.release();
      } catch (error) {
        usePostgres = false;
        console.log(`[DB AVISO] PostgreSQL no disponible (${error.message}). Modo almac\xE9n local 100% activo.`);
      }
    }
    module2.exports = {
      pool,
      get usePostgres() {
        return usePostgres;
      },
      memoryStore,
      initDatabase: initDatabase2,
      syncDataToPostgres,
      loadExcelToMemory,
      findInitialExcelFile
    };
  }
});

// src/services/auditService.js
var require_auditService = __commonJS({
  "src/services/auditService.js"(exports2, module2) {
    var { pool, usePostgres, memoryStore } = require_db();
    async function recordAuditLog({
      userId = null,
      username = "anonimo",
      action,
      entityType = null,
      entityId = null,
      details = {},
      ipAddress = "127.0.0.1"
    }) {
      const logEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        user_id: userId,
        username,
        action,
        entity_type: entityType,
        entity_id: entityId,
        details,
        ip_address: ipAddress,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      memoryStore.auditLogs.unshift(logEntry);
      if (memoryStore.auditLogs.length > 500) {
        memoryStore.auditLogs.pop();
      }
      if (usePostgres) {
        try {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const validUserId = userId && uuidRegex.test(userId) ? userId : null;
          await pool.query(
            `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details, ip_address, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
            [
              validUserId,
              username,
              action,
              entityType,
              entityId,
              JSON.stringify(details),
              ipAddress
            ]
          );
        } catch (err) {
          console.warn("[AUDITOR\xCDA] Error guardando log en PostgreSQL:", err.message);
        }
      }
      return logEntry;
    }
    async function getAuditLogs({ limit = 100, action = null } = {}) {
      if (usePostgres) {
        try {
          let query = `
        SELECT id, user_id, username, action, entity_type, entity_id, details, ip_address, created_at
        FROM audit_logs
      `;
          const params = [];
          if (action) {
            query += " WHERE action = $1";
            params.push(action);
          }
          query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
          params.push(limit);
          const res = await pool.query(query, params);
          return res.rows;
        } catch (err) {
          console.warn("[AUDITOR\xCDA] Error consultando logs en PostgreSQL, usando memoria:", err.message);
        }
      }
      let logs = [...memoryStore.auditLogs];
      if (action) {
        logs = logs.filter((l) => l.action === action);
      }
      return logs.slice(0, limit);
    }
    module2.exports = {
      recordAuditLog,
      getAuditLogs
    };
  }
});

// src/controllers/authController.js
var require_authController = __commonJS({
  "src/controllers/authController.js"(exports2, module2) {
    var bcrypt = require("bcryptjs");
    var jwt = require("jsonwebtoken");
    var env2 = require_env();
    var { pool, usePostgres, memoryStore } = require_db();
    var { recordAuditLog } = require_auditService();
    function cleanText(value) {
      return String(value || "").trim();
    }
    function createToken(user) {
      return jwt.sign(
        {
          id: user.id,
          username: user.username,
          role: user.role,
          name: user.name || (user.role === "ADMIN" ? "Administrador Social" : "Operador Terreno")
        },
        env2.JWT_SECRET,
        { expiresIn: env2.JWT_EXPIRES_IN }
      );
    }
    async function login(req, res) {
      const ipAddress = req.ip || req.connection.remoteAddress || "127.0.0.1";
      try {
        const rawUsername = cleanText(req.body.username || req.body.email);
        const password = String(req.body.password || "");
        if (!rawUsername || !password) {
          return res.status(400).json({ message: "Debes ingresar usuario y contrase\xF1a." });
        }
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
            console.warn("[AUTH] Error consultando PostgreSQL:", err.message);
          }
        }
        if (!user) {
          user = memoryStore.users.find((u) => u.username === username && u.active);
        }
        if (!user) {
          await recordAuditLog({
            username: rawUsername,
            action: "AUTH_LOGIN_FAILED",
            details: { reason: "Usuario no encontrado" },
            ipAddress
          });
          return res.status(401).json({ message: "Usuario o contrase\xF1a incorrectos." });
        }
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
          await recordAuditLog({
            userId: user.id,
            username: user.username,
            action: "AUTH_LOGIN_FAILED",
            details: { reason: "Contrase\xF1a inv\xE1lida" },
            ipAddress
          });
          return res.status(401).json({ message: "Usuario o contrase\xF1a incorrectos." });
        }
        const token = createToken(user);
        const displayName = user.role === "ADMIN" ? "Administrador Social" : "Operador Terreno";
        await recordAuditLog({
          userId: user.id,
          username: user.username,
          action: "AUTH_LOGIN_SUCCESS",
          details: { role: user.role },
          ipAddress
        });
        return res.json({
          message: `Inicio de sesi\xF3n exitoso. Bienvenido/a, ${displayName}.`,
          token,
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
            name: displayName
          }
        });
      } catch (error) {
        return res.status(500).json({ message: "Error al procesar inicio de sesi\xF3n.", error: error.message });
      }
    }
    async function getProfile(req, res) {
      return res.json({ user: req.user });
    }
    async function getUsers(req, res) {
      try {
        let usersList = [];
        if (usePostgres) {
          try {
            const dbRes = await pool.query(
              "SELECT id, username, role, active, created_at FROM users ORDER BY created_at ASC"
            );
            usersList = dbRes.rows.map((u) => ({
              id: u.id,
              username: u.username,
              name: u.username === "admin" ? "Administrador Social" : u.username === "terreno" ? "Operador Terreno" : u.username,
              role: u.role,
              active: u.active,
              createdAt: u.created_at
            }));
          } catch (err) {
            console.warn("[AUTH] Error consultando usuarios en PostgreSQL:", err.message);
          }
        }
        if (usersList.length === 0) {
          usersList = memoryStore.users.map((u) => ({
            id: u.id,
            username: u.username,
            name: u.name || u.username,
            role: u.role,
            active: u.active,
            createdAt: u.created_at || (/* @__PURE__ */ new Date()).toISOString()
          }));
        }
        return res.json({ users: usersList });
      } catch (error) {
        return res.status(500).json({ message: "Error al listar usuarios.", error: error.message });
      }
    }
    async function createUser(req, res) {
      const ipAddress = req.ip || req.connection.remoteAddress || "127.0.0.1";
      try {
        const { firstName, lastName, email, password, role } = req.body;
        if (!firstName || !email || !password) {
          return res.status(400).json({ message: "Nombre, correo y contrase\xF1a son obligatorios." });
        }
        if (password.length < 6) {
          return res.status(400).json({ message: "La contrase\xF1a debe tener al menos 6 caracteres." });
        }
        const assignedRole = role === "ADMIN" || role === "FIELD_AGENT" ? role : "FIELD_AGENT";
        const cleanEmail = String(email).trim().toLowerCase();
        const fullName = `${firstName.trim()} ${(lastName || "").trim()}`.trim();
        const username = cleanEmail;
        const passwordHash = await bcrypt.hash(password, 10);
        let createdId = null;
        if (usePostgres) {
          try {
            const checkRes = await pool.query("SELECT id FROM users WHERE username = $1 LIMIT 1", [username]);
            if (checkRes.rowCount > 0) {
              return res.status(400).json({ message: "Ya existe un usuario registrado con ese correo o nombre de usuario." });
            }
            const insRes = await pool.query(
              `INSERT INTO users (username, password_hash, role, active)
           VALUES ($1, $2, $3, TRUE) RETURNING id`,
              [username, passwordHash, assignedRole]
            );
            createdId = insRes.rows[0]?.id;
          } catch (dbErr) {
            console.warn("[AUTH] Error creando usuario en PostgreSQL:", dbErr.message);
          }
        }
        const existsInMem = memoryStore.users.some((u) => u.username.toLowerCase() === username);
        if (existsInMem && !createdId) {
          return res.status(400).json({ message: "Ya existe un usuario registrado con ese correo o nombre de usuario." });
        }
        const newUser = {
          id: createdId || `u-${assignedRole.toLowerCase()}-${Date.now()}`,
          username,
          password_hash: passwordHash,
          role: assignedRole,
          name: fullName,
          email: cleanEmail,
          active: true,
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        if (!existsInMem) {
          memoryStore.users.push(newUser);
        }
        await recordAuditLog({
          userId: req.user?.id,
          username: req.user?.username || "admin",
          action: assignedRole === "ADMIN" ? "USER_CREATE_ADMIN" : "USER_CREATE_FIELD_AGENT",
          details: { createdUsername: username, fullName, role: assignedRole },
          ipAddress
        });
        return res.status(201).json({
          message: `Usuario ${assignedRole === "ADMIN" ? "Administrador" : "de Terreno"} creado exitosamente para ${fullName}.`,
          user: {
            id: newUser.id,
            username,
            name: fullName,
            role: assignedRole
          }
        });
      } catch (error) {
        return res.status(500).json({ message: "Error al crear usuario.", error: error.message });
      }
    }
    async function createFieldUser(req, res) {
      req.body.role = "FIELD_AGENT";
      return createUser(req, res);
    }
    async function deleteUser(req, res) {
      const ipAddress = req.ip || req.connection.remoteAddress || "127.0.0.1";
      try {
        const { id } = req.params;
        if (!id) {
          return res.status(400).json({ message: "ID de usuario requerido." });
        }
        if (req.user?.id && String(req.user.id) === String(id)) {
          return res.status(400).json({ message: "No puedes eliminar tu propia cuenta en sesi\xF3n activa." });
        }
        let deletedUsername = "";
        if (usePostgres) {
          try {
            const checkRes = await pool.query("SELECT id, username, role FROM users WHERE id::text = $1 OR username = $1", [id]);
            if (checkRes.rowCount > 0) {
              const userToDelete = checkRes.rows[0];
              deletedUsername = userToDelete.username;
              if (userToDelete.username === "admin") {
                return res.status(400).json({ message: "El usuario administrador principal ('admin') no puede ser eliminado." });
              }
              if (userToDelete.role === "ADMIN") {
                const adminCount = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'ADMIN' AND active = TRUE");
                if (parseInt(adminCount.rows[0].count, 10) <= 1) {
                  return res.status(400).json({ message: "No puedes eliminar al \xFAnico administrador del sistema." });
                }
              }
              await pool.query("DELETE FROM users WHERE id = $1", [userToDelete.id]);
            }
          } catch (dbErr) {
            console.warn("[AUTH] Error eliminando usuario en PostgreSQL:", dbErr.message);
          }
        }
        const memIdx = memoryStore.users.findIndex((u) => u.id === id || u.username === id);
        if (memIdx !== -1) {
          const u = memoryStore.users[memIdx];
          if (u.username === "admin") {
            return res.status(400).json({ message: "El usuario administrador principal ('admin') no puede ser eliminado." });
          }
          deletedUsername = deletedUsername || u.username;
          memoryStore.users.splice(memIdx, 1);
        }
        await recordAuditLog({
          userId: req.user?.id,
          username: req.user?.username || "admin",
          action: "USER_DELETE",
          details: { deletedUserId: id, deletedUsername },
          ipAddress
        });
        return res.json({
          message: `Usuario ${deletedUsername || id} eliminado correctamente.`,
          deletedId: id
        });
      } catch (error) {
        return res.status(500).json({ message: "Error al eliminar usuario.", error: error.message });
      }
    }
    module2.exports = {
      login,
      getProfile,
      getUsers,
      createUser,
      createFieldUser,
      deleteUser
    };
  }
});

// src/middlewares/auth.js
var require_auth = __commonJS({
  "src/middlewares/auth.js"(exports2, module2) {
    var jwt = require("jsonwebtoken");
    var env2 = require_env();
    function authenticateToken(req, res, next) {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "No autorizado: Token de sesi\xF3n requerido." });
      }
      jwt.verify(token, env2.JWT_SECRET, (err, user) => {
        if (err) {
          return res.status(403).json({ message: "Sesi\xF3n expirada o token inv\xE1lido." });
        }
        req.user = user;
        next();
      });
    }
    function requireRoles(...allowedRoles) {
      return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
          return res.status(403).json({
            message: "Acceso denegado: Tu perfil no tiene permisos suficientes para realizar esta acci\xF3n."
          });
        }
        next();
      };
    }
    module2.exports = {
      authenticateToken,
      requireRoles
    };
  }
});

// src/routes/authRoutes.js
var require_authRoutes = __commonJS({
  "src/routes/authRoutes.js"(exports2, module2) {
    var express = require("express");
    var router = express.Router();
    var { login, getProfile, getUsers, createUser, createFieldUser, deleteUser } = require_authController();
    var { authenticateToken, requireRoles } = require_auth();
    var { loginLimiter } = require_rateLimit();
    router.post("/login", loginLimiter, login);
    router.get("/me", authenticateToken, getProfile);
    router.get("/users", authenticateToken, requireRoles("ADMIN"), getUsers);
    router.post("/users", authenticateToken, requireRoles("ADMIN"), createUser);
    router.delete("/users/:id", authenticateToken, requireRoles("ADMIN"), deleteUser);
    router.post("/create-field-user", authenticateToken, requireRoles("ADMIN"), createFieldUser);
    module2.exports = router;
  }
});

// src/controllers/beneficiariesController.js
var require_beneficiariesController = __commonJS({
  "src/controllers/beneficiariesController.js"(exports2, module2) {
    var { pool, usePostgres, memoryStore } = require_db();
    var { validateRut, cleanRut } = require_rut();
    function fullName(firstName, paternalLastName, maternalLastName) {
      return [firstName, paternalLastName, maternalLastName].filter(Boolean).join(" ").trim();
    }
    async function getBeneficiaryByRut(req, res) {
      try {
        const rutParam = req.params.rut;
        const rutValidation = validateRut(rutParam);
        if (!rutValidation.valid) {
          return res.status(400).json({ message: rutValidation.message });
        }
        const rutClean = rutValidation.clean;
        const rutFormatted = rutValidation.rut;
        if (usePostgres) {
          try {
            let gRes = await pool.query("SELECT * FROM guardians WHERE rut = $1", [rutFormatted]);
            let guardian2 = gRes.rows[0];
            if (!guardian2) {
              const sRes = await pool.query(
                `SELECT g.* FROM students s
             JOIN guardians g ON g.id = s.guardian_id
             WHERE s.rut = $1 LIMIT 1`,
                [rutFormatted]
              );
              if (sRes.rowCount > 0) guardian2 = sRes.rows[0];
            }
            if (guardian2) {
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
                [guardian2.id]
              );
              return res.json({
                message: "Beneficiario encontrado.",
                guardian: {
                  id: guardian2.id,
                  rut: guardian2.rut,
                  fullName: fullName(guardian2.first_name, guardian2.paternal_last_name, guardian2.maternal_last_name),
                  address: guardian2.address,
                  sector: guardian2.sector,
                  email: guardian2.email,
                  phone: guardian2.phone
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
                      educationalLevel: b.educational_level
                    }
                  };
                })
              });
            }
          } catch (dbErr) {
            console.warn("[BENEFICIARIOS] Error consultando PostgreSQL:", dbErr.message);
          }
        }
        let guardian = memoryStore.guardians.get(rutFormatted);
        if (!guardian) {
          const student = memoryStore.students.get(rutFormatted);
          if (student) {
            guardian = memoryStore.guardians.get(student.guardianRut);
          }
        }
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
            message: `No se encontraron beneficiarios registrados para el RUT ${rutParam}.`
          });
        }
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
              fotoActa: b.evidenceId ? `/api/evidences/${b.evidenceId}/file` : null,
              student: {
                rut: student ? student.rut : b.studentRut,
                fullName: student ? student.fullName : "Alumno",
                establishment: student ? student.establishment : "Quilpu\xE9",
                educationalLevel: student ? student.educationalLevel : "General"
              }
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
            phone: guardian.phone
          },
          benefits
        });
      } catch (error) {
        return res.status(500).json({ message: "Error al consultar beneficiario.", error: error.message });
      }
    }
    async function listBeneficiaries(req, res) {
      try {
        const search = String(req.query.search || "").trim().toLowerCase();
        const estado = String(req.query.estado || "").trim().toUpperCase();
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
              let results2 = dbRes.rows.map((row) => ({
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
                foto_acta: row.evidence_id ? `/api/evidences/${row.evidence_id}/file` : null
              }));
              if (search) {
                results2 = results2.filter(
                  (row) => row.nombre_apoderado.toLowerCase().includes(search) || row.nombre_alumno.toLowerCase().includes(search) || cleanRut(row.rut_apoderado).includes(cleanRut(search)) || cleanRut(row.rut_alumno).includes(cleanRut(search))
                );
              }
              if (estado && estado !== "TODOS") {
                if (estado === "ENTREGADO") results2 = results2.filter((r) => r.entregado);
                else if (estado === "PENDIENTE") results2 = results2.filter((r) => !r.entregado);
              }
              return res.json(results2);
            }
          } catch (dbErr) {
            console.warn("[BENEFICIARIOS] Error consultando PostgreSQL:", dbErr.message);
          }
        }
        let results = [];
        for (const b of memoryStore.benefits.values()) {
          const guardian = memoryStore.guardians.get(b.guardianRut);
          const student = memoryStore.students.get(b.studentRut);
          const row = {
            id: b.id,
            rut_apoderado: guardian ? guardian.rut : b.guardianRut,
            nombre_apoderado: guardian ? guardian.fullName || fullName(guardian.firstName, guardian.paternalLastName, guardian.maternalLastName) : "",
            direccion: guardian ? guardian.address : "",
            sector: guardian ? guardian.sector : "CENTRO",
            telefono_apoderado: guardian ? guardian.phone : "",
            correo_apoderado: guardian ? guardian.email : "",
            rut_alumno: student ? student.rut : b.studentRut,
            nombre_alumno: student ? student.fullName || fullName(student.firstName, student.paternalLastName, student.maternalLastName) : "",
            establecimiento: student ? student.establishment : "",
            nivel_educacional: student ? student.educationalLevel : "",
            estado: student ? student.state : "APROBADA",
            beneficio_nombre: b.benefitName,
            entregado: b.status === "DELIVERED",
            fecha_entrega: b.deliveredAt,
            foto_acta: b.evidenceId ? `/api/evidences/${b.evidenceId}/file` : null
          };
          if (search) {
            const match = row.nombre_apoderado.toLowerCase().includes(search) || row.nombre_alumno.toLowerCase().includes(search) || cleanRut(row.rut_apoderado).includes(cleanRut(search)) || cleanRut(row.rut_alumno).includes(cleanRut(search));
            if (!match) continue;
          }
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
    module2.exports = {
      getBeneficiaryByRut,
      listBeneficiaries
    };
  }
});

// src/routes/beneficiariesRoutes.js
var require_beneficiariesRoutes = __commonJS({
  "src/routes/beneficiariesRoutes.js"(exports2, module2) {
    var express = require("express");
    var router = express.Router();
    var { getBeneficiaryByRut, listBeneficiaries } = require_beneficiariesController();
    var { authenticateToken } = require_auth();
    router.get("/guardians/:rut", authenticateToken, getBeneficiaryByRut);
    router.get("/beneficiaries", authenticateToken, listBeneficiaries);
    module2.exports = router;
  }
});

// src/controllers/deliveriesController.js
var require_deliveriesController = __commonJS({
  "src/controllers/deliveriesController.js"(exports2, module2) {
    var fs = require("fs");
    var path = require("path");
    var crypto = require("crypto");
    var { pool, usePostgres, memoryStore } = require_db();
    var { validateRut } = require_rut();
    var { recordAuditLog } = require_auditService();
    var uploadsRoot = path.join(__dirname, "..", "..", "uploads", "actas");
    if (!fs.existsSync(uploadsRoot)) {
      fs.mkdirSync(uploadsRoot, { recursive: true });
    }
    function sha256(buffer) {
      return crypto.createHash("sha256").update(buffer).digest("hex");
    }
    function getImageExtension(mimeType) {
      switch (mimeType) {
        case "image/jpeg":
          return ".jpg";
        case "image/png":
          return ".png";
        case "image/webp":
          return ".webp";
        default:
          return ".jpg";
      }
    }
    async function registerDelivery(req, res) {
      const ipAddress = req.ip || req.connection.remoteAddress || "127.0.0.1";
      try {
        const rutParam = req.body.rut;
        const rutValidation = validateRut(rutParam);
        if (!rutValidation.valid) {
          return res.status(400).json({ message: rutValidation.message });
        }
        if (!req.file) {
          return res.status(400).json({ message: "Debes adjuntar la fotograf\xEDa del acta f\xEDsica firmada." });
        }
        let benefitIds = [];
        try {
          benefitIds = JSON.parse(req.body.benefitIds || "[]");
        } catch {
          return res.status(400).json({ message: "Formato inv\xE1lido en la selecci\xF3n de beneficios." });
        }
        if (!Array.isArray(benefitIds) || benefitIds.length === 0) {
          return res.status(400).json({ message: "Debes seleccionar al menos un beneficio para registrar la entrega." });
        }
        const latitude = req.body.latitude ? parseFloat(req.body.latitude) : null;
        const longitude = req.body.longitude ? parseFloat(req.body.longitude) : null;
        const capturedAt = req.body.captured_at || (/* @__PURE__ */ new Date()).toISOString();
        const syncStatus = req.body.sync_status || "SYNCED";
        const notes = String(req.body.notes || "Entrega f\xEDsica de beneficio").trim();
        const durationSeconds = req.body.duration_seconds ? parseInt(req.body.duration_seconds, 10) : null;
        if (durationSeconds && durationSeconds > 0 && durationSeconds < 7200) {
          if (!memoryStore.attentionTimes) memoryStore.attentionTimes = [];
          memoryStore.attentionTimes.push(durationSeconds);
          if (memoryStore.attentionTimes.length > 200) memoryStore.attentionTimes.shift();
        }
        const extension = getImageExtension(req.file.mimetype);
        const fileHash = sha256(req.file.buffer);
        const deliveryDate = (/* @__PURE__ */ new Date()).toISOString();
        const deliveredBenefits = [];
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        let dbEvidenceId = null;
        let filename = null;
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
            let deliveredByUserId = null;
            if (req.user?.id && uuidRegex.test(req.user.id)) {
              deliveredByUserId = req.user.id;
            } else {
              const uRes = await client.query("SELECT id FROM users WHERE username = $1 LIMIT 1", [req.user?.username || "terreno"]);
              deliveredByUserId = uRes.rows[0]?.id || null;
            }
            const delRes = await client.query(
              `INSERT INTO deliveries (guardian_id, delivered_by, notes, delivered_at, latitude, longitude, captured_at, sync_status)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7) RETURNING id, delivered_at`,
              [guardianId, deliveredByUserId, notes, latitude, longitude, capturedAt, syncStatus]
            );
            const deliveryId = delRes.rows[0].id;
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
                  benefitName: r.benefit_name
                });
              });
            }
            await client.query("COMMIT");
          } catch (dbErr) {
            await client.query("ROLLBACK");
            console.warn("[DELIVERY] Error guardando en PostgreSQL:", dbErr.message);
          } finally {
            client.release();
          }
        }
        if (!filename) {
          filename = `${Date.now()}_${rutValidation.clean}${extension}`;
          const destination = path.join(uploadsRoot, filename);
          if (!fs.existsSync(destination)) {
            fs.writeFileSync(destination, req.file.buffer);
          }
        }
        const evidenceId = dbEvidenceId || `ev-${Date.now()}`;
        memoryStore.evidences.set(evidenceId, {
          id: evidenceId,
          filename,
          path: path.join(uploadsRoot, filename),
          mimetype: req.file.mimetype,
          size: req.file.size
        });
        benefitIds.forEach((bId) => {
          let b = memoryStore.benefits.get(bId);
          if (!b) {
            for (const memB of memoryStore.benefits.values()) {
              if (memB.guardianRut === rutValidation.rut) {
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
                studentName: student ? student.fullName || `${student.firstName} ${student.paternalLastName}` : "Alumno",
                benefitName: b.benefitName
              });
            }
          }
        });
        await recordAuditLog({
          userId: req.user?.id,
          username: req.user?.username || "terreno",
          action: "DELIVERY_REGISTER",
          entityType: "DELIVERY",
          entityId: evidenceId,
          details: {
            guardianRut: rutValidation.rut,
            benefitsCount: benefitIds.length,
            latitude,
            longitude,
            capturedAt,
            syncStatus,
            durationSeconds,
            fileSizeKb: Math.round(req.file.size / 1024)
          },
          ipAddress
        });
        return res.json({
          message: "Entrega f\xEDsica registrada exitosamente con respaldo de acta.",
          delivery: {
            id: `del-${Date.now()}`,
            deliveredAt: deliveryDate,
            latitude,
            longitude,
            capturedAt
          },
          deliveredBenefits,
          evidence: {
            id: evidenceId,
            logicalFileName: filename,
            url: `/api/evidences/${evidenceId}/file`
          }
        });
      } catch (error) {
        return res.status(500).json({ message: "Error al registrar entrega.", error: error.message });
      }
    }
    async function getEvidenceFile(req, res) {
      const evId = req.params.id;
      if (usePostgres) {
        try {
          const dbRes = await pool.query(
            "SELECT mime_type, file_data, logical_file_name FROM delivery_evidences WHERE id::text = $1 OR logical_file_name = $1 OR storage_key = $1 LIMIT 1",
            [evId]
          );
          if (dbRes.rowCount > 0 && dbRes.rows[0].file_data) {
            const mimeType = dbRes.rows[0].mime_type || "image/jpeg";
            const fileName = dbRes.rows[0].logical_file_name || `acta_${evId}.jpg`;
            res.setHeader("Content-Type", mimeType);
            res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
            res.setHeader("Cache-Control", "public, max-age=86400");
            return res.send(dbRes.rows[0].file_data);
          }
        } catch (dbErr) {
          console.warn("[EVIDENCE] Error buscando en PostgreSQL:", dbErr.message);
        }
      }
      const ev = memoryStore.evidences.get(evId);
      if (ev && fs.existsSync(ev.path)) {
        return res.sendFile(ev.path);
      }
      const directPath = path.join(uploadsRoot, evId);
      if (fs.existsSync(directPath)) {
        return res.sendFile(directPath);
      }
      return res.status(404).json({ message: "Evidencia fotogr\xE1fica no encontrada." });
    }
    module2.exports = {
      registerDelivery,
      getEvidenceFile
    };
  }
});

// src/routes/deliveriesRoutes.js
var require_deliveriesRoutes = __commonJS({
  "src/routes/deliveriesRoutes.js"(exports2, module2) {
    var express = require("express");
    var multer = require("multer");
    var router = express.Router();
    var env2 = require_env();
    var { registerDelivery, getEvidenceFile } = require_deliveriesController();
    var { authenticateToken } = require_auth();
    var upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: env2.MAX_FILE_SIZE_MB * 1024 * 1024 }
    });
    router.post("/deliveries/register", authenticateToken, upload.single("acta"), registerDelivery);
    router.get("/evidences/:id/file", getEvidenceFile);
    module2.exports = router;
  }
});

// src/utils/timezone.js
var require_timezone = __commonJS({
  "src/utils/timezone.js"(exports2, module2) {
    var CHILE_TZ = "America/Santiago";
    function getChileDateString(date = /* @__PURE__ */ new Date()) {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return "";
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: CHILE_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(d);
    }
    function getChileHour(date = /* @__PURE__ */ new Date()) {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return 0;
      const hourStr = new Intl.DateTimeFormat("en-US", {
        timeZone: CHILE_TZ,
        hour: "numeric",
        hour12: false
      }).format(d);
      const hourNum = parseInt(hourStr, 10);
      return hourNum === 24 ? 0 : hourNum;
    }
    function getChileDateTimeString(date = /* @__PURE__ */ new Date()) {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleString("es-CL", { timeZone: CHILE_TZ });
    }
    module2.exports = {
      CHILE_TZ,
      getChileDateString,
      getChileHour,
      getChileDateTimeString
    };
  }
});

// src/controllers/reportsController.js
var require_reportsController = __commonJS({
  "src/controllers/reportsController.js"(exports2, module2) {
    var { getChileDateString, getChileHour, getChileDateTimeString } = require_timezone();
    var xlsx = require("xlsx");
    var { pool, usePostgres, memoryStore } = require_db();
    function categorizeLevel(lvl) {
      const s = String(lvl || "").toLowerCase();
      if (s.includes("pre") || s.includes("kinder") || s.includes("k\xEDnder")) {
        return "PRE B\xC1SICA";
      }
      if (s.includes("superior") || s.includes("universitaria") || s.includes("instituto") || s.includes("cft")) {
        return "SUPERIOR";
      }
      if (s.includes("media") || s.includes("secundaria")) {
        return "MEDIA";
      }
      if (s.includes("segundo") || s.includes("5") || s.includes("6") || s.includes("7") || s.includes("8")) {
        return "B\xC1SICA SEGUNDO CICLO (5\xB0 A 8\xB0 B\xC1SICO)";
      }
      return "B\xC1SICA PRIMER CICLO (1\xB0 A 4\xB0 B\xC1SICO)";
    }
    function isApproved(status) {
      const s = String(status || "").trim().toUpperCase();
      return s.startsWith("APROB");
    }
    async function getKpis(req, res) {
      try {
        let deliveriesToday = 0;
        let deliveriesByDay = [];
        let deliveriesBySector = [];
        let distribucionSectores = [];
        let flujoPorHora = [
          { rango: "08:00 - 11:00", cantidad: 0 },
          { rango: "11:00 - 14:00", cantidad: 0 },
          { rango: "14:00 - 17:00", cantidad: 0 },
          { rango: "17:00+", cantidad: 0 }
        ];
        const stockMap = {
          "PRE B\xC1SICA": { nivel: "PRE B\xC1SICA", licitacion: 800, inicial: 490, entregadas: 0, saldo: 490, pct: 0 },
          "B\xC1SICA PRIMER CICLO (1\xB0 A 4\xB0 B\xC1SICO)": { nivel: "B\xC1SICA PRIMER CICLO (1\xB0 A 4\xB0 B\xC1SICO)", licitacion: 1700, inicial: 1443, entregadas: 0, saldo: 1443, pct: 0 },
          "B\xC1SICA SEGUNDO CICLO (5\xB0 A 8\xB0 B\xC1SICO)": { nivel: "B\xC1SICA SEGUNDO CICLO (5\xB0 A 8\xB0 B\xC1SICO)", licitacion: 1700, inicial: 1569, entregadas: 0, saldo: 1569, pct: 0 },
          "MEDIA": { nivel: "MEDIA", licitacion: 1500, inicial: 1124, entregadas: 0, saldo: 1124, pct: 0 },
          "SUPERIOR": { nivel: "SUPERIOR", licitacion: 700, inicial: 419, entregadas: 0, saldo: 419, pct: 0 }
        };
        const pendientesPorNivelExcel = {
          "PRE B\xC1SICA": 0,
          "B\xC1SICA PRIMER CICLO (1\xB0 A 4\xB0 B\xC1SICO)": 0,
          "B\xC1SICA SEGUNDO CICLO (5\xB0 A 8\xB0 B\xC1SICO)": 0,
          "MEDIA": 0,
          "SUPERIOR": 0
        };
        const sectorCounter = {};
        let totalExcelAprobados = 0;
        let entregadosExcelConActa = 0;
        const todayStr = getChileDateString();
        if (usePostgres) {
          try {
            const studentsRes = await pool.query(`
          SELECT 
            s.id,
            s.educational_level,
            COALESCE(g.sector, 'CENTRO') AS sector,
            bb.status,
            bb.delivered_at
          FROM students s
          JOIN guardians g ON g.id = s.guardian_id
          LEFT JOIN beneficiary_benefits bb ON bb.student_id = s.id
          WHERE UPPER(COALESCE(s.state, 'APROBADA')) LIKE 'APROB%'
        `);
            studentsRes.rows.forEach((row) => {
              totalExcelAprobados++;
              const cat = categorizeLevel(row.educational_level);
              const isDelivered = row.status === "DELIVERED";
              if (isDelivered) {
                entregadosExcelConActa++;
                if (stockMap[cat]) stockMap[cat].entregadas += 1;
                if (row.delivered_at) {
                  const d = new Date(row.delivered_at);
                  if (d.toISOString().slice(0, 10) === todayStr) deliveriesToday++;
                  const h = d.getHours();
                  if (h >= 8 && h < 11) flujoPorHora[0].cantidad++;
                  else if (h >= 11 && h < 14) flujoPorHora[1].cantidad++;
                  else if (h >= 14 && h < 17) flujoPorHora[2].cantidad++;
                  else flujoPorHora[3].cantidad++;
                }
              } else {
                if (pendientesPorNivelExcel[cat] !== void 0) {
                  pendientesPorNivelExcel[cat]++;
                }
              }
              const sec = String(row.sector || "CENTRO").trim().toUpperCase();
              sectorCounter[sec] = (sectorCounter[sec] || 0) + 1;
            });
          } catch (dbErr) {
            console.warn("[REPORTS] Error consultando PostgreSQL:", dbErr.message);
          }
        }
        if (totalExcelAprobados === 0 && memoryStore.students.size > 0) {
          for (const student of memoryStore.students.values()) {
            const studentState = student.state || student.applicationStatus || "APROBADA";
            if (!isApproved(studentState)) continue;
            totalExcelAprobados++;
            const cat = categorizeLevel(student.educationalLevel);
            const guardian = memoryStore.guardians.get(student.guardianRut);
            const sector = String(guardian && guardian.sector || "CENTRO").trim().toUpperCase();
            sectorCounter[sector] = (sectorCounter[sector] || 0) + 1;
            const cleanRutKey = student.rut.replace(/[^0-9kK]/g, "");
            const benefitId = `b-xl-${cleanRutKey}`;
            let b = memoryStore.benefits.get(benefitId);
            if (!b) {
              b = Array.from(memoryStore.benefits.values()).find((item) => item.studentRut === student.rut);
            }
            const isDelivered = b && b.status === "DELIVERED";
            if (isDelivered) {
              entregadosExcelConActa++;
              if (stockMap[cat]) stockMap[cat].entregadas += 1;
              if (b.deliveredAt && String(b.deliveredAt).startsWith(todayStr)) deliveriesToday++;
              if (b.deliveredAt) {
                const h = new Date(b.deliveredAt).getHours();
                if (h >= 8 && h < 11) flujoPorHora[0].cantidad++;
                else if (h >= 11 && h < 14) flujoPorHora[1].cantidad++;
                else if (h >= 14 && h < 17) flujoPorHora[2].cantidad++;
                else flujoPorHora[3].cantidad++;
              }
            } else {
              if (pendientesPorNivelExcel[cat] !== void 0) {
                pendientesPorNivelExcel[cat]++;
              }
            }
          }
        }
        distribucionSectores = Object.entries(sectorCounter).map(([sector, cantidad]) => ({
          sector,
          cantidad,
          deliveries: cantidad
        }));
        deliveriesBySector = distribucionSectores;
        const stockPorNivel = Object.values(stockMap).map((item) => {
          const saldo = Math.max(0, item.inicial - item.entregadas);
          const pct = item.inicial > 0 ? Math.round(item.entregadas / item.inicial * 100) : 0;
          return { ...item, saldo, pct };
        });
        const pendientesExcel = Math.max(0, totalExcelAprobados - entregadosExcelConActa);
        const porcentajeExcel = totalExcelAprobados > 0 ? Number((entregadosExcelConActa / totalExcelAprobados * 100).toFixed(1)) : 0;
        const distribucionNivel = Object.entries(pendientesPorNivelExcel).map(([nivel, cantidad]) => ({
          nivel,
          cantidad
          // <-- PENDIENTES REALES DEL EXCEL
        }));
        const times = memoryStore.attentionTimes || [];
        let avgAttentionSeconds = 0;
        if (times.length > 0) {
          avgAttentionSeconds = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
        }
        return res.json({
          message: "KPIs obtenidos correctamente.",
          // Datos del padrón Excel real:
          totalExcelAprobados,
          totalBeneficiariosAprobados: totalExcelAprobados,
          totalRegistros: totalExcelAprobados,
          totalEntregados: entregadosExcelConActa,
          entregadosConActa: entregadosExcelConActa,
          totalPendientes: pendientesExcel,
          pendientesDeRetiro: pendientesExcel,
          entregadosHoy: deliveriesToday,
          porcentaje: porcentajeExcel,
          tiempoPromedioSegundos: avgAttentionSeconds,
          // Gráficos alimentados por el Excel:
          distribucionNivel,
          distribucionSectores,
          deliveriesBySector,
          // Tabla de stock de control municipal:
          stockPorNivel,
          flujoPorHora,
          porDia: [{ day: "Hoy", deliveries: deliveriesToday, total: deliveriesToday, fecha: todayStr }]
        });
      } catch (error) {
        return res.status(500).json({ message: "Error al calcular indicadores.", error: error.message });
      }
    }
    async function getDeliveredCountsByLevel() {
      const counts = {
        "PRE B\xC1SICA": { nivel: "PRE B\xC1SICA", tipoSet: "Set Escolar - Pre-B\xE1sica", cantidadEntregada: 0 },
        "B\xC1SICA PRIMER CICLO (1\xB0 A 4\xB0 B\xC1SICO)": { nivel: "B\xC1SICA PRIMER CICLO (1\xB0 A 4\xB0 B\xC1SICO)", tipoSet: "Set Escolar - B\xE1sica 1er Ciclo", cantidadEntregada: 0 },
        "B\xC1SICA SEGUNDO CICLO (5\xB0 A 8\xB0 B\xC1SICO)": { nivel: "B\xC1SICA SEGUNDO CICLO (5\xB0 A 8\xB0 B\xC1SICO)", tipoSet: "Set Escolar - B\xE1sica 2do Ciclo", cantidadEntregada: 0 },
        "MEDIA": { nivel: "MEDIA", tipoSet: "Set Escolar - Ense\xF1anza Media", cantidadEntregada: 0 },
        "SUPERIOR": { nivel: "SUPERIOR", tipoSet: "Set Escolar - Educaci\xF3n Superior", cantidadEntregada: 0 }
      };
      let hasData = false;
      if (usePostgres) {
        try {
          const res = await pool.query(`
        SELECT 
          s.educational_level,
          bt.name as benefit_name
        FROM beneficiary_benefits bb
        JOIN students s ON s.id = bb.student_id
        LEFT JOIN benefit_types bt ON bt.id = bb.benefit_type_id
        WHERE bb.status = 'DELIVERED'
      `);
          if (res.rowCount > 0) {
            hasData = true;
            res.rows.forEach((row) => {
              const cat = categorizeLevel(row.educational_level);
              if (counts[cat]) {
                counts[cat].cantidadEntregada += 1;
                if (row.benefit_name) {
                  counts[cat].tipoSet = row.benefit_name;
                }
              }
            });
          }
        } catch (err) {
          console.warn("[REPORTS] Error consultando conteo de entregas en Postgres:", err.message);
        }
      }
      if (!hasData && memoryStore.benefits.size > 0) {
        for (const b of memoryStore.benefits.values()) {
          if (b.status === "DELIVERED") {
            const student = memoryStore.students.get(b.studentRut);
            const cat = categorizeLevel(student ? student.educationalLevel : "");
            if (counts[cat]) {
              counts[cat].cantidadEntregada += 1;
              if (b.name || b.benefitName) {
                counts[cat].tipoSet = b.name || b.benefitName;
              }
            }
          }
        }
      }
      return counts;
    }
    async function exportTransparencyExcel(req, res) {
      try {
        const counts = await getDeliveredCountsByLevel();
        const rows = Object.values(counts);
        const totalEntregadas = rows.reduce((acc, curr) => acc + curr.cantidadEntregada, 0);
        const worksheetData = [
          ["REPORTE DE TRANSPARENCIA - ENTREGAS DE SETS ESCOLARES"],
          [`Fecha de emisi\xF3n (Chile): ${getChileDateTimeString()}`],
          [],
          ["NIVEL EDUCACIONAL", "TIPO DE SET", "CANTIDAD ENTREGADA"]
        ];
        rows.forEach((item) => {
          worksheetData.push([item.nivel, item.tipoSet, item.cantidadEntregada]);
        });
        worksheetData.push(["TOTAL GENERAL", "", totalEntregadas]);
        const worksheet = xlsx.utils.aoa_to_sheet(worksheetData);
        worksheet["!cols"] = [
          { wch: 42 },
          { wch: 40 },
          { wch: 22 }
        ];
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, "Cantidades Entregadas");
        const excelBuffer = xlsx.write(workbook, { bookType: "xlsx", type: "buffer" });
        const filename = `Reporte_Transparencia_Entregas_${getChileDateString()}.xlsx`;
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send(excelBuffer);
      } catch (error) {
        return res.status(500).json({ message: "Error al generar Excel de transparencia.", error: error.message });
      }
    }
    async function exportTransparencyCsv(req, res) {
      return exportTransparencyExcel(req, res);
    }
    module2.exports = {
      getKpis,
      exportTransparencyCsv,
      exportTransparencyExcel
    };
  }
});

// src/routes/reportsRoutes.js
var require_reportsRoutes = __commonJS({
  "src/routes/reportsRoutes.js"(exports2, module2) {
    var express = require("express");
    var router = express.Router();
    var { getKpis, exportTransparencyCsv, exportTransparencyExcel } = require_reportsController();
    var { authenticateToken, requireRoles } = require_auth();
    router.get("/reports/kpis", authenticateToken, getKpis);
    router.get("/reports/transparency.csv", authenticateToken, requireRoles("ADMIN"), exportTransparencyCsv);
    router.get("/reports/transparency.xlsx", authenticateToken, requireRoles("ADMIN"), exportTransparencyExcel);
    module2.exports = router;
  }
});

// src/controllers/importController.js
var require_importController = __commonJS({
  "src/controllers/importController.js"(exports2, module2) {
    var fs = require("fs");
    var path = require("path");
    var { pool, usePostgres, syncDataToPostgres, memoryStore } = require_db();
    var { parseExcelBeneficiaries } = require_excel();
    var { cleanRut } = require_rut();
    var { recordAuditLog } = require_auditService();
    async function importExcel(req, res) {
      const ipAddress = req.ip || req.connection.remoteAddress || "127.0.0.1";
      try {
        if (!req.file) {
          return res.status(400).json({ message: "Debes adjuntar un archivo de planilla (.xlsx, .xls o .csv)." });
        }
        const mode = String(req.body.mode || req.query.mode || "update").toLowerCase();
        const isReplace = mode === "replace";
        const { results, errors, totalRows } = parseExcelBeneficiaries(req.file.buffer);
        if (results.length === 0) {
          return res.status(400).json({
            message: "No se pudieron procesar registros v\xE1lidos del archivo Excel o CSV.",
            errors
          });
        }
        if (isReplace) {
          memoryStore.guardians.clear();
          memoryStore.students.clear();
          memoryStore.benefits.clear();
        }
        results.forEach((item) => {
          let guardian = memoryStore.guardians.get(item.guardian.rut);
          if (!guardian || isReplace) {
            guardian = {
              id: `g-xl-${cleanRut(item.guardian.rut)}`,
              ...item.guardian
            };
            memoryStore.guardians.set(item.guardian.rut, guardian);
          }
          const studentId = `s-xl-${cleanRut(item.student.rut)}`;
          const student = {
            id: studentId,
            guardianId: guardian.id,
            ...item.student
          };
          memoryStore.students.set(item.student.rut, student);
          const benefitId = `b-xl-${cleanRut(item.student.rut)}`;
          const existing = memoryStore.benefits.get(benefitId);
          const status = !isReplace && existing && existing.status === "DELIVERED" ? "DELIVERED" : item.benefit.status;
          const deliveredAt = !isReplace && existing && existing.status === "DELIVERED" ? existing.deliveredAt : item.benefit.deliveredAt;
          const evidenceId = !isReplace && existing && existing.status === "DELIVERED" ? existing.evidenceId : null;
          memoryStore.benefits.set(benefitId, {
            id: benefitId,
            guardianId: guardian.id,
            guardianRut: item.guardian.rut,
            studentId,
            studentRut: item.student.rut,
            benefitName: item.benefit.name,
            status,
            deliveredAt,
            evidenceId
          });
        });
        if (usePostgres) {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            await syncDataToPostgres(client, results, isReplace);
            await client.query(
              `INSERT INTO import_batches (original_file_name, total_rows, imported_rows, rejected_rows)
           VALUES ($1, $2, $3, $4)`,
              [req.file.originalname || "planilla.xlsx", totalRows, results.length, errors.length]
            );
            await client.query("COMMIT");
          } catch (dbErr) {
            await client.query("ROLLBACK");
            console.error("[IMPORT] Error guardando en PostgreSQL:", dbErr.message);
          } finally {
            client.release();
          }
        }
        try {
          const destDir = path.join(__dirname, "..", "..", "data");
          if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
          const destFile = path.join(destDir, "formulario_postulantes.xlsx");
          fs.writeFileSync(destFile, req.file.buffer);
        } catch (saveErr) {
          console.warn("[IMPORT] No se pudo guardar copia local de respaldo:", saveErr.message);
        }
        await recordAuditLog({
          action: isReplace ? "IMPORT_REPLACE" : "IMPORT_UPDATE",
          performedBy: req.user?.username || "admin",
          details: `Importaci\xF3n masiva: ${results.length} beneficiarios procesados desde ${req.file.originalname}`,
          ipAddress
        });
        return res.json({
          message: "Planilla procesada e importada correctamente.",
          totalRows,
          importedRows: results.length,
          rejectedRows: errors.length,
          errors: errors.slice(0, 10)
        });
      } catch (error) {
        console.error("[IMPORT] Error inesperado:", error);
        return res.status(500).json({ message: "Error al importar planilla.", error: error.message });
      }
    }
    async function resetDatabase(req, res) {
      const ipAddress = req.ip || req.connection.remoteAddress || "127.0.0.1";
      try {
        const uploadsDir = path.join(__dirname, "..", "..", "uploads", "actas");
        if (fs.existsSync(uploadsDir)) {
          const files = fs.readdirSync(uploadsDir);
          for (const f of files) {
            const fullPath = path.join(uploadsDir, f);
            if (fs.statSync(fullPath).isFile()) {
              fs.unlinkSync(fullPath);
            }
          }
        }
        if (usePostgres) {
          const initSqlPath = path.join(__dirname, "..", "..", "database", "init.sql");
          if (fs.existsSync(initSqlPath)) {
            const sql = fs.readFileSync(initSqlPath, "utf-8");
            await pool.query(sql);
          }
        }
        memoryStore.guardians.clear();
        memoryStore.students.clear();
        memoryStore.benefits.clear();
        memoryStore.deliveries.clear();
        memoryStore.evidences.clear();
        await recordAuditLog({
          userId: req.user?.id,
          username: req.user?.username || "admin",
          action: "DATABASE_RESET",
          details: { resetAt: (/* @__PURE__ */ new Date()).toISOString() },
          ipAddress
        });
        return res.json({
          ok: true,
          message: "Base de datos y actas f\xEDsicas reseteadas exitosamente."
        });
      } catch (error) {
        console.error("[RESET_DB] Error:", error);
        return res.status(500).json({ message: "Error al reiniciar la base de datos.", error: error.message });
      }
    }
    async function resetDatabase(req, res) {
      const ipAddress = req.ip || req.connection.remoteAddress || "127.0.0.1";
      try {
        const uploadsDir = path.join(__dirname, "..", "..", "uploads", "actas");
        if (fs.existsSync(uploadsDir)) {
          const files = fs.readdirSync(uploadsDir);
          for (const f of files) {
            const fullPath = path.join(uploadsDir, f);
            if (fs.statSync(fullPath).isFile()) {
              fs.unlinkSync(fullPath);
            }
          }
        }
        if (usePostgres) {
          const initSqlPath = path.join(__dirname, "..", "..", "database", "init.sql");
          if (fs.existsSync(initSqlPath)) {
            const sql = fs.readFileSync(initSqlPath, "utf-8");
            await pool.query(sql);
          }
        }
        memoryStore.guardians.clear();
        memoryStore.students.clear();
        memoryStore.benefits.clear();
        memoryStore.deliveries.clear();
        memoryStore.evidences.clear();
        await recordAuditLog({
          userId: req.user?.id,
          username: req.user?.username || "admin",
          action: "DATABASE_RESET",
          details: { resetAt: (/* @__PURE__ */ new Date()).toISOString() },
          ipAddress
        });
        return res.json({
          ok: true,
          message: "Base de datos y actas f\xEDsicas reseteadas exitosamente."
        });
      } catch (error) {
        console.error("[RESET_DB] Error:", error);
        return res.status(500).json({ message: "Error al reiniciar la base de datos.", error: error.message });
      }
    }
    module2.exports = {
      importExcel,
      resetDatabase
    };
  }
});

// src/routes/importRoutes.js
var require_importRoutes = __commonJS({
  "src/routes/importRoutes.js"(exports2, module2) {
    var express = require("express");
    var multer = require("multer");
    var router = express.Router();
    var env2 = require_env();
    var { importExcel, resetDatabase } = require_importController();
    var { authenticateToken, requireRoles } = require_auth();
    var upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: env2.MAX_FILE_SIZE_MB * 1024 * 1024 }
    });
    router.post("/imports/beneficiaries", authenticateToken, requireRoles("ADMIN"), upload.single("excel"), importExcel);
    router.post("/admin/reset-database", authenticateToken, requireRoles("ADMIN"), resetDatabase);
    module2.exports = router;
  }
});

// src/controllers/auditController.js
var require_auditController = __commonJS({
  "src/controllers/auditController.js"(exports2, module2) {
    var { getAuditLogs } = require_auditService();
    async function listAuditLogs(req, res) {
      try {
        const limit = Number(req.query.limit || 100);
        const action = req.query.action || null;
        const logs = await getAuditLogs({ limit, action });
        return res.json({
          ok: true,
          count: logs.length,
          logs
        });
      } catch (error) {
        return res.status(500).json({ message: "Error al consultar bit\xE1cora de auditor\xEDa.", error: error.message });
      }
    }
    module2.exports = {
      listAuditLogs
    };
  }
});

// src/routes/auditRoutes.js
var require_auditRoutes = __commonJS({
  "src/routes/auditRoutes.js"(exports2, module2) {
    var express = require("express");
    var router = express.Router();
    var { listAuditLogs } = require_auditController();
    var { authenticateToken, requireRoles } = require_auth();
    router.get("/admin/audit-logs", authenticateToken, requireRoles("ADMIN"), listAuditLogs);
    module2.exports = router;
  }
});

// src/app.js
var require_app = __commonJS({
  "src/app.js"(exports2, module2) {
    var express = require("express");
    var cors = require("cors");
    var helmet = require("helmet");
    var path = require("path");
    var fs = require("fs");
    var multer = require("multer");
    var { apiLimiter } = require_rateLimit();
    var { usePostgres, memoryStore } = require_db();
    var authRoutes = require_authRoutes();
    var beneficiariesRoutes = require_beneficiariesRoutes();
    var deliveriesRoutes = require_deliveriesRoutes();
    var reportsRoutes = require_reportsRoutes();
    var importRoutes = require_importRoutes();
    var auditRoutes = require_auditRoutes();
    var app2 = express();
    app2.use(
      helmet({
        crossOriginResourcePolicy: { policy: "cross-origin" },
        contentSecurityPolicy: false
        // Permitir que la PWA cargue recursos locales e iconos sin bloqueos
      })
    );
    app2.use(cors());
    app2.use(express.json({ limit: "15mb" }));
    app2.use(express.urlencoded({ extended: true, limit: "15mb" }));
    var uploadsRoot = path.join(__dirname, "..", "uploads", "actas");
    if (!fs.existsSync(uploadsRoot)) {
      fs.mkdirSync(uploadsRoot, { recursive: true });
    }
    app2.use("/fotoss", express.static(uploadsRoot));
    app2.use(express.static(path.join(__dirname, "..", "public")));
    app2.get(["/api/health", "/apis/health"], (req, res) => {
      return res.json({
        ok: true,
        status: "online",
        database: usePostgres ? "PostgreSQL" : "LocalStore",
        records: memoryStore.benefits.size,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    });
    app2.use("/api", apiLimiter);
    app2.use("/api/auth", authRoutes);
    app2.use("/api", beneficiariesRoutes);
    app2.use("/api", deliveriesRoutes);
    app2.use("/api", reportsRoutes);
    app2.use("/api", importRoutes);
    app2.use("/api", auditRoutes);
    app2.use("/apis/buscar", (req, res, next) => {
      req.url = `/guardians/${encodeURIComponent(req.query.rut || "")}`;
      return beneficiariesRoutes(req, res, next);
    });
    app2.use("/apis/entregas", (req, res, next) => {
      req.url = "/deliveries/register";
      return deliveriesRoutes(req, res, next);
    });
    app2.use("/apis/kpis", (req, res, next) => {
      req.url = "/reports/kpis";
      return reportsRoutes(req, res, next);
    });
    app2.use("/apis/upload-excel", (req, res, next) => {
      req.url = "/imports/beneficiaries";
      return importRoutes(req, res, next);
    });
    app2.use((error, req, res, next) => {
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          message: "El archivo supera el l\xEDmite de tama\xF1o permitido."
        });
      }
      console.error("[ERROR SERVER]", error);
      return res.status(500).json({
        message: error.message || "Ocurri\xF3 un error inesperado en el servidor."
      });
    });
    module2.exports = app2;
  }
});

// server.js
if (!process.env.TZ) {
  process.env.TZ = "America/Santiago";
}
require("dotenv").config();
var app = require_app();
var env = require_env();
var { initDatabase } = require_db();
async function startServer() {
  await initDatabase();
  app.listen(env.PORT, () => {
    console.log("=======================================================");
    console.log("  ProyectoPMM - Municipalidad de Quilpu\xE9 (v2.0 Modular)");
    console.log(`  Servidor activo en: http://localhost:${env.PORT}`);
    console.log(`  Huso horario fijado: ${process.env.TZ}`);
    console.log("  M\xF3dulos: Auth, Beneficiarios, Entregas, Auditor\xEDa, Importador");
    console.log("  Seguridad: Helmet activo, Rate Limiting activo, RUT Full");
    console.log("  Usuarios iniciales:");
    console.log("  - Administrador : admin   / Admin123!");
    console.log("  - Operador      : terreno / Terreno123!");
    console.log("=======================================================");
  });
}
startServer().catch((err) => {
  console.error("Error cr\xEDtico al iniciar servidor:", err);
  process.exit(1);
});
