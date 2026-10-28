const express = require("express");
const router = express.Router();
const { getKpis, exportTransparencyCsv, exportTransparencyExcel } = require("../controllers/reportsController");
const { authenticateToken, requireRoles } = require("../middlewares/auth");

router.get("/reports/kpis", authenticateToken, getKpis);
router.get("/reports/transparency.csv", authenticateToken, requireRoles("ADMIN"), exportTransparencyCsv);
router.get("/reports/transparency.xlsx", authenticateToken, requireRoles("ADMIN"), exportTransparencyExcel);

module.exports = router;
