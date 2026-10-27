const express = require("express");
const router = express.Router();
const { login, getProfile, getUsers, createUser, createFieldUser, deleteUser } = require("../controllers/authController");
const { authenticateToken, requireRoles } = require("../middlewares/auth");
const { loginLimiter } = require("../middlewares/rateLimit");

router.post("/login", loginLimiter, login);
router.get("/me", authenticateToken, getProfile);

// Gestión completa de usuarios (Solo Administradores)
router.get("/users", authenticateToken, requireRoles("ADMIN"), getUsers);
router.post("/users", authenticateToken, requireRoles("ADMIN"), createUser);
router.delete("/users/:id", authenticateToken, requireRoles("ADMIN"), deleteUser);

// Retrocompatibilidad para endpoint anterior
router.post("/create-field-user", authenticateToken, requireRoles("ADMIN"), createFieldUser);

module.exports = router;