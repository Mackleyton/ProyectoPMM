const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET || "quilpue_dideco_jwt_secure_secret_2026_prod!";

if (!process.env.JWT_SECRET) {
  console.warn("[SEGURIDAD ADVERTENCIA] JWT_SECRET no está definido en las variables de entorno. Usando clave de respaldo para entorno de desarrollo local.");
}

module.exports = {
  PORT: Number(process.env.PORT || 3000),
  JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "10h",
  MAX_FILE_SIZE_MB: Number(process.env.MAX_FILE_SIZE_MB || 10),
  RUT_VALIDATION_MODE: process.env.RUT_VALIDATION_MODE || "FULL", // Módulo 11 estricto requerido
  DATABASE_URL: process.env.DATABASE_URL || null,
  DB_HOST: process.env.DB_HOST || "localhost",
  DB_PORT: Number(process.env.DB_PORT || 5432),
  DB_NAME: process.env.DB_NAME || "beneficios_db",
  DB_USER: process.env.DB_USER || "postgres",
  DB_PASSWORD: process.env.DB_PASSWORD || "postgres",
  DB_SSL: process.env.DB_SSL === "true",
};
