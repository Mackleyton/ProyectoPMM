require("dotenv").config();

const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

async function createUser(username, password, role) {
  const passwordHash = await bcrypt.hash(password, 10);

  await pool.query(
    `
      INSERT INTO users (
        username,
        password_hash,
        role
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (username)
      DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        active = TRUE
    `,
    [username, passwordHash, role]
  );
}

async function main() {
  await createUser("admin", "Admin123!", "ADMIN");
  await createUser("terreno", "Terreno123!", "FIELD_AGENT");

  console.log("Usuarios creados correctamente:");
  console.log("Administrador -> usuario: admin | contraseña: Admin123!");
  console.log("Terreno       -> usuario: terreno | contraseña: Terreno123!");

  await pool.end();
}

main().catch((error) => {
  console.error("No fue posible crear los usuarios:", error.message);
  process.exit(1);
});