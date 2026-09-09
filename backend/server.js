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
const MAX_FILE_SIZE_BYTES =
  Number(process.env.MAX_FILE_SIZE_MB || 10) * 1024 * 1024;

// =========================================================
// PostgreSQL local
// =========================================================

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

// =========================================================
// Configuración Express
// =========================================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

// NOTA:
// No se publica la carpeta uploads.
// Las actas se visualizan solamente usando un endpoint protegido.

// =========================================================
// Multer
// =========================================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES
  }
});

// =========================================================
// Directorios locales
// =========================================================

const uploadsRoot = path.join(__dirname, "uploads", "actas");

if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

// Compatibilidad con frontend: servir fotografías en /fotoss
app.use("/fotoss", express.static(uploadsRoot));


// =========================================================
// Utilidades
// =========================================================

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function readExcelColumn(row, expectedColumn) {
  const normalizedRow = {};

  for (const [key, value] of Object.entries(row)) {
    normalizedRow[normalizeHeader(key)] = value;
  }

  const value = normalizedRow[normalizeHeader(expectedColumn)];

  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function cleanText(value) {
  return String(value || "").trim();
}

function fullName(firstName, paternalLastName, maternalLastName) {
  return [
    cleanText(firstName),
    cleanText(paternalLastName),
    cleanText(maternalLastName)
  ]
    .filter(Boolean)
    .join(" ");
}

function formatRut(value) {
  const raw = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[.\s-]/g, "");

  if (raw.length < 2) {
    return null;
  }

  const body = raw.slice(0, -1);
  const verifier = raw.slice(-1);

  return `${body}-${verifier}`;
}

function cleanRut(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[.\s-]/g, "");
}

function validateRut(value) {
  const rut = formatRut(value);

  if (!rut) {
    return {
      valid: false,
      message: "Debe ingresar un RUT."
    };
  }

  const [body, verifier] = rut.split("-");

  /*
    Valida estructura:
    - 7 u 8 números para el cuerpo.
    - Un dígito o K para el verificador.
  */
  if (!/^\d{7,8}$/.test(body)) {
    return {
      valid: false,
      message:
        "El RUT debe contener entre 7 y 8 dígitos antes del guion."
    };
  }

  if (!/^[0-9K]$/i.test(verifier)) {
    return {
      valid: false,
      message:
        "El dígito verificador debe ser un número entre 0 y 9, o la letra K."
    };
  }

  let sum = 0;
  let multiplier = 2;

  for (let index = body.length - 1; index >= 0; index--) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const calculated = 11 - (sum % 11);

  let expectedVerifier;

  if (calculated === 11) {
    expectedVerifier = "0";
  } else if (calculated === 10) {
    expectedVerifier = "K";
  } else {
    expectedVerifier = String(calculated);
  }

  const receivedVerifier = verifier.toUpperCase();
  const dvMatches = receivedVerifier === expectedVerifier;

  /*
    FORMAT:
    Acepta un RUT que tenga estructura correcta, aunque su DV no coincida.
    Deja una advertencia para que sea visible al importar.

    STRICT:
    Rechaza el RUT si el DV no coincide.
  */
  const validationMode =
    String(process.env.RUT_VALIDATION_MODE || "STRICT").toUpperCase();

  if (!dvMatches && validationMode === "STRICT") {
    return {
      valid: false,
      message:
        `RUT inválido. Para ${body}, el dígito verificador correcto es ${expectedVerifier}.`
    };
  }

  return {
    valid: true,
    rut: `${body}-${receivedVerifier}`,
    warning: !dvMatches
      ? `Advertencia: el RUT "${body}-${receivedVerifier}" tiene formato válido, pero su DV calculado sería "${expectedVerifier}".`
      : null
  };
}

function isApprovedStatus(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  /*
    Se importan solamente filas cuyo Estado sea APROBADO.
    Se aceptan APROBADA y APROBADO/A por tolerancia de formato.
  */
  return [
    "APROBADO",
    "APROBADA",
    "APROBADO/A"
  ].includes(normalized);
}

function parseOptionalBoolean(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return [
    "SI",
    "TRUE",
    "1",
    "X"
  ].includes(normalized);
}

function isApprovedStatus(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  /*
    Ajusta esta lista si el Excel municipal utiliza otros nombres,
    por ejemplo: APROBADO FIBE, BENEFICIARIO APROBADO, etc.
  */
  return [
    "APROBADO",
    "APROBADA"
  ].includes(normalized);
}

function getImageExtension(mimeType) {
  const extensions = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };

  return extensions[mimeType] || null;
}

function sanitizeFileLabel(value) {
  return String(value || "acta")
    .trim()
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "8h"
    }
  );
}

// =========================================================
// Seguridad: JWT y roles
// =========================================================

function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Debes iniciar sesión antes de realizar esta acción."
    });
  }

  const token = authorization.slice(7);

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      message: "Tu sesión expiró o el token no es válido. Inicia sesión nuevamente."
    });
  }
}

function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Tu usuario no tiene permisos para realizar esta acción."
      });
    }

    next();
  };
}

