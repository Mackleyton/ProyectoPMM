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

async function createFieldUser(req, res) {
  const ipAddress = req.ip || req.connection.remoteAddress || "127.0.0.1";
  try {
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !email || !password) {
      return res.status(400).json({ message: "Nombre, correo y contraseña son obligatorios." });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const fullName = `${firstName.trim()} ${(lastName || "").trim()}`.trim();
    // El username será el correo o el prefijo antes del @
    const username = cleanEmail;
    const passwordHash = await bcrypt.hash(password, 10);

    // 1. Si usa PostgreSQL
    if (usePostgres) {
      try {
        const checkRes = await pool.query("SELECT id FROM users WHERE username = $1 LIMIT 1", [username]);
        if (checkRes.rowCount > 0) {
          return res.status(400).json({ message: "Ya existe un usuario registrado con ese correo." });
        }

        await pool.query(
          `INSERT INTO users (username, password_hash, role, active)
           VALUES ($1, $2, 'FIELD_AGENT', TRUE)`,
          [username, passwordHash]
        );
      } catch (dbErr) {
        console.warn("[AUTH] Error creando usuario en PostgreSQL:", dbErr.message);
      }
    }

    // 2. Si usa memoria
    const existsInMem = memoryStore.users.some((u) => u.username.toLowerCase() === username);
    if (existsInMem) {
      return res.status(400).json({ message: "Ya existe un usuario registrado con ese correo." });
    }

    const newUser = {
      id: `u-terreno-${Date.now()}`,
      username,
      password_hash: passwordHash,
      role: "FIELD_AGENT",
      name: fullName,
      email: cleanEmail,
      active: true,
    };
    memoryStore.users.push(newUser);

    await recordAuditLog({
      userId: req.user?.id,
      username: req.user?.username || "admin",
      action: "USER_CREATE_FIELD_AGENT",
      details: { createdUsername: username, fullName },
      ipAddress,
    });

    return res.status(201).json({
      message: `Usuario de terreno creado exitosamente para ${fullName}.`,
      user: {
        id: newUser.id,
        username,
        name: fullName,
        role: "FIELD_AGENT",
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al crear usuario de terreno.", error: error.message });
  }
}

module.exports = {
  login,
  getProfile,
  createFieldUser,
};
