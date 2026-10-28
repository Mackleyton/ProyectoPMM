const xlsx = require("xlsx");
const { pool, usePostgres, memoryStore } = require("../config/db");

// Clasificación canónica de los 5 niveles oficiales
function categorizeLevel(lvl) {
  const s = String(lvl || "").toLowerCase();
  if (s.includes("pre") || s.includes("kinder") || s.includes("kínder")) {
    return "PRE BÁSICA";
  }
  if (s.includes("superior") || s.includes("universitaria") || s.includes("instituto") || s.includes("cft")) {
    return "SUPERIOR";
  }
  if (s.includes("media") || s.includes("secundaria")) {
    return "MEDIA";
  }
  if (s.includes("segundo") || s.includes("5") || s.includes("6") || s.includes("7") || s.includes("8")) {
    return "BÁSICA SEGUNDO CICLO (5° A 8° BÁSICO)";
  }
  return "BÁSICA PRIMER CICLO (1° A 4° BÁSICO)";
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
      { rango: "17:00+", cantidad: 0 },
    ];

    // 1. STOCK DE CONTROL LOGÍSTICO MUNICIPAL (METAS FIJAS DE LICITACIÓN)
    const stockMap = {
      "PRE BÁSICA": { nivel: "PRE BÁSICA", licitacion: 800, inicial: 490, entregadas: 0, saldo: 490, pct: 0 },
      "BÁSICA PRIMER CICLO (1° A 4° BÁSICO)": { nivel: "BÁSICA PRIMER CICLO (1° A 4° BÁSICO)", licitacion: 1700, inicial: 1443, entregadas: 0, saldo: 1443, pct: 0 },
      "BÁSICA SEGUNDO CICLO (5° A 8° BÁSICO)": { nivel: "BÁSICA SEGUNDO CICLO (5° A 8° BÁSICO)", licitacion: 1700, inicial: 1569, entregadas: 0, saldo: 1569, pct: 0 },
      "MEDIA": { nivel: "MEDIA", licitacion: 1500, inicial: 1124, entregadas: 0, saldo: 1124, pct: 0 },
      "SUPERIOR": { nivel: "SUPERIOR", licitacion: 700, inicial: 419, entregadas: 0, saldo: 419, pct: 0 },
    };

    // 2. CONTADORES REALES DEL PADRÓN EXCEL
    const pendientesPorNivelExcel = {
      "PRE BÁSICA": 0,
      "BÁSICA PRIMER CICLO (1° A 4° BÁSICO)": 0,
      "BÁSICA SEGUNDO CICLO (5° A 8° BÁSICO)": 0,
      "MEDIA": 0,
      "SUPERIOR": 0,
    };

    const sectorCounter = {};
    let totalExcelAprobados = 0;
    let entregadosExcelConActa = 0;
    const todayStr = new Date().toISOString().slice(0, 10);

    // CONSULTA POSTGRESQL O MEMORIA
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
            // PENDIENTE DE RETIRO EN EL EXCEL
            if (pendientesPorNivelExcel[cat] !== undefined) {
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

    // SI POSTGRESQL NO RETORNÓ DATOS O ESTAMOS EN MEMORIA
    if (totalExcelAprobados === 0 && memoryStore.students.size > 0) {
      for (const student of memoryStore.students.values()) {
        const studentState = student.state || student.applicationStatus || "APROBADA";
        if (!isApproved(studentState)) continue;

        totalExcelAprobados++;
        const cat = categorizeLevel(student.educationalLevel);

        const guardian = memoryStore.guardians.get(student.guardianRut);
        const sector = String((guardian && guardian.sector) || "CENTRO").trim().toUpperCase();
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
          // PENDIENTE DE RETIRO REAL DEL EXCEL
          if (pendientesPorNivelExcel[cat] !== undefined) {
            pendientesPorNivelExcel[cat]++;
          }
        }
      }
    }

    distribucionSectores = Object.entries(sectorCounter).map(([sector, cantidad]) => ({
      sector,
      cantidad,
      deliveries: cantidad,
    }));
    deliveriesBySector = distribucionSectores;

    // Tabla de stock logístico municipal (metas de 5.045)
    const stockPorNivel = Object.values(stockMap).map((item) => {
      const saldo = Math.max(0, item.inicial - item.entregadas);
      const pct = item.inicial > 0 ? Math.round((item.entregadas / item.inicial) * 100) : 0;
      return { ...item, saldo, pct };
    });

    // PENDIENTES REALES DEL EXCEL
    const pendientesExcel = Math.max(0, totalExcelAprobados - entregadosExcelConActa);
    const porcentajeExcel = totalExcelAprobados > 0 ? Number(((entregadosExcelConActa / totalExcelAprobados) * 100).toFixed(1)) : 0;

    // DISTRIBUCIÓN POR NIVEL: Muestra exactamente los PENDIENTES DEL EXCEL
    const distribucionNivel = Object.entries(pendientesPorNivelExcel).map(([nivel, cantidad]) => ({
      nivel,
      cantidad, // <-- PENDIENTES REALES DEL EXCEL
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
      porDia: [{ day: "Hoy", deliveries: deliveriesToday, total: deliveriesToday, fecha: todayStr }],
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al calcular indicadores.", error: error.message });
  }
}

async function getDeliveredCountsByLevel() {
  const counts = {
    "PRE BÁSICA": { nivel: "PRE BÁSICA", tipoSet: "Set Escolar - Pre-Básica", cantidadEntregada: 0 },
    "BÁSICA PRIMER CICLO (1° A 4° BÁSICO)": { nivel: "BÁSICA PRIMER CICLO (1° A 4° BÁSICO)", tipoSet: "Set Escolar - Básica 1er Ciclo", cantidadEntregada: 0 },
    "BÁSICA SEGUNDO CICLO (5° A 8° BÁSICO)": { nivel: "BÁSICA SEGUNDO CICLO (5° A 8° BÁSICO)", tipoSet: "Set Escolar - Básica 2do Ciclo", cantidadEntregada: 0 },
    "MEDIA": { nivel: "MEDIA", tipoSet: "Set Escolar - Enseñanza Media", cantidadEntregada: 0 },
    "SUPERIOR": { nivel: "SUPERIOR", tipoSet: "Set Escolar - Educación Superior", cantidadEntregada: 0 },
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
      [`Fecha de emisión: ${new Date().toLocaleDateString("es-CL")} ${new Date().toLocaleTimeString("es-CL")}`],
      [],
      ["NIVEL EDUCACIONAL", "TIPO DE SET", "CANTIDAD ENTREGADA"],
    ];

    rows.forEach((item) => {
      worksheetData.push([item.nivel, item.tipoSet, item.cantidadEntregada]);
    });

    worksheetData.push(["TOTAL GENERAL", "", totalEntregadas]);

    const worksheet = xlsx.utils.aoa_to_sheet(worksheetData);

    worksheet["!cols"] = [
      { wch: 42 },
      { wch: 40 },
      { wch: 22 },
    ];

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Cantidades Entregadas");

    const excelBuffer = xlsx.write(workbook, { bookType: "xlsx", type: "buffer" });
    const filename = `Reporte_Transparencia_Entregas_${new Date().toISOString().slice(0, 10)}.xlsx`;

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

module.exports = {
  getKpis,
  exportTransparencyCsv,
  exportTransparencyExcel,
};