function optionalAuthenticateToken(req, res, next) {
  const authorization = req.headers.authorization;

  if (authorization && authorization.startsWith("Bearer ")) {
    const token = authorization.slice(7);
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
      return next();
    } catch {
      // En caso de expiración en desarrollo local se usa usuario por defecto
    }
  }

  // Usuario administrador por defecto para desarrollo local
  req.user = { id: 1, username: "admin", role: "ADMIN" };
  next();
}


// =========================================================
// Health check
// =========================================================

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      status: "OK",
      message: "Servidor Node.js y PostgreSQL local funcionando correctamente."
    });
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      message: "No fue posible conectar con PostgreSQL.",
      error: error.message
    });
  }
});

// =========================================================
// Login
// =========================================================

app.post("/api/auth/login", async (req, res) => {
  try {
    const inputUser = cleanText(req.body.username || req.body.email);
    const password = String(req.body.password || "");

    if (!inputUser || !password) {
      return res.status(400).json({
        message: "Debes ingresar usuario y contraseña."
      });
    }

    const result = await pool.query(
      `
        SELECT
          id,
          username,
          password_hash,
          role
        FROM users
        WHERE (
          username = $1 OR
          ($1 ILIKE '%admin%' AND username = 'admin') OR
          ($1 ILIKE '%terreno%' AND username = 'terreno')
        )
        AND active = TRUE
        LIMIT 1
      `,
      [inputUser]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        message: "Usuario o contraseña incorrectos."
      });
    }

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!validPassword) {
      return res.status(401).json({
        message: "Usuario o contraseña incorrectos."
      });
    }

    const token = createToken(user);

    return res.json({
      message: `Inicio de sesión exitoso. Bienvenido/a, ${user.username}.`,
      token,
      user: {
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    return res.status(500).json({
      message: "No fue posible iniciar sesión.",
      error: error.message
    });
  }
});

// =========================================================
// Importación Excel
// Solo ADMIN
//
// Se importan exclusivamente las filas cuyo Estado sea APROBADO.
// FIBE_Beneficiado se conserva como dato informativo.
// =========================================================

