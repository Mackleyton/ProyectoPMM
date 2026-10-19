const jwt = require("jsonwebtoken");
const env = require("../config/env");

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "No autorizado: Token de sesión requerido." });
  }

  jwt.verify(token, env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Sesión expirada o token inválido." });
    }
    req.user = user;
    next();
  });
}

function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Acceso denegado: Tu perfil no tiene permisos suficientes para realizar esta acción.",
      });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  requireRoles,
};
