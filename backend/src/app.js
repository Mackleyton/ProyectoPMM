const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const { apiLimiter } = require("./middlewares/rateLimit");
const { usePostgres, memoryStore } = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const beneficiariesRoutes = require("./routes/beneficiariesRoutes");
const deliveriesRoutes = require("./routes/deliveriesRoutes");
const reportsRoutes = require("./routes/reportsRoutes");
const importRoutes = require("./routes/importRoutes");
const auditRoutes = require("./routes/auditRoutes");

const app = express();

// Hardening de seguridad con Helmet
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // Permitir que la PWA cargue recursos locales e iconos sin bloqueos
  })
);

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Carpeta de actas fotográficas
const uploadsRoot = path.join(__dirname, "..", "uploads", "actas");
if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}
app.use("/fotoss", express.static(uploadsRoot));
app.use(express.static(path.join(__dirname, "..", "public")));

// Endpoint de salud del sistema
app.get(["/api/health", "/apis/health"], (req, res) => {
  return res.json({
    ok: true,
    status: "online",
    database: usePostgres ? "PostgreSQL" : "LocalStore",
    records: memoryStore.benefits.size,
    timestamp: new Date().toISOString(),
  });
});

// Limitador de tasa general para endpoints API
app.use("/api", apiLimiter);

// Montaje de rutas modulares
app.use("/api/auth", authRoutes);
app.use("/api", beneficiariesRoutes);
app.use("/api", deliveriesRoutes);
app.use("/api", reportsRoutes);
app.use("/api", importRoutes);
app.use("/api", auditRoutes);

// Retrocompatibilidad con prefijo legado /apis
app.use("/apis/buscar", (req, res, next) => {
  req.url = `/guardians/${encodeURIComponent(req.query.rut || "")}`;
  return beneficiariesRoutes(req, res, next);
});
app.use("/apis/entregas", (req, res, next) => {
  req.url = "/deliveries/register";
  return deliveriesRoutes(req, res, next);
});
app.use("/apis/kpis", (req, res, next) => {
  req.url = "/reports/kpis";
  return reportsRoutes(req, res, next);
});
app.use("/apis/upload-excel", (req, res, next) => {
  req.url = "/imports/beneficiaries";
  return importRoutes(req, res, next);
});

// Manejo global de errores
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      message: "El archivo supera el límite de tamaño permitido.",
    });
  }
  console.error("[ERROR SERVER]", error);
  return res.status(500).json({
    message: error.message || "Ocurrió un error inesperado en el servidor.",
  });
});

module.exports = app;