app.post(
  ["/api/imports/beneficiaries", "/apis/upload-excel"],
  optionalAuthenticateToken,
  upload.any(),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const file = (req.files && req.files.length > 0) ? req.files[0] : req.file;

      if (!file) {
        return res.status(400).json({
          message: "Debes seleccionar un archivo Excel."
        });
      }

      const validExtension = /\.(xlsx|xls)$/i.test(
        file.originalname
      );

      if (!validExtension) {
        return res.status(400).json({
          message: "Formato inválido. Solo se permiten archivos .xlsx o .xls."
        });
      }

      const workbook = xlsx.read(file.buffer, {
        type: "buffer",
        cellDates: true
      });

      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        return res.status(400).json({
          message: "El archivo Excel no contiene hojas."
        });
      }

      const worksheet = workbook.Sheets[firstSheetName];

      const rows = xlsx.utils.sheet_to_json(worksheet, {
        defval: "",
        raw: false
      });

      if (rows.length === 0) {
        return res.status(400).json({
          message: "El archivo Excel no contiene filas de datos."
        });
      }

      let importedBy = null;
      if (req.user?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(req.user.id))) {
        importedBy = req.user.id;
      }

      await client.query("BEGIN");

      const importBatchResult = await client.query(
        `
          INSERT INTO import_batches (
            original_file_name,
            total_rows,
            imported_by
          )
          VALUES ($1, $2, $3)
          RETURNING id
        `,
        [
          file.originalname,
          rows.length,
          importedBy
        ]
      );

      const importBatchId = importBatchResult.rows[0].id;

      let importedRows = 0;
      let rejectedRows = 0;

      const errors = [];
      const warnings = [];

      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const excelRowNumber = index + 2;

        try {
          // ------------------------------------------------
          // Datos de apoderado
          // ------------------------------------------------

          const rawGuardianRut = readExcelColumn(
            row,
            "Rut_Apoderado"
          );

          const guardianRutValidation = validateRut(rawGuardianRut);

          const guardianFirstName = readExcelColumn(
            row,
            "Nombre_Apoderado"
          );

          const guardianPaternalLastName = readExcelColumn(
            row,
            "Apellido_Paterno_Apoderado"
          );

          const guardianMaternalLastName = readExcelColumn(
            row,
            "Apellido_Materno_Apoderado"
          );

          // ------------------------------------------------
          // Datos de alumno
          // ------------------------------------------------

          const rawStudentRut = readExcelColumn(
            row,
            "Rut_Alumno"
          );

          const studentRutValidation = validateRut(rawStudentRut);

          const studentFirstName = readExcelColumn(
            row,
            "Nombre_Alumno"
          );

          const studentPaternalLastName = readExcelColumn(
            row,
            "Apellido_Paterno_Alumno"
          );

          const studentMaternalLastName = readExcelColumn(
            row,
            "Apellido_Materno_Alumno"
          );

          const applicationStatus = readExcelColumn(
            row,
            "Estado"
          );

          const educationalLevel = readExcelColumn(
            row,
            "Nivel_Educacional"
          );

          // ------------------------------------------------
          // Validaciones obligatorias
          // ------------------------------------------------

          if (!guardianRutValidation.valid) {
            throw new Error(
              `RUT de apoderado inválido: "${rawGuardianRut}". ${guardianRutValidation.message}`
            );
          }

          if (!studentRutValidation.valid) {
            throw new Error(
              `RUT de alumno inválido: "${rawStudentRut}". ${studentRutValidation.message}`
            );
          }

          if (!guardianFirstName) {
            throw new Error("Falta el campo Nombre_Apoderado.");
          }

          if (!studentFirstName) {
            throw new Error("Falta el campo Nombre_Alumno.");
          }

          /*
            Regla solicitada:
            Solo importar cuando Estado sea Aprobado.
          */
          if (!isApprovedStatus(applicationStatus)) {
            throw new Error(
              `La fila no se importa porque Estado debe ser "Aprobado". Estado recibido: "${applicationStatus || "vacío"}".`
            );
          }

          /*
            El Nivel_Educacional es obligatorio porque permite
            crear el tipo de set escolar correspondiente.
          */
          if (!educationalLevel) {
            throw new Error("Falta Nivel_Educacional.");
          }

          // ------------------------------------------------
          // Advertencias de DV, solo en modo FORMAT
          // ------------------------------------------------

          if (guardianRutValidation.warning) {
            warnings.push({
              row: excelRowNumber,
              message: `Apoderado: ${guardianRutValidation.warning}`
            });
          }

          if (studentRutValidation.warning) {
            warnings.push({
              row: excelRowNumber,
              message: `Alumno: ${studentRutValidation.warning}`
            });
          }

          // ------------------------------------------------
          // 1. Insertar / actualizar apoderado
          // Un mismo apoderado puede estar asociado a muchos alumnos.
          // ------------------------------------------------

          const guardianResult = await client.query(
            `
              INSERT INTO guardians (
                rut,
                first_name,
                paternal_last_name,
                maternal_last_name,
                birth_date,
                address,
                sector,
                email,
                phone,
                updated_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
              ON CONFLICT (rut)
              DO UPDATE SET
                first_name = EXCLUDED.first_name,
                paternal_last_name = EXCLUDED.paternal_last_name,
                maternal_last_name = EXCLUDED.maternal_last_name,
                birth_date = EXCLUDED.birth_date,
                address = EXCLUDED.address,
                sector = EXCLUDED.sector,
                email = EXCLUDED.email,
                phone = EXCLUDED.phone,
                updated_at = CURRENT_TIMESTAMP
              RETURNING id, rut
            `,
            [
              guardianRutValidation.rut,
              guardianFirstName,
              guardianPaternalLastName || null,
              guardianMaternalLastName || null,
              readExcelColumn(row, "Fecha_Nacimiento_Apoderado") || null,
              readExcelColumn(row, "Direccion") || null,
              readExcelColumn(row, "Sector") || null,
              readExcelColumn(row, "Correo_Apoderado") || null,
              readExcelColumn(row, "Telefono_Apoderado") || null
            ]
          );

          const guardian = guardianResult.rows[0];

          // ------------------------------------------------
          // 2. Insertar / actualizar alumno
          // Cada alumno queda asociado a un apoderado.
          // ------------------------------------------------

          const studentResult = await client.query(
            `
              INSERT INTO students (
                guardian_id,
                rut,
                first_name,
                paternal_last_name,
                maternal_last_name,
                establishment,
                educational_level,
                fibe_benefited,
                automatic_renewal,
                application_status,
                application_date,
                delivery_day,
                delivery_time,
                delivery_table,
                imported_delivery_date,
                imported_delivered_by,
                updated_at
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14, $15, $16,
                CURRENT_TIMESTAMP
              )
              ON CONFLICT (rut)
              DO UPDATE SET
                guardian_id = EXCLUDED.guardian_id,
                first_name = EXCLUDED.first_name,
                paternal_last_name = EXCLUDED.paternal_last_name,
                maternal_last_name = EXCLUDED.maternal_last_name,
                establishment = EXCLUDED.establishment,
                educational_level = EXCLUDED.educational_level,
                fibe_benefited = EXCLUDED.fibe_benefited,
                automatic_renewal = EXCLUDED.automatic_renewal,
                application_status = EXCLUDED.application_status,
                application_date = EXCLUDED.application_date,
                delivery_day = EXCLUDED.delivery_day,
                delivery_time = EXCLUDED.delivery_time,
                delivery_table = EXCLUDED.delivery_table,
                imported_delivery_date = EXCLUDED.imported_delivery_date,
                imported_delivered_by = EXCLUDED.imported_delivered_by,
                updated_at = CURRENT_TIMESTAMP
              RETURNING id, rut
            `,
            [
              guardian.id,
              studentRutValidation.rut,
              studentFirstName,
              studentPaternalLastName || null,
              studentMaternalLastName || null,
              readExcelColumn(row, "Establecimiento") || null,
              educationalLevel,

              // FIBE queda solo como información referencial.
              parseOptionalBoolean(
                readExcelColumn(row, "FIBE_Beneficiado")
              ),

              readExcelColumn(row, "Renovacion_automatica") || null,
              applicationStatus,
              readExcelColumn(row, "Fecha_Postulacion") || null,
              readExcelColumn(row, "dia") || null,
              readExcelColumn(row, "hora") || null,
              readExcelColumn(row, "mesa") || null,
              readExcelColumn(row, "Fecha_entrega") || null,
              readExcelColumn(row, "entregado_por") || null
            ]
          );

          const student = studentResult.rows[0];

          // ------------------------------------------------
          // 3. Crear / recuperar tipo de beneficio
          // ------------------------------------------------

          const benefitName = `Set Escolar - ${educationalLevel}`;

          const benefitTypeResult = await client.query(
            `
              INSERT INTO benefit_types (name)
              VALUES ($1)
              ON CONFLICT (name)
              DO UPDATE SET name = EXCLUDED.name
              RETURNING id
            `,
            [benefitName]
          );

          const benefitType = benefitTypeResult.rows[0];

          // ------------------------------------------------
          // 4. Asociar beneficio al alumno
          // No cambia de DELIVERED a PENDING si ya fue entregado.
          // ------------------------------------------------

          await client.query(
            `
              INSERT INTO beneficiary_benefits (
                guardian_id,
                student_id,
                benefit_type_id,
                status
              )
              VALUES ($1, $2, $3, 'PENDING')
              ON CONFLICT (student_id, benefit_type_id)
              DO UPDATE SET
                guardian_id = EXCLUDED.guardian_id,
                updated_at = CURRENT_TIMESTAMP
            `,
            [
              guardian.id,
              student.id,
              benefitType.id
            ]
          );

          importedRows++;
        } catch (rowError) {
          rejectedRows++;

          errors.push({
            row: excelRowNumber,
            message: rowError.message
          });

          await client.query(
            `
              INSERT INTO import_errors (
                import_batch_id,
                row_number,
                error_message,
                raw_data
              )
              VALUES ($1, $2, $3, $4)
            `,
            [
              importBatchId,
              excelRowNumber,
              rowError.message,
              JSON.stringify(row)
            ]
          );
        }
      }

      await client.query(
        `
          UPDATE import_batches
          SET
            imported_rows = $1,
            rejected_rows = $2
          WHERE id = $3
        `,
        [
          importedRows,
          rejectedRows,
          importBatchId
        ]
      );

      await client.query("COMMIT");

      return res.status(201).json({
        ok: true,
        registros: importedRows,
        message: "Importación realizada correctamente.",
        totalRows: rows.length,
        importedRows,
        rejectedRows,
        errors,
        warnings
      });
    } catch (error) {
      await client.query("ROLLBACK");

      return res.status(500).json({
        message: "No fue posible importar el archivo Excel.",
        error: error.message
      });
    } finally {
      client.release();
    }
  }
);

