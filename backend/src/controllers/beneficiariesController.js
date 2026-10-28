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
            benefits: bRes.rows.map((r) => ({
              id: r.benefit_id,
              name: r.benefit_name,
              status: r.status,
              deliveredAt: r.delivered_at,
              evidenceId: r.evidence_id,
              photoEvidenceUrl: r.photo_evidence_id ? `/api/evidences/${r.photo_evidence_id}/file` : null,
              student: {
                rut: r.student_rut,
                fullName: fullName(r.first_name, r.paternal_last_name, r.maternal_last_name),
                establishment: r.establishment,
                educationalLevel: r.educational_level,
              },
            })),
          });
        }
      } catch (dbErr) {
        console.warn("[BENEFICIARIOS] Error buscando por RUT en PostgreSQL:", dbErr.message);
      }
    }

    // 2. Fallback memoria
    let guardian = null;
    for (const g of memoryStore.guardians.values()) {
      if (cleanRut(g.rut) === rutClean) {
        guardian = g;
        break;
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
      return res.status(404).json({ message: "No se encontró ningún beneficiario o apoderado con el RUT ingresado." });
    }

    const assignedBenefits = [];
    for (const b of memoryStore.benefits.values()) {
      if (cleanRut(b.guardianRut) === cleanRut(guardian.rut)) {
        const student = memoryStore.students.get(b.studentRut);
        assignedBenefits.push({
          id: b.id,
          name: b.benefitName,
          status: b.status,
          deliveredAt: b.deliveredAt,
          evidenceId: b.evidenceId,
          photoEvidenceUrl: b.evidenceId ? `/api/evidences/${b.evidenceId}/file` : null,
          student: {
            rut: student ? student.rut : b.studentRut,
            fullName: student ? (student.fullName || fullName(student.firstName, student.paternalLastName, student.maternalLastName)) : "Alumno",
            establishment: student ? student.establishment : "Establecimiento",
            educationalLevel: student ? student.educationalLevel : "Nivel",
          },
        });
      }
    }

    return res.json({
      message: "Beneficiario encontrado.",
      guardian: {
        id: guardian.id,
        rut: guardian.rut,
        fullName: guardian.fullName || fullName(guardian.firstName, guardian.paternalLastName, guardian.maternalLastName),
        address: guardian.address,
        sector: guardian.sector,
        email: guardian.email,
        phone: guardian.phone,
      },
      benefits: assignedBenefits,
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al consultar beneficiario.", error: error.message });
  }
}

async function listBeneficiaries(req, res) {
  try {
    const search = String(req.query.search || "").trim().toLowerCase();
    const estado = String(req.query.estado || "").trim().toUpperCase();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    if (usePostgres) {
      try {
        const params = [];
        let whereClauses = [];

        if (search) {
          const cleanSearch = cleanRut(search);
          params.push(`%${search}%`);
          const p1 = `$${params.length}`;
          params.push(`%${cleanSearch}%`);
          const p2 = `$${params.length}`;

          whereClauses.push(`(
            LOWER(g.first_name || ' ' || COALESCE(g.paternal_last_name, '') || ' ' || COALESCE(g.maternal_last_name, '')) LIKE ${p1}
            OR LOWER(s.first_name || ' ' || COALESCE(s.paternal_last_name, '') || ' ' || COALESCE(s.maternal_last_name, '')) LIKE ${p1}
            OR regexp_replace(g.rut, '[^0-9kK]', '', 'g') LIKE ${p2}
            OR regexp_replace(s.rut, '[^0-9kK]', '', 'g') LIKE ${p2}
          )`);
        }

        if (estado && estado !== "TODOS") {
          if (estado === "ENTREGADO") {
            whereClauses.push(`bb.status = 'DELIVERED'`);
          } else if (estado === "PENDIENTE") {
            whereClauses.push(`(bb.status IS NULL OR bb.status != 'DELIVERED')`);
          }
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

        // Conteo total para paginación
        const countQuery = `
          SELECT COUNT(bb.id) AS total
          FROM beneficiary_benefits bb
          JOIN guardians g ON g.id = bb.guardian_id
          JOIN students s ON s.id = bb.student_id
          ${whereSql}
        `;
        const countRes = await pool.query(countQuery, params);
        const total = parseInt(countRes.rows[0]?.total || 0, 10);

        // Consulta paginada con LIMIT y OFFSET
        const queryParams = [...params, limit, offset];
        const limitParam = `$${queryParams.length - 1}`;
        const offsetParam = `$${queryParams.length}`;

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
          ${whereSql}
          ORDER BY bb.id, g.paternal_last_name, s.first_name
          LIMIT ${limitParam} OFFSET ${offsetParam}
        `;

        const dbRes = await pool.query(pgQuery, queryParams);
        const items = dbRes.rows.map((row) => ({
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

        return res.json({
          items,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        });
      } catch (dbErr) {
        console.warn("[BENEFICIARIOS] Error consultando PostgreSQL:", dbErr.message);
      }
    }

    // Memoria
    let allResults = [];
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

      allResults.push(row);
    }

    const total = allResults.length;
    const paginatedItems = allResults.slice(offset, offset + limit);

    return res.json({
      items: paginatedItems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al listar beneficiarios.", error: error.message });
  }
}

module.exports = {
  getBeneficiaryByRut,
  listBeneficiaries,
};
