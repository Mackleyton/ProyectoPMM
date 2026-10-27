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

async function getUsers(req, res) {
  try {
    let usersList = [];
    if (usePostgres) {
      try {
        const dbRes = await pool.query(
          "SELECT id, username, role, active, created_at FROM users ORDER BY created_at ASC"
        );
        usersList = dbRes.rows.map((u) => ({
          id: u.id,
          username: u.username,
          name: u.username === "admin" ? "Administrador Social" : (u.username === "terreno" ? "Operador Terreno" : u.username),
          role: u.role,
          active: u.active,
          createdAt: u.created_at,
        }));
      } catch (err) {
        console.warn("[AUTH] Error consultando usuarios en PostgreSQL:", err.message);
      }
    }

    if (usersList.length === 0) {
      usersList = memoryStore.users.map((u) => ({
        id: u.id,
        username: u.username,
        name: u.name || u.username,
        role: u.role,
        active: u.active,
        createdAt: u.created_at || new Date().toISOString(),
      }));
    }

    return res.json({ users: usersList });
  } catch (error) {
    return res.status(500).json({ message: "Error al listar usuarios.", error: error.message });
  }
}

async function createUser(req, res) {
  const ipAddress = req.ip || req.connection.remoteAddress || "127.0.0.1";
  try {
    const { firstName, lastName, email, password, role } = req.body;

    if (!firstName || !email || !password) {
      return res.status(400).json({ message: "Nombre, correo y contraseña son obligatorios." });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres." });
    }

    const assignedRole = (role === "ADMIN" || role === "FIELD_AGENT") ? role : "FIELD_AGENT";
    const cleanEmail = String(email).trim().toLowerCase();
    const fullName = `${firstName.trim()} ${(lastName || "").trim()}`.trim();
    const username = cleanEmail;
    const passwordHash = await bcrypt.hash(password, 10);
    let createdId = null;

    // 1. Si usa PostgreSQL
    if (usePostgres) {
      try {
        const checkRes = await pool.query("SELECT id FROM users WHERE username = $1 LIMIT 1", [username]);
        if (checkRes.rowCount > 0) {
          return res.status(400).json({ message: "Ya existe un usuario registrado con ese correo o nombre de usuario." });
        }

        const insRes = await pool.query(
          `INSERT INTO users (username, password_hash, role, active)
           VALUES ($1, $2, $3, TRUE) RETURNING id`,
          [username, passwordHash, assignedRole]
        );
        createdId = insRes.rows[0]?.id;
      } catch (dbErr) {
        console.warn("[AUTH] Error creando usuario en PostgreSQL:", dbErr.message);
      }
    }

    // 2. Si usa memoria
    const existsInMem = memoryStore.users.some((u) => u.username.toLowerCase() === username);
    if (existsInMem && !createdId) {
      return res.status(400).json({ message: "Ya existe un usuario registrado con ese correo o nombre de usuario." });
    }

    const newUser = {
      id: createdId || `u-${assignedRole.toLowerCase()}-${Date.now()}`,
      username,
      password_hash: passwordHash,
      role: assignedRole,
      name: fullName,
      email: cleanEmail,
      active: true,
      created_at: new Date().toISOString(),
    };
    if (!existsInMem) {
      memoryStore.users.push(newUser);
    }

    await recordAuditLog({
      userId: req.user?.id,
      username: req.user?.username || "admin",
      action: assignedRole === "ADMIN" ? "USER_CREATE_ADMIN" : "USER_CREATE_FIELD_AGENT",
      details: { createdUsername: username, fullName, role: assignedRole },
      ipAddress,
    });

    return res.status(201).json({
      message: `Usuario ${assignedRole === "ADMIN" ? "Administrador" : "de Terreno"} creado exitosamente para ${fullName}.`,
      user: {
        id: newUser.id,
        username,
        name: fullName,
        role: assignedRole,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al crear usuario.", error: error.message });
  }
}

async function createFieldUser(req, res) {
  req.body.role = "FIELD_AGENT";
  return createUser(req, res);
}

async function deleteUser(req, res) {
  const ipAddress = req.ip || req.connection.remoteAddress || "127.0.0.1";
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "ID de usuario requerido." });
    }

    // No permitir eliminarse a uno mismo
    if (req.user?.id && String(req.user.id) === String(id)) {
      return res.status(400).json({ message: "No puedes eliminar tu propia cuenta en sesión activa." });
    }

    let deletedUsername = "";

    // 1. Eliminar en PostgreSQL
    if (usePostgres) {
      try {
        const checkRes = await pool.query("SELECT id, username, role FROM users WHERE id::text = $1 OR username = $1", [id]);
        if (checkRes.rowCount > 0) {
          const userToDelete = checkRes.rows[0];
          deletedUsername = userToDelete.username;

          // Protección del admin base
          if (userToDelete.username === "admin") {
            return res.status(400).json({ message: "El usuario administrador principal ('admin') no puede ser eliminado." });
          }

          // Si es ADMIN, verificar que no sea el único
          if (userToDelete.role === "ADMIN") {
            const adminCount = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'ADMIN' AND active = TRUE");
            if (parseInt(adminCount.rows[0].count, 10) <= 1) {
              return res.status(400).json({ message: "No puedes eliminar al único administrador del sistema." });
            }
          }

          await pool.query("DELETE FROM users WHERE id = $1", [userToDelete.id]);
        }
      } catch (dbErr) {
        console.warn("[AUTH] Error eliminando usuario en PostgreSQL:", dbErr.message);
      }
    }

    // 2. Eliminar en memoria
    const memIdx = memoryStore.users.findIndex((u) => u.id === id || u.username === id);
    if (memIdx !== -1) {
      const u = memoryStore.users[memIdx];
      if (u.username === "admin") {
        return res.status(400).json({ message: "El usuario administrador principal ('admin') no puede ser eliminado." });
      }
      deletedUsername = deletedUsername || u.username;
      memoryStore.users.splice(memIdx, 1);
    }

    await recordAuditLog({
      userId: req.user?.id,
      username: req.user?.username || "admin",
      action: "USER_DELETE",
      details: { deletedUserId: id, deletedUsername },
      ipAddress,
    });

    return res.json({
      message: `Usuario ${deletedUsername || id} eliminado correctamente.`,
      deletedId: id,
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al eliminar usuario.", error: error.message });
  }
}

module.exports = {
  login,
  getProfile,
  getUsers,
  createUser,
  createFieldUser,
  deleteUser,
};
