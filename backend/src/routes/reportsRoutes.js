const express = require("express");
const router = express.Router();
const { getKpis, exportTransparencyCsv } = require("../controllers/reportsController");
const { authenticateToken, requireRoles } = require("../middlewares/auth");

router.get("/reports/kpis", authenticateToken, getKpis);
router.get("/reports/transparency.csv", authenticateToken, requireRoles("ADMIN"), exportTransparencyCsv);

module.exports = router;
