const rateLimit = require("express-rate-limit");

// Limitador estricto para el inicio de sesión (mitigar fuerza bruta)
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 15, // Máximo 15 intentos por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Demasiados intentos de inicio de sesión. Por favor espera 5 minutos antes de volver a intentar.",
  },
});

// Limitador general para endpoints de la API
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 180, // 180 solicitudes por minuto
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Límite de solicitudes superado. Por favor reduce la frecuencia de consultas.",
  },
});

module.exports = {
  loginLimiter,
  apiLimiter,
};
