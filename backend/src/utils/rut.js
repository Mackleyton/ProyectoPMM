const { RUT_VALIDATION_MODE } = require("../config/env");

function cleanRut(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^0-9K]/g, "");
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
      message: "El RUT debe contener entre 7 u 8 dígitos más el dígito verificador.",
    };
  }

  const cuerpo = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);

  if (!/^\d+$/.test(cuerpo)) {
    return { valid: false, message: "El cuerpo del RUT debe ser numérico." };
  }

  if (mode === "FULL") {
    const expectedDv = calculateDv(cuerpo);
    if (dv !== expectedDv) {
      return {
        valid: false,
        message: `Dígito verificador inválido para el RUT ingresado (se esperaba '${expectedDv}').`,
      };
    }
  }

  return { valid: true, rut: formatRut(cleaned), clean: cleaned };
}

module.exports = {
  cleanRut,
  formatRut,
  calculateDv,
  validateRut,
};
