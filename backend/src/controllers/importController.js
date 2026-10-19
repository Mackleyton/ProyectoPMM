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
      return res.status(400).json({ message: "Debes adjuntar un archivo de planilla Excel (.xlsx o .xls)." });
    }

    // Modo de importación: 'replace' (reemplazo total) o 'update' (actualización/adición)
    const mode = String(req.body.mode || req.query.mode || "update").toLowerCase();
    const isReplace = mode === "replace";

    const { results, errors, totalRows } = parseExcelBeneficiaries(req.file.buffer);

    if (results.length === 0) {
      return res.status(400).json({
        message: "No se pudieron procesar registros válidos del archivo Excel.",
        errors,
      });
    }

    // 1. Si es modo reemplazo en memoria, limpiar todo
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

    // 2. Sincronizar en PostgreSQL si está disponible
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
      const destFile = path.join(__dirname, "..", "..", "data", "formulario_postulantes.xlsx");
      fs.writeFileSync(destFile, req.file.buffer);
    } catch (saveErr) {
      console.warn("[IMPORT] No se pudo guardar copia local de respaldo:", saveErr.message);
    }

    // Registro de Auditoría
    const auditAction = isReplace ? "IMPORT_EXCEL_REPLACE" : "IMPORT_EXCEL_UPDATE";
    await recordAuditLog({
      userId: req.user?.id,
      username: req.user?.username || "admin",
      action: auditAction,
      entityType: "EXCEL_IMPORT",
      details: {
        fileName: req.file.originalname,
        mode: isReplace ? "REEMPLAZO_TOTAL" : "ACTUALIZACION_INCREMENTAL",
        totalRows,
        importedRows: results.length,
        rejectedRows: errors.length,
      },
      ipAddress,
    });

    return res.json({
      ok: true,
      mode: isReplace ? "REEMPLAZO_TOTAL" : "ACTUALIZACION_INCREMENTAL",
      message: isReplace
        ? `Nómina reemplazada exitosamente. Se cargaron ${results.length} beneficiarios nuevos.`
        : `Nómina actualizada exitosamente. Se procesaron ${results.length} beneficiarios conservando entregas previas.`,
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
    return res.status(500).json({ message: "Error al reiniciar la base de datos.", error: error.message });
  }
}

module.exports = {
  importExcel,
  resetDatabase,
};