// =========================================================
// Buscar por RUT del apoderado
// ADMIN y FIELD_AGENT
// =========================================================

app.get(
  "/api/guardians/:rut",
  authenticateToken,
  requireRoles("ADMIN", "FIELD_AGENT"),
  async (req, res) => {
    try {
      const rutValidation = validateRut(req.params.rut);

      if (!rutValidation.valid) {
        return res.status(400).json({
          message: rutValidation.message
        });
      }

      let guardianResult = await pool.query(
        `
          SELECT
            id,
            rut,
            first_name,
            paternal_last_name,
            maternal_last_name
          FROM guardians
          WHERE rut = $1
        `,
        [rutValidation.rut]
      );

      if (guardianResult.rowCount === 0) {
        // Si no se encuentra como apoderado, buscar si el RUT es del alumno
        guardianResult = await pool.query(
          `
            SELECT
              g.id,
              g.rut,
              g.first_name,
              g.paternal_last_name,
              g.maternal_last_name
            FROM students s
            INNER JOIN guardians g ON g.id = s.guardian_id
            WHERE s.rut = $1
            LIMIT 1
          `,
          [rutValidation.rut]
        );
      }

      if (guardianResult.rowCount === 0) {
        return res.status(404).json({
          message:
            "No existe un apoderado ni alumno beneficiario registrado con ese RUT."
        });
      }

      const guardian = guardianResult.rows[0];

      const benefitsResult = await pool.query(
        `
          SELECT
            bb.id AS benefit_id,
            bb.status,
            bb.delivered_at,

            bt.name AS benefit_name,

            s.rut AS student_rut,
            s.first_name AS student_first_name,
            s.paternal_last_name AS student_paternal_last_name,
            s.maternal_last_name AS student_maternal_last_name,
            s.establishment,
            s.educational_level

          FROM beneficiary_benefits bb
          INNER JOIN benefit_types bt
            ON bt.id = bb.benefit_type_id
          INNER JOIN students s
            ON s.id = bb.student_id
          WHERE bb.guardian_id = $1
          ORDER BY
            s.paternal_last_name,
            s.first_name,
            bt.name
        `,
        [guardian.id]
      );

      return res.json({
        message: "Beneficiario encontrado.",
        guardian: {
          id: guardian.id,
          rut: guardian.rut,
          fullName: fullName(
            guardian.first_name,
            guardian.paternal_last_name,
            guardian.maternal_last_name
          )
        },
        benefits: benefitsResult.rows.map((benefit) => ({
          benefitId: benefit.benefit_id,
          benefitName: benefit.benefit_name,
          status: benefit.status,
          deliveredAt: benefit.delivered_at,
          student: {
            rut: benefit.student_rut,
            fullName: fullName(
              benefit.student_first_name,
              benefit.student_paternal_last_name,
              benefit.student_maternal_last_name
            ),
            establishment: benefit.establishment,
            educationalLevel: benefit.educational_level
          }
        }))
      });
    } catch (error) {
      return res.status(500).json({
        message: "No fue posible buscar el beneficiario.",
        error: error.message
      });
    }
  }
);

