/**
 * Utilidades para manejo, formateo y validación de RUT chileno (Módulo 11)
 */

/**
 * Limpia el RUT dejando solo dígitos y K
 */
export function cleanRut(rut) {
  if (!rut) return '';
  return String(rut).replace(/[^0-9kK]/g, '').toUpperCase();
}

/**
 * Formatea un RUT en el estándar chileno XX.XXX.XXX-X
 * Acepta RUTs parciales mientras el usuario escribe.
 */
export function formatRut(rut) {
  const cleaned = cleanRut(rut);
  if (!cleaned) return '';

  if (cleaned.length === 1) return cleaned;

  const cuerpo = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);

  // Formatear cuerpo con puntos
  let formateado = '';
  let cont = 0;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    formateado = cuerpo[i] + formateado;
    cont++;
    if (cont === 3 && i > 0) {
      formateado = '.' + formateado;
      cont = 0;
    }
  }

  return `${formateado}-${dv}`;
}

/**
 * Calcula el Dígito Verificador esperado para un número de RUT según Módulo 11
 */
export function calculateDv(cuerpo) {
  let suma = 0;
  let multiplo = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * multiplo;
    multiplo = multiplo < 7 ? multiplo + 1 : 2;
  }

  const resto = suma % 11;
  const dvEsperado = 11 - resto;

  if (dvEsperado === 11) return '0';
  if (dvEsperado === 10) return 'K';
  return String(dvEsperado);
}

/**
 * Valida un RUT chileno completo
 * @returns {{ isValid: boolean, error?: string }}
 */
export function validateRut(rut) {
  const cleaned = cleanRut(rut);

  if (!cleaned) {
    return { isValid: false, error: 'Debe ingresar un RUT' };
  }

  if (cleaned.length < 7) {
    return { isValid: false, error: 'RUT incompleto' };
  }

  if (cleaned.length > 9) {
    return { isValid: false, error: 'RUT excede longitud válida' };
  }

  const cuerpo = cleaned.slice(0, -1);
  const dvIngresado = cleaned.slice(-1);

  if (!/^\d+$/.test(cuerpo)) {
    return { isValid: false, error: 'El cuerpo del RUT solo debe contener números' };
  }

  const dvEsperado = calculateDv(cuerpo);

  if (dvIngresado !== dvEsperado) {
    return {
      isValid: false,
      error: `Dígito verificador inválido (ingresó ${dvIngresado}, debería ser ${dvEsperado})`
    };
  }

  return { isValid: true };
}
