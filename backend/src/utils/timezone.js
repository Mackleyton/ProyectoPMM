/**
 * Utilidades para manejo estricto de fecha y hora oficial de Chile (America/Santiago)
 * Previene desfases horarios al desplegar en servidores en la nube (Render, AWS, Heroku, etc.)
 */

const CHILE_TZ = "America/Santiago";

/**
 * Retorna la fecha actual en Chile en formato YYYY-MM-DD
 */
function getChileDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHILE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Retorna la hora (0-23) correspondiente a Chile
 */
function getChileHour(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return 0;
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: CHILE_TZ,
    hour: "numeric",
    hour12: false,
  }).format(d);
  const hourNum = parseInt(hourStr, 10);
  return hourNum === 24 ? 0 : hourNum;
}

/**
 * Retorna fecha y hora en formato legible chileno (DD-MM-YYYY HH:mm:ss)
 */
function getChileDateTimeString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("es-CL", { timeZone: CHILE_TZ });
}

module.exports = {
  CHILE_TZ,
  getChileDateString,
  getChileHour,
  getChileDateTimeString,
};