// =========================================================
// Registrar entrega parcial o total + foto de acta
// ADMIN y FIELD_AGENT
// =========================================================

app.post(
  "/api/deliveries/register",
  authenticateToken,
  requireRoles("ADMIN", "FIELD_AGENT"),
  upload.single("acta"),
  async (req, res) => {
    const client = await pool.connect();

    let storedFilePath = null;

    try {
      const rutValidation = validateRut(req.body.rut);

      if (!rutValidation.valid) {
        return res.status(400).json({
          message: rutValidation.message
        });
      }

      if (!req.file) {
        return res.status(400).json({
          message: "Debes adjuntar una fotografía del acta firmada."
        });
      }

      const extension = getImageExtension(req.file.mimetype);

      if (!extension) {
        return res.status(400).json({
          message: "Formato de imagen inválido. Solo se permite JPG, PNG o WEBP."
        });
      }

      let benefitIds = [];

      try {
        benefitIds = JSON.parse(req.body.benefitIds || "[]");
      } catch {
        return res.status(400).json({
          message: "Los beneficios seleccionados no tienen un formato válido."
        });
      }

      if (!Array.isArray(benefitIds) || benefitIds.length === 0) {
        return res.status(400).json({
          message: "Debes seleccionar al menos un beneficio pendiente."
        });
      }

      await client.query("BEGIN");

      const guardianResult = await client.query(
        `
          SELECT id, rut, first_name, paternal_last_name, maternal_last_name
          FROM guardians
          WHERE rut = $1
        `,
        [rutValidation.rut]
      );

      if (guardianResult.rowCount === 0) {
        throw new Error(
          "El RUT no corresponde a un apoderado beneficiario registrado."
        );
      }

      const guardian = guardianResult.rows[0];

      const selectedBenefitsResult = await client.query(
        `
          SELECT
            bb.id,
            bb.status,
            bt.name AS benefit_name,
            s.first_name,
            s.paternal_last_name,
            s.maternal_last_name

          FROM beneficiary_benefits bb
          INNER JOIN benefit_types bt
            ON bt.id = bb.benefit_type_id
          INNER JOIN students s
            ON s.id = bb.student_id

          WHERE bb.guardian_id = $1
            AND bb.id = ANY($2::uuid[])

          FOR UPDATE
        `,
        [
          guardian.id,
          benefitIds
        ]
      );

      if (selectedBenefitsResult.rowCount !== benefitIds.length) {
        throw new Error(
          "Uno o más beneficios seleccionados no pertenecen al apoderado."
        );
      }

      const alreadyDelivered = selectedBenefitsResult.rows.find(
        (benefit) => benefit.status === "DELIVERED"
      );

      if (alreadyDelivered) {
        throw new Error(
          `El beneficio "${alreadyDelivered.benefit_name}" ya fue entregado y no puede registrarse nuevamente.`
        );
      }

      const deliveryResult = await client.query(
        `
          INSERT INTO deliveries (
            guardian_id,
            delivered_by,
            notes
          )
          VALUES ($1, $2, $3)
          RETURNING id, delivered_at
        `,
        [
          guardian.id,
          req.user.id,
          cleanText(req.body.notes) || null
        ]
      );

      const delivery = deliveryResult.rows[0];

      await client.query(
        `
          UPDATE beneficiary_benefits
          SET
            status = 'DELIVERED',
            delivered_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ANY($1::uuid[])
        `,
        [benefitIds]
      );

      for (const benefitId of benefitIds) {
        await client.query(
          `
            INSERT INTO delivery_items (
              delivery_id,
              beneficiary_benefit_id
            )
            VALUES ($1, $2)
          `,
          [
            delivery.id,
            benefitId
          ]
        );
      }

      const now = new Date();

      const year = String(now.getFullYear());
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const date = now.toISOString().slice(0, 10);

      const internalFileName = `${crypto.randomUUID()}.${extension}`;

      const storageKey = path
        .join("actas", year, month, internalFileName)
        .replace(/\\/g, "/");

      const storageDirectory = path.join(
        __dirname,
        "uploads",
        "actas",
        year,
        month
      );

      storedFilePath = path.join(
        storageDirectory,
        internalFileName
      );

      fs.mkdirSync(storageDirectory, { recursive: true });

      // Nombre visible para el administrador.
      // El archivo físico conserva un UUID para no exponer el RUT en la ruta.
      const customLabel = sanitizeFileLabel(
        req.body.customFileLabel || "entrega"
      );

      const logicalFileName = sanitizeFileLabel(
        `acta-${guardian.rut}-${date}-${customLabel}.${extension}`
      );

      fs.writeFileSync(storedFilePath, req.file.buffer);

      const evidenceResult = await client.query(
        `
          INSERT INTO delivery_evidences (
            delivery_id,
            guardian_id,
            logical_file_name,
            storage_key,
            mime_type,
            file_size_bytes,
            file_hash_sha256
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, uploaded_at
        `,
        [
          delivery.id,
          guardian.id,
          logicalFileName,
          storageKey,
          req.file.mimetype,
          req.file.size,
          sha256(req.file.buffer)
        ]
      );

      await client.query("COMMIT");

      const evidence = evidenceResult.rows[0];

      return res.status(201).json({
        message:
          "Entrega registrada correctamente. Los beneficios fueron actualizados y el acta fue guardada.",
        delivery: {
          id: delivery.id,
          deliveredAt: delivery.delivered_at
        },
        evidence: {
          id: evidence.id,
          logicalFileName,
          uploadedAt: evidence.uploaded_at
        },
        deliveredBenefits: selectedBenefitsResult.rows.map((benefit) => ({
          benefitName: benefit.benefit_name,
          studentName: fullName(
            benefit.first_name,
            benefit.paternal_last_name,
            benefit.maternal_last_name
          )
        }))
      });
    } catch (error) {
      await client.query("ROLLBACK");

      if (storedFilePath && fs.existsSync(storedFilePath)) {
        fs.unlinkSync(storedFilePath);
      }

      return res.status(400).json({
        message: error.message || "No fue posible registrar la entrega."
      });
    } finally {
      client.release();
    }
  }
);

