// Fijar huso horario oficial de Chile para todo el proceso de Node.js (Render / AWS / Docker / Local)
if (!process.env.TZ) {
  process.env.TZ = "America/Santiago";
}

require("dotenv").config();
const app = require("./src/app");
const env = require("./src/config/env");
const { initDatabase } = require("./src/config/db");

async function startServer() {
  await initDatabase();

  app.listen(env.PORT, () => {
    console.log("=======================================================");
    console.log("  ProyectoPMM - Municipalidad de Quilpué (v2.0 Modular)");
    console.log(`  Servidor activo en: http://localhost:${env.PORT}`);
    console.log(`  Huso horario fijado: ${process.env.TZ}`);
    console.log("  Módulos: Auth, Beneficiarios, Entregas, Auditoría, Importador");
    console.log("  Seguridad: Helmet activo, Rate Limiting activo, RUT Full");
    console.log("  Usuarios iniciales:");
    console.log("  - Administrador : admin   / Admin123!");
    console.log("  - Operador      : terreno / Terreno123!");
    console.log("=======================================================");
  });
}

startServer().catch((err) => {
  console.error("Error crítico al iniciar servidor:", err);
  process.exit(1);
});
