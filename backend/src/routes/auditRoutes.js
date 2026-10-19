const express = require("express");
const router = express.Router();
const { listAuditLogs } = require("../controllers/auditController");
const { authenticateToken, requireRoles } = require("../middlewares/auth");

router.get("/admin/audit-logs", authenticateToken, requireRoles("ADMIN"), listAuditLogs);

module.exports = router;
