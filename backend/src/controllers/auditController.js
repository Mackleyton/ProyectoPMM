const { getAuditLogs } = require("../services/auditService");

async function listAuditLogs(req, res) {
  try {
    const limit = Number(req.query.limit || 100);
    const action = req.query.action || null;
    const logs = await getAuditLogs({ limit, action });
    return res.json({
      ok: true,
      count: logs.length,
      logs,
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al consultar bitácora de auditoría.", error: error.message });
  }
}

module.exports = {
  listAuditLogs,
};
