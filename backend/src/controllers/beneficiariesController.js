const { pool, usePostgres, memoryStore } = require("../config/db");
const { validateRut, cleanRut } = require("../utils/rut");

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

    // 1. Intentar en PostgreSQL
    if (usePostgres) {
      try {
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
        console.warn("[BENEFICIARIOS] Error consultando PostgreSQL:", dbErr.message);
      }
    }

    // 2. Buscar en memoria
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
        message: `No se encontraron beneficiarios registrados para el RUT ${rutParam}.`,
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
        nombre_apoderado: guardian ? (guardian.fullName || fullName(guardian.firstName, guardian.paternalLastName, guardian.maternalLastName)) : "",
        direccion: guardian ? guardian.address : "",
        sector: guardian ? guardian.sector : "CENTRO",
        telefono_apoderado: guardian ? guardian.phone : "",
        correo_apoderado: guardian ? guardian.email : "",
        rut_alumno: student ? student.rut : b.studentRut,
        nombre_alumno: student ? (student.fullName || fullName(student.firstName, student.paternalLastName, student.maternalLastName)) : "",
        establecimiento: student ? student.establishment : "",
        nivel_educacional: student ? student.educationalLevel : "",
        estado: student ? student.state : "APROBADA",
        beneficio_nombre: b.benefitName,
        entregado: b.status === "DELIVERED",
        fecha_entrega: b.deliveredAt,
        foto_acta: b.evidenceId ? `/api/evidences/${b.evidenceId}/file` : null,
      };

      if (search) {
        const match =
          row.nombre_apoderado.toLowerCase().includes(search) ||
          row.nombre_alumno.toLowerCase().includes(search) ||
          cleanRut(row.rut_apoderado).includes(cleanRut(search)) ||
          cleanRut(row.rut_alumno).includes(cleanRut(search));
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

module.exports = {
  getBeneficiaryByRut,
  listBeneficiaries,
};
