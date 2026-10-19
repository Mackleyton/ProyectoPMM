const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { pool, usePostgres, memoryStore } = require("../config/db");
const { recordAuditLog } = require("../services/auditService");

function cleanText(value) {
  return String(value || "").trim();
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name || (user.role === "ADMIN" ? "Administrador Social" : "Operador Terreno"),
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

async function login(req, res) {
  const ipAddress = req.ip || req.connection.remoteAddress || "127.0.0.1";
  try {
    const rawUsername = cleanText(req.body.username || req.body.email);
    const password = String(req.body.password || "");

    if (!rawUsername || !password) {
      return res.status(400).json({ message: "Debes ingresar usuario y contraseña." });
    }

    let username = rawUsername.toLowerCase();
    if (username.includes("admin")) username = "admin";
    else if (username.includes("terreno")) username = "terreno";

    let user = null;

    if (usePostgres) {
      try {
        const dbRes = await pool.query(
          "SELECT id, username, password_hash, role FROM users WHERE username = $1 AND active = TRUE",
          [username]
        );
        if (dbRes.rowCount > 0) user = dbRes.rows[0];
      } catch (err) {
        console.warn("[AUTH] Error consultando PostgreSQL:", err.message);
      }
    }

    if (!user) {
      user = memoryStore.users.find((u) => u.username === username && u.active);
    }

    if (!user) {
      await recordAuditLog({
        username: rawUsername,
        action: "AUTH_LOGIN_FAILED",
        details: { reason: "Usuario no encontrado" },
        ipAddress,
      });
      return res.status(401).json({ message: "Usuario o contraseña incorrectos." });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      await recordAuditLog({
        userId: user.id,
        username: user.username,
        action: "AUTH_LOGIN_FAILED",
        details: { reason: "Contraseña inválida" },
        ipAddress,
      });
      return res.status(401).json({ message: "Usuario o contraseña incorrectos." });
    }

    const token = createToken(user);
    const displayName = user.role === "ADMIN" ? "Administrador Social" : "Operador Terreno";

    await recordAuditLog({
      userId: user.id,
      username: user.username,
      action: "AUTH_LOGIN_SUCCESS",
      details: { role: user.role },
      ipAddress,
    });

    return res.json({
      message: `Inicio de sesión exitoso. Bienvenido/a, ${displayName}.`,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: displayName,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al procesar inicio de sesión.", error: error.message });
  }
}

async function getProfile(req, res) {
  return res.json({ user: req.user });
}

module.exports = {
  login,
  getProfile,
};
