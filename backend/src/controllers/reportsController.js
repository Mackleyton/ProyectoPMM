const { pool, usePostgres, memoryStore } = require("../config/db");

// Clasificación canónica de niveles educativos
function categorizeLevel(lvl) {
  const s = String(lvl || "").toLowerCase();
  if (s.includes("pre") || s.includes("kinder") || s.includes("kínder")) {
    return "Pre-Básica (Pre-Kinder y Kinder)";
  }
  if (s.includes("media") || s.includes("secundaria")) {
    return "Media (1° a 4° Medio)";
  }
  if (s.includes("segundo") || s.includes("5") || s.includes("6") || s.includes("7") || s.includes("8")) {
    return "Básica Segundo Ciclo (5° a 8° Básico)";
  }
  return "Básica Primer Ciclo (1° a 4° Básico)";
}

async function getKpis(req, res) {
  try {
    let totalGuardians = 0;
    let totalStudents = 0;
    let totalBenefits = 0;
    let deliveredBenefits = 0;
    let pendingBenefits = 0;
    let deliveriesToday = 0;

    let deliveriesBySector = [];
    let distribucionSectores = [];
    let distribucionNivel = [];
    let flujoPorHora = [
      { rango: "08:00 - 11:00", cantidad: 0 },
      { rango: "11:00 - 14:00", cantidad: 0 },
      { rango: "14:00 - 17:00", cantidad: 0 },
      { rango: "17:00+", cantidad: 0 },
    ];

    const stockMap = {
      "Pre-Básica (Pre-Kinder y Kinder)": { nivel: "Pre-Básica (Pre-Kinder y Kinder)", inicial: 0, entregadas: 0, saldo: 0, pct: 0 },
      "Básica Primer Ciclo (1° a 4° Básico)": { nivel: "Básica Primer Ciclo (1° a 4° Básico)", inicial: 0, entregadas: 0, saldo: 0, pct: 0 },
      "Básica Segundo Ciclo (5° a 8° Básico)": { nivel: "Básica Segundo Ciclo (5° a 8° Básico)", inicial: 0, entregadas: 0, saldo: 0, pct: 0 },
      "Media (1° a 4° Medio)": { nivel: "Media (1° a 4° Medio)", inicial: 0, entregadas: 0, saldo: 0, pct: 0 },
    };

    const sectorCounter = {};
    const nivelCounter = {};
    let totalAprobadas = 0;
    let entregadosConActa = 0;

    if (usePostgres) {
      try {
        const statsRes = await pool.query(`
          SELECT
            COUNT(DISTINCT s.id) FILTER (WHERE UPPER(COALESCE(s.state, 'APROBADA')) = 'APROBADA')::int AS total_aprobadas,
            COUNT(DISTINCT bb.id) FILTER (WHERE bb.status = 'DELIVERED')::int AS delivered_count,
            COUNT(DISTINCT bb.id) FILTER (WHERE bb.status = 'DELIVERED' AND (DATE(bb.delivered_at) = CURRENT_DATE OR DATE(bb.delivered_at AT TIME ZONE 'America/Santiago') = CURRENT_DATE))::int AS deliveries_today
          FROM students s
          LEFT JOIN beneficiary_benefits bb ON bb.student_id = s.id
        `);

        if (statsRes.rowCount > 0) {
          totalAprobadas = Number(statsRes.rows[0].total_aprobadas) || 0;
          entregadosConActa = Number(statsRes.rows[0].delivered_count) || 0;
          deliveriesToday = Number(statsRes.rows[0].deliveries_today) || 0;
        }

        // Sector distribution para aprobados
        const secRes = await pool.query(`
          SELECT COALESCE(NULLIF(g.sector, ''), 'CENTRO') AS sector, COUNT(s.id)::int AS total
          FROM students s
          JOIN guardians g ON g.id = s.guardian_id
          WHERE UPPER(COALESCE(s.state, 'APROBADA')) = 'APROBADA'
          GROUP BY COALESCE(NULLIF(g.sector, ''), 'CENTRO')
          ORDER BY total DESC
        `);
        distribucionSectores = secRes.rows.map((r) => ({
          sector: r.sector,
          cantidad: Number(r.total),
          deliveries: Number(r.total),
        }));

        // Stock y niveles
        const lvlRes = await pool.query(`
          SELECT 
            s.educational_level,
            bb.status,
            bb.delivered_at
          FROM students s
          LEFT JOIN beneficiary_benefits bb ON bb.student_id = s.id
          WHERE UPPER(COALESCE(s.state, 'APROBADA')) = 'APROBADA'
        `);

        lvlRes.rows.forEach((r) => {
          const cat = categorizeLevel(r.educational_level);
          if (stockMap[cat]) {
            stockMap[cat].inicial += 1;
            if (r.status === "DELIVERED") {
              stockMap[cat].entregadas += 1;
            }
          }
          nivelCounter[cat] = (nivelCounter[cat] || 0) + 1;

          // Franja horaria
          if (r.status === "DELIVERED" && r.delivered_at) {
            const date = new Date(r.delivered_at);
            const hour = date.getHours();
            if (hour >= 8 && hour < 11) flujoPorHora[0].cantidad++;
            else if (hour >= 11 && hour < 14) flujoPorHora[1].cantidad++;
            else if (hour >= 14 && hour < 17) flujoPorHora[2].cantidad++;
            else flujoPorHora[3].cantidad++;
          }
        });
      } catch (dbErr) {
        console.warn("[REPORTS] Error consultando PostgreSQL, calculando desde memoria:", dbErr.message);
      }
    }

    // Si PostgreSQL no tiene datos o estamos en modo memoria
    if (totalAprobadas === 0 && memoryStore.students.size > 0) {
      const todayStr = new Date().toISOString().slice(0, 10);

      for (const student of memoryStore.students.values()) {
        const state = String(student.state || "APROBADA").toUpperCase();
        if (state !== "APROBADA") continue;

        totalAprobadas++;
        const cat = categorizeLevel(student.educationalLevel);
        if (stockMap[cat]) {
          stockMap[cat].inicial++;
        }
        nivelCounter[cat] = (nivelCounter[cat] || 0) + 1;

        const guardian = memoryStore.guardians.get(student.guardianRut);
        const sector = String((guardian && guardian.sector) || "CENTRO").trim().toUpperCase();
        sectorCounter[sector] = (sectorCounter[sector] || 0) + 1;

        const benefitId = `b-xl-${student.rut.replace(/[^0-9kK]/g, "")}`;
        const b = memoryStore.benefits.get(benefitId) ||
          Array.from(memoryStore.benefits.values()).find((item) => item.studentRut === student.rut);

        if (b && b.status === "DELIVERED") {
          entregadosConActa++;
          if (stockMap[cat]) stockMap[cat].entregadas++;
          if (b.deliveredAt && String(b.deliveredAt).startsWith(todayStr)) deliveriesToday++;

          if (b.deliveredAt) {
            const h = new Date(b.deliveredAt).getHours();
            if (h >= 8 && h < 11) flujoPorHora[0].cantidad++;
            else if (h >= 11 && h < 14) flujoPorHora[1].cantidad++;
            else if (h >= 14 && h < 17) flujoPorHora[2].cantidad++;
            else flujoPorHora[3].cantidad++;
          }
        }
      }

      distribucionSectores = Object.entries(sectorCounter).map(([sector, cantidad]) => ({
        sector,
        cantidad,
        deliveries: cantidad,
      }));
    }

    // Calcular saldos y porcentajes de stock
    const stockPorNivel = Object.values(stockMap).map((item) => {
      const saldo = Math.max(0, item.inicial - item.entregadas);
      const pct = item.inicial > 0 ? Math.round((item.entregadas / item.inicial) * 100) : 0;
      return { ...item, saldo, pct };
    });

    distribucionNivel = Object.entries(nivelCounter).map(([nivel, cantidad]) => ({
      nivel,
      cantidad,
    }));

    totalGuardians = memoryStore.guardians.size;
    totalStudents = memoryStore.students.size;
    totalBenefits = totalAprobadas;
    deliveredBenefits = entregadosConActa;
    pendingBenefits = Math.max(0, totalAprobadas - entregadosConActa);
    const percentage = totalAprobadas > 0 ? Number(((deliveredBenefits / totalAprobadas) * 100).toFixed(1)) : 0;

    deliveriesBySector = distribucionSectores;

    return res.json({
      message: "KPIs obtenidos correctamente.",
      totalRegistros: totalAprobadas,
      totalBeneficiariosAprobados: totalAprobadas,
      totalEntregados: deliveredBenefits,
      entregadosConActa,
      totalPendientes: pendingBenefits,
      pendientesDeRetiro: pendingBenefits,
      entregadosHoy: deliveriesToday,
      porcentaje: percentage,
      stockPorNivel,
      distribucionSectores,
      distribucionNivel,
      deliveriesBySector,
      flujoPorHora,
      porDia: [{ day: "Hoy", deliveries: deliveriesToday, total: deliveriesToday, fecha: new Date().toISOString().slice(0, 10) }],
      kpis: {
        totalGuardians,
        totalStudents,
        totalBenefits: totalAprobadas,
        pendingBenefits,
        deliveredBenefits,
        deliveriesToday,
        deliveryPercentage: percentage,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al calcular indicadores.", error: error.message });
  }
}

async function exportTransparencyCsv(req, res) {
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
    return res.status(500).json({ message: "Error al generar CSV de transparencia.", error: error.message });
  }
}

module.exports = {
  getKpis,
  exportTransparencyCsv,
};