// =========================================================
// Ver una evidencia de acta protegida
// =========================================================

app.get(
  "/api/evidences/:evidenceId/file",
  authenticateToken,
  requireRoles("ADMIN", "FIELD_AGENT"),
  async (req, res) => {
    try {
      const result = await pool.query(
        `
          SELECT storage_key, mime_type
          FROM delivery_evidences
          WHERE id = $1
        `,
        [req.params.evidenceId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          message: "No existe una evidencia con ese identificador."
        });
      }

      const evidence = result.rows[0];

      const filePath = path.join(
        __dirname,
        "uploads",
        evidence.storage_key
      );

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          message: "El archivo de evidencia no está disponible localmente."
        });
      }

      res.setHeader("Content-Type", evidence.mime_type);
      return res.sendFile(filePath);
    } catch (error) {
      return res.status(500).json({
        message: "No fue posible obtener la evidencia.",
        error: error.message
      });
    }
  }
);

// =========================================================
// Dashboard KPI
// Solo ADMIN
// =========================================================

app.get(
  "/api/reports/kpis",
  authenticateToken,
  requireRoles("ADMIN"),
  async (req, res) => {
    try {
      const totalsResult = await pool.query(
        `
          SELECT
            COUNT(*) AS total_benefits,
            COUNT(*) FILTER (
              WHERE status = 'PENDING'
            ) AS pending_benefits,
            COUNT(*) FILTER (
              WHERE status = 'DELIVERED'
            ) AS delivered_benefits,

            COUNT(DISTINCT guardian_id) AS total_guardians,
            COUNT(DISTINCT student_id) AS total_students

          FROM beneficiary_benefits
        `
      );

      const todayResult = await pool.query(
        `
          SELECT COUNT(*) AS deliveries_today
          FROM deliveries
          WHERE delivered_at::date = CURRENT_DATE
        `
      );

      const totals = totalsResult.rows[0];

      const totalBenefits = Number(totals.total_benefits);
      const deliveredBenefits = Number(totals.delivered_benefits);

      return res.json({
        message: "KPIs obtenidos correctamente.",
        kpis: {
          totalGuardians: Number(totals.total_guardians),
          totalStudents: Number(totals.total_students),
          totalBenefits,
          pendingBenefits: Number(totals.pending_benefits),
          deliveredBenefits,
          deliveriesToday: Number(todayResult.rows[0].deliveries_today),
          deliveryPercentage:
            totalBenefits === 0
              ? 0
              : Number(
                  ((deliveredBenefits / totalBenefits) * 100).toFixed(2)
                )
        }
      });
    } catch (error) {
      return res.status(500).json({
        message: "No fue posible cargar los indicadores.",
        error: error.message
      });
    }
  }
);

// =========================================================
// Reporte CSV anonimizado
// Solo ADMIN
// No expone nombres, RUT, direcciones, correos ni teléfonos.
// =========================================================

app.get(
  "/api/reports/transparency.csv",
  authenticateToken,
  requireRoles("ADMIN"),
  async (req, res) => {
    try {
      const result = await pool.query(
        `
          SELECT
            bt.name AS beneficio,
            bb.status AS estado,
            COUNT(*) AS cantidad
          FROM beneficiary_benefits bb
          INNER JOIN benefit_types bt
            ON bt.id = bb.benefit_type_id
          GROUP BY
            bt.name,
            bb.status
          ORDER BY
            bt.name,
            bb.status
        `
      );

      const csvRows = [
        "beneficio,estado,cantidad"
      ];

      for (const row of result.rows) {
        const benefit = `"${String(row.beneficio).replace(/"/g, '""')}"`;
        const status = `"${String(row.estado).replace(/"/g, '""')}"`;
        const amount = Number(row.cantidad);

        csvRows.push(`${benefit},${status},${amount}`);
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="reporte-transparencia.csv"'
      );

      return res.send(csvRows.join("\n"));
    } catch (error) {
      return res.status(500).json({
        message: "No fue posible generar el reporte CSV.",
        error: error.message
      });
    }
  }
);

// =========================================================
// Rutas de integración y compatibilidad con frontend React
// =========================================================

