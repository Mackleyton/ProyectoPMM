const fs = require("fs");
const path = require("path");
const { pool, usePostgres, syncDataToPostgres, memoryStore } = require("../config/db");
const { parseExcelBeneficiaries } = require("../utils/excel");
const { cleanRut } = require("../utils/rut");
const { recordAuditLog } = require("../services/auditService");

async function importExcel(req, res) {
  const ipAddress = req.ip || req.connection.remoteAddress || "127.0.0.1";
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Debes adjuntar un archivo de planilla (.xlsx, .xls o .csv)." });
    }

    // Modo de importación: 'replace' (reemplazo total) o 'update' (actualización/adición)
    const mode = String(req.body.mode || req.query.mode || "update").toLowerCase();
    const isReplace = mode === "replace";

    const { results, errors, totalRows } = parseExcelBeneficiaries(req.file.buffer);

    if (results.length === 0) {
      return res.status(400).json({
        message: "No se pudieron procesar registros válidos del archivo Excel o CSV.",
        errors,
      });
    }

    // Si es modo reemplazo en memoria, limpiar todo
    if (isReplace) {
      memoryStore.guardians.clear();
      memoryStore.students.clear();
      memoryStore.benefits.clear();
    }

    // Guardar en memoria
    results.forEach((item) => {
      let guardian = memoryStore.guardians.get(item.guardian.rut);
      if (!guardian || isReplace) {
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
      const existing = memoryStore.benefits.get(benefitId);

      const status = (!isReplace && existing && existing.status === "DELIVERED") ? "DELIVERED" : item.benefit.status;
      const deliveredAt = (!isReplace && existing && existing.status === "DELIVERED") ? existing.deliveredAt : item.benefit.deliveredAt;
      const evidenceId = (!isReplace && existing && existing.status === "DELIVERED") ? existing.evidenceId : null;

      memoryStore.benefits.set(benefitId, {
        id: benefitId,
        guardianId: guardian.id,
        guardianRut: item.guardian.rut,
        studentId: studentId,
        studentRut: item.student.rut,
        benefitName: item.benefit.name,
        status,
        deliveredAt,
        evidenceId,
      });
    });

    // Sincronizar en PostgreSQL si está disponible
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

    // Persistir copia en backend/data para respaldos
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
      details: `Importación masiva: ${results.length} beneficiarios procesados desde ${req.file.originalname}`,
      ipAddress,
    });

    return res.json({
      message: "Planilla procesada e importada correctamente.",
      totalRows,
      importedRows: results.length,
      rejectedRows: errors.length,
      errors: errors.slice(0, 10),
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
      details: { resetAt: new Date().toISOString() },
      ipAddress,
    });

    return res.json({
      ok: true,
      message: "Base de datos y actas físicas reseteadas exitosamente.",
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
      details: { resetAt: new Date().toISOString() },
      ipAddress,
    });

    return res.json({
      ok: true,
      message: "Base de datos y actas físicas reseteadas exitosamente.",
    });
  } catch (error) {
    console.error("[RESET_DB] Error:", error);
    return res.status(500).json({ message: "Error al reiniciar la base de datos.", error: error.message });
  }
}

module.exports = {
  importExcel,
  resetDatabase,
};
