const xlsx = require("xlsx");
const { cleanRut, formatRut } = require("./rut");

function cleanText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

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

/**
 * Normaliza nombres de encabezado para ignorar BOM, espacios, guiones y mayúsculas
 */
function normalizeHeaderName(key) {
  return String(key || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Extrae un valor buscando coincidencias semánticas en el objeto de fila
 */
function getRowValue(rowMap, ...potentialKeys) {
  for (const k of potentialKeys) {
    const norm = normalizeHeaderName(k);
    if (rowMap[norm] !== undefined && rowMap[norm] !== null && String(rowMap[norm]).trim() !== "") {
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

  // Buscar la primera hoja con contenido
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

  // Convertir a matriz 2D para detectar dinámicamente la fila de cabecera
  const matrix = xlsx.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
  let headerRowIdx = -1;
  const maxScan = Math.min(25, matrix.length);

  for (let i = 0; i < maxScan; i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) continue;
    const rowStr = row.map((cell) => normalizeHeaderName(cell)).join(" ");
    if (
      (rowStr.includes("rut") || rowStr.includes("run")) &&
      (rowStr.includes("apoderado") || rowStr.includes("alumno") || rowStr.includes("estudiante") || rowStr.includes("nombre"))
    ) {
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
        const val = rowArr[colIdx] !== undefined ? rowArr[colIdx] : "";
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
      "rutapoderado", "rut_apoderado", "rut apoderado", "runapoderado", "run_apoderado", "apoderadorut"
    );
    const rawAlumno = getRowValue(
      rowMap,
      "rutalumno", "rut_alumno", "rut alumno", "runalumno", "run_alumno", "rutestudiante", "rut_estudiante", "alumnorut"
    );

    if (!rawApoderado || !rawAlumno) {
      errors.push({ fila: idx + 2, error: "Faltan RUT de apoderado o RUT de alumno" });
      return;
    }

    const gRutClean = cleanRut(rawApoderado);
    const sRutClean = cleanRut(rawAlumno);

    if (gRutClean.length < 8 || sRutClean.length < 8) {
      errors.push({ fila: idx + 2, error: `RUT con longitud inválida (Apoderado: ${rawApoderado}, Alumno: ${rawAlumno})` });
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
    const gAddress = cleanText(getRowValue(rowMap, "direccion", "direccionapoderado") || "Quilpué");
    const gSector = cleanText(getRowValue(rowMap, "sector") || "CENTRO").toUpperCase();
    const gEmail = cleanText(getRowValue(rowMap, "correoapoderado", "correo_apoderado", "email") || "");
    const gPhone = cleanText(getRowValue(rowMap, "telefonoapoderado", "telefono_apoderado", "telefono") || "");

    const sEstablishment = cleanText(getRowValue(rowMap, "establecimiento", "colegio") || "Establecimiento Quilpué");
    const sLevel = cleanText(getRowValue(rowMap, "niveleducacional", "nivel_educacional", "nivel") || "Básica");
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

    // Tipo de beneficio canónico según nivel educacional
    let benefitName = "Set Escolar 2026 - BÁSICA";
    const lvlLower = sLevel.toLowerCase();
    if (lvlLower.includes("pre") || lvlLower.includes("kinder") || lvlLower.includes("kínder")) {
      benefitName = "Set Escolar 2026 - PRE-BÁSICA (KÍNDER)";
    } else if (lvlLower.includes("media") || lvlLower.includes("secundaria")) {
      benefitName = "Set Escolar 2026 - MEDIA";
    } else if (lvlLower.includes("segundo") || lvlLower.includes("5") || lvlLower.includes("8")) {
      benefitName = "Set Escolar 2026 - BÁSICA SEGUNDO CICLO (5° A 8° BÁSICO)";
    } else {
      benefitName = "Set Escolar 2026 - BÁSICA PRIMER CICLO (1° A 4° BÁSICO)";
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

  return { results, errors, totalRows: rawRows.length };
}

module.exports = {
  parseExcelBeneficiaries,
  parseExcelDate,
  parseExcelTime,
  normalizeHeaderName,
  getRowValue,
};
