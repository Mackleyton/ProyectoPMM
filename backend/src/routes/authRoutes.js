const express = require("express");
const router = express.Router();
const { login, getProfile, createFieldUser } = require("../controllers/authController");
const { authenticateToken, requireRoles } = require("../middlewares/auth");
const { loginLimiter } = require("../middlewares/rateLimit");

router.post("/login", loginLimiter, login);
router.get("/me", authenticateToken, getProfile);
router.post("/create-field-user", authenticateToken, requireRoles("ADMIN"), createFieldUser); // <-- Agregar esta ruta

module.exports = router;