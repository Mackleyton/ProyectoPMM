const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pool, usePostgres, memoryStore } = require("../config/db");
const { validateRut } = require("../utils/rut");
const { recordAuditLog } = require("../services/auditService");

const uploadsRoot = path.join(__dirname, "..", "..", "uploads", "actas");
if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function getImageExtension(mimeType) {
  switch (mimeType) {
    case "image/jpeg": return ".jpg";
    case "image/png": return ".png";
    case "image/webp": return ".webp";
    default: return ".jpg";
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
      return res.status(400).json({ message: "Debes adjuntar la fotografía del acta física firmada." });
    }

    let benefitIds = [];
    try {
      benefitIds = JSON.parse(req.body.benefitIds || "[]");
    } catch {
      return res.status(400).json({ message: "Formato inválido en la selección de beneficios." });
    }

    if (!Array.isArray(benefitIds) || benefitIds.length === 0) {
      return res.status(400).json({ message: "Debes seleccionar al menos un beneficio para registrar la entrega." });
    }

    // Metadata técnica solicitada: hora y geolocalización
    const latitude = req.body.latitude ? parseFloat(req.body.latitude) : null;
    const longitude = req.body.longitude ? parseFloat(req.body.longitude) : null;
    const capturedAt = req.body.captured_at || new Date().toISOString();
    const syncStatus = req.body.sync_status || "SYNCED";
    const notes = String(req.body.notes || "Entrega física de beneficio").trim();

    const durationSeconds = req.body.duration_seconds ? parseInt(req.body.duration_seconds, 10) : null;
    if (durationSeconds && durationSeconds > 0 && durationSeconds < 7200) {
      if (!memoryStore.attentionTimes) memoryStore.attentionTimes = [];
      memoryStore.attentionTimes.push(durationSeconds);
      // Mantener los últimos 200 registros de atención para promedio móvil
      if (memoryStore.attentionTimes.length > 200) memoryStore.attentionTimes.shift();
    }

    const extension = getImageExtension(req.file.mimetype);
    const fileHash = sha256(req.file.buffer);
    const deliveryDate = new Date().toISOString();
    const deliveredBenefits = [];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let dbEvidenceId = null;
    let filename = null;

    // 1. Guardar en PostgreSQL si está disponible
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

        // Deduplicación de evidencias por hash SHA-256
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
        console.warn("[DELIVERY] Error guardando en PostgreSQL:", dbErr.message);
      } finally {
        client.release();
      }
    }

    // 2. Guardar archivo físico si aún no se guardó
    if (!filename) {
      filename = `${Date.now()}_${rutValidation.clean}${extension}`;
      const destination = path.join(uploadsRoot, filename);
      if (!fs.existsSync(destination)) {
        fs.writeFileSync(destination, req.file.buffer);
      }
    }

    // 3. Sincronizar en memoria
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
            studentName: student ? (student.fullName || `${student.firstName} ${student.paternalLastName}`) : "Alumno",
            benefitName: b.benefitName,
          });
        }
      }
    });

    // 4. Registro de Auditoría
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
        fileSizeKb: Math.round(req.file.size / 1024),
      },
      ipAddress,
    });

    return res.json({
      message: "Entrega física registrada exitosamente con respaldo de acta.",
      delivery: {
        id: `del-${Date.now()}`,
        deliveredAt: deliveryDate,
        latitude,
        longitude,
        capturedAt,
      },
      deliveredBenefits,
      evidence: {
        id: evidenceId,
        logicalFileName: filename,
        url: `/api/evidences/${evidenceId}/file`,
      },
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
        res.setHeader("Content-Type", dbRes.rows[0].mime_type || "image/jpeg");
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

  return res.status(404).json({ message: "Evidencia fotográfica no encontrada." });
}

module.exports = {
  registerDelivery,
  getEvidenceFile,
};