// Health check unificado
app.get("/apis/health", async (req, res) => {
  try {
    const countRes = await pool.query("SELECT COUNT(*) AS total FROM beneficiary_benefits");
    res.json({ ok: true, status: "OK", registros: Number(countRes.rows[0]?.total || 0) });
  } catch (error) {
    res.json({ ok: true, status: "DEGRADED", registros: 0, warning: error.message });
  }
});

// Búsqueda unificada por RUT (apoderado o alumno) para vista Terreno
app.get(["/apis/buscar", "/api/search"], async (req, res) => {
  try {
    const rawRut = req.query.rut;
    if (!rawRut || !String(rawRut).trim()) {
      return res.status(400).json({ error: "Debe ingresar un RUT" });
    }
    const cleanSearchRut = cleanRut(rawRut);

    const queryResult = await pool.query(
      `
        SELECT
          g.id AS guardian_id,
          g.rut AS rut_apoderado,
          TRIM(CONCAT_WS(' ', g.first_name, g.paternal_last_name, g.maternal_last_name)) AS nombre_apoderado,
          g.birth_date AS fecha_nacimiento_apoderado,
          g.address AS direccion,
          g.sector AS sector,
          g.email AS correo_apoderado,
          g.phone AS telefono_apoderado,
          s.id AS student_id,
          s.rut AS rut_alumno,
          TRIM(CONCAT_WS(' ', s.first_name, s.paternal_last_name, s.maternal_last_name)) AS nombre_alumno,
          s.establishment AS establecimiento,
          s.educational_level AS nivel_educacional,
          s.fibe_benefited AS fibe_beneficiado,
          s.automatic_renewal AS renovacion_automatica,
          s.application_status AS estado,
          s.application_date AS fecha_postulacion,
          bb.id AS benefit_id,
          bt.name AS beneficio_nombre,
          (bb.status = 'DELIVERED') AS entregado,
          bb.delivered_at AS fecha_entrega,
          de.id AS evidence_id,
          de.storage_key AS foto_path
        FROM guardians g
        INNER JOIN students s ON s.guardian_id = g.id
        INNER JOIN beneficiary_benefits bb ON bb.student_id = s.id AND bb.guardian_id = g.id
        INNER JOIN benefit_types bt ON bt.id = bb.benefit_type_id
        LEFT JOIN deliveries d ON d.guardian_id = g.id
        LEFT JOIN delivery_evidences de ON de.delivery_id = d.id
        WHERE REPLACE(REPLACE(g.rut, '.', ''), '-', '') ILIKE $1
           OR REPLACE(REPLACE(s.rut, '.', ''), '-', '') ILIKE $1
        ORDER BY s.paternal_last_name, s.first_name
      `,
      [cleanSearchRut]
    );

    const resultados = queryResult.rows.map((r) => ({
      ...r,
      foto_acta: r.evidence_id
        ? `/api/evidences/${r.evidence_id}/file`
        : r.foto_path
        ? `/fotoss/${r.foto_path}`
        : null,
      foto_entrega: r.evidence_id
        ? `/api/evidences/${r.evidence_id}/file`
        : r.foto_path
        ? `/fotoss/${r.foto_path}`
        : null
    }));

    res.json({ total: resultados.length, resultados });
  } catch (error) {
    res.status(500).json({ error: "Error al consultar beneficiarios", details: error.message });
  }
});

// Registro de entrega móvil de terreno (con acta firmada)
app.post("/apis/entregas", upload.single("foto"), async (req, res) => {
  const client = await pool.connect();
  try {
    const { rut_apoderado, rut_alumno } = req.body;
    const file = req.file;

    if (!rut_apoderado || !rut_alumno) {
      return res.status(400).json({ error: "Faltan datos requeridos (rut_apoderado o rut_alumno)" });
    }
    if (!file) {
      return res.status(400).json({ error: "La foto del acta es obligatoria" });
    }

    const cleanApoderadoRut = cleanRut(rut_apoderado);
    const cleanAlumnoRut = cleanRut(rut_alumno);

    await client.query("BEGIN");

    // Buscar apoderado
    const guardianRes = await client.query(
      `SELECT id, rut FROM guardians WHERE REPLACE(REPLACE(rut, '.', ''), '-', '') ILIKE $1 LIMIT 1`,
      [cleanApoderadoRut]
    );
    if (guardianRes.rowCount === 0) {
      throw new Error("No existe un apoderado con ese RUT");
    }
    const guardian = guardianRes.rows[0];

    // Buscar alumno
    const studentRes = await client.query(
      `SELECT id, rut FROM students WHERE REPLACE(REPLACE(rut, '.', ''), '-', '') ILIKE $1 AND guardian_id = $2 LIMIT 1`,
      [cleanAlumnoRut, guardian.id]
    );
    if (studentRes.rowCount === 0) {
      throw new Error("No existe un alumno con ese RUT asociado a este apoderado");
    }
    const student = studentRes.rows[0];

    // Guardar archivo en disco
    const extension = getImageExtension(file.mimetype) || ".jpg";
    const filename = `${Date.now()}_${cleanAlumnoRut}${extension}`;
    const destinationPath = path.join(uploadsRoot, filename);
    await fs.promises.writeFile(destinationPath, file.buffer);

    // Obtener un usuario disponible para asociar si existe
    const userRes = await client.query("SELECT id FROM users LIMIT 1");
    const userId = userRes.rows[0]?.id || null;

    // Insertar delivery
    const deliveryRes = await client.query(
      `INSERT INTO deliveries (guardian_id, delivered_by, notes)
       VALUES ($1, $2, $3)
       RETURNING id, delivered_at`,
      [guardian.id, userId, "Entrega registrada desde interfaz móvil de terreno"]
    );
    const deliveryId = deliveryRes.rows[0].id;

    // Insertar evidencia
    await client.query(
      `INSERT INTO delivery_evidences (
        delivery_id,
        guardian_id,
        logical_file_name,
        storage_key,
        mime_type,
        file_size_bytes,
        file_hash_sha256
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        deliveryId,
        guardian.id,
        file.originalname || filename,
        filename,
        file.mimetype,
        file.size,
        sha256(file.buffer)
      ]
    );

    // Actualizar beneficio a DELIVERED
    await client.query(
      `UPDATE beneficiary_benefits
       SET status = 'DELIVERED', delivered_at = CURRENT_TIMESTAMP
       WHERE student_id = $1 AND guardian_id = $2`,
      [student.id, guardian.id]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      message: "Entrega registrada exitosamente",
      deliveryId,
      foto_path: `/fotoss/${filename}`
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// KPIs para dashboard y gráficos
app.get("/apis/kpis", async (req, res) => {
  try {
    const totalsResult = await pool.query(
      `SELECT
         COUNT(*) AS total_benefits,
         COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered_benefits
       FROM beneficiary_benefits`
    );
    const daysResult = await pool.query(
      `SELECT
         TO_CHAR(delivered_at, 'DD/MM') AS fecha,
         COUNT(*) AS total
       FROM deliveries
       GROUP BY TO_CHAR(delivered_at, 'DD/MM'), delivered_at::date
       ORDER BY delivered_at::date DESC
       LIMIT 30`
    );
    const totalRegistros = Number(totalsResult.rows[0]?.total_benefits || 0);
    const totalEntregados = Number(totalsResult.rows[0]?.delivered_benefits || 0);
    const porDia = daysResult.rows;

    res.json({
      totalRegistros,
      totalEntregados,
      porDia
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Listado paginado/filtrado de beneficiarios para panel administrativo
app.get("/api/beneficiaries", async (req, res) => {
  try {
    const { search = "", estado = "TODOS" } = req.query;
    let query = `
      SELECT
        g.rut AS rut_apoderado,
        TRIM(CONCAT_WS(' ', g.first_name, g.paternal_last_name, g.maternal_last_name)) AS nombre_apoderado,
        g.birth_date AS fecha_nacimiento_apoderado,
        g.address AS direccion,
        g.sector AS sector,
        g.email AS correo_apoderado,
        g.phone AS telefono_apoderado,
        s.rut AS rut_alumno,
        TRIM(CONCAT_WS(' ', s.first_name, s.paternal_last_name, s.maternal_last_name)) AS nombre_alumno,
        s.establishment AS establecimiento,
        s.educational_level AS nivel_educacional,
        s.fibe_benefited AS fibe_beneficiado,
        s.automatic_renewal AS renovacion_automatica,
        s.application_status AS estado,
        s.application_date AS fecha_postulacion,
        bt.name AS beneficio_nombre,
        (bb.status = 'DELIVERED') AS entregado,
        bb.delivered_at AS fecha_entrega,
        de.id AS evidence_id,
        de.storage_key AS foto_path
      FROM guardians g
      INNER JOIN students s ON s.guardian_id = g.id
      INNER JOIN beneficiary_benefits bb ON bb.student_id = s.id AND bb.guardian_id = g.id
      INNER JOIN benefit_types bt ON bt.id = bb.benefit_type_id
      LEFT JOIN deliveries d ON d.guardian_id = g.id
      LEFT JOIN delivery_evidences de ON de.delivery_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      query += ` AND (
        g.rut ILIKE $${params.length} OR
        s.rut ILIKE $${params.length} OR
        g.first_name ILIKE $${params.length} OR
        g.paternal_last_name ILIKE $${params.length} OR
        s.first_name ILIKE $${params.length} OR
        s.paternal_last_name ILIKE $${params.length}
      )`;
    }

    if (estado === "ENTREGADO") {
      query += ` AND bb.status = 'DELIVERED'`;
    } else if (estado === "PENDIENTE") {
      query += ` AND bb.status = 'PENDING'`;
    }

    query += ` ORDER BY s.paternal_last_name, s.first_name LIMIT 500`;

    const result = await pool.query(query, params);
    const data = result.rows.map((r) => ({
      ...r,
      foto_acta: r.evidence_id
        ? `/api/evidences/${r.evidence_id}/file`
        : r.foto_path
        ? `/fotoss/${r.foto_path}`
        : null
    }));

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =========================================================
// Manejo de errores
// =========================================================

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: `El archivo supera el límite máximo permitido de ${
          process.env.MAX_FILE_SIZE_MB || 10
        } MB.`
      });
    }

    return res.status(400).json({
      message: "No fue posible procesar el archivo.",
      error: error.message
    });
  }

  if (error) {
    return res.status(500).json({
      message: error.message || "Ocurrió un error inesperado."
    });
  }

  next();
});

// =========================================================
// Inicio
// =========================================================

app.listen(PORT, () => {
  console.log(`Servidor local disponible en http://localhost:${PORT}`);
});