const { pool, usePostgres, memoryStore } = require("../config/db");

async function recordAuditLog({
  userId = null,
  username = "anonimo",
  action,
  entityType = null,
  entityId = null,
  details = {},
  ipAddress = "127.0.0.1",
}) {
  const logEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    user_id: userId,
    username,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
    ip_address: ipAddress,
    created_at: new Date().toISOString(),
  };

  // Guardar en memoria
  memoryStore.auditLogs.unshift(logEntry);
  if (memoryStore.auditLogs.length > 500) {
    memoryStore.auditLogs.pop();
  }

  // Guardar en PostgreSQL si está disponible
  if (usePostgres) {
    try {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const validUserId = userId && uuidRegex.test(userId) ? userId : null;

      await pool.query(
        `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details, ip_address, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [
          validUserId,
          username,
          action,
          entityType,
          entityId,
          JSON.stringify(details),
          ipAddress,
        ]
      );
    } catch (err) {
      console.warn("[AUDITORÍA] Error guardando log en PostgreSQL:", err.message);
    }
  }

  return logEntry;
}

async function getAuditLogs({ limit = 100, action = null } = {}) {
  if (usePostgres) {
    try {
      let query = `
        SELECT id, user_id, username, action, entity_type, entity_id, details, ip_address, created_at
        FROM audit_logs
      `;
      const params = [];
      if (action) {
        query += " WHERE action = $1";
        params.push(action);
      }
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const res = await pool.query(query, params);
      return res.rows;
    } catch (err) {
      console.warn("[AUDITORÍA] Error consultando logs en PostgreSQL, usando memoria:", err.message);
    }
  }

  let logs = [...memoryStore.auditLogs];
  if (action) {
    logs = logs.filter((l) => l.action === action);
  }
  return logs.slice(0, limit);
}

module.exports = {
  recordAuditLog,
  getAuditLogs,
};
