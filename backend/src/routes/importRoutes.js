const express = require("express");
const multer = require("multer");
const router = express.Router();
const env = require("../config/env");
const { importExcel, resetDatabase } = require("../controllers/importController");
const { authenticateToken, requireRoles } = require("../middlewares/auth");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 },
});

router.post("/imports/beneficiaries", authenticateToken, requireRoles("ADMIN"), upload.single("excel"), importExcel);
router.post("/admin/reset-database", authenticateToken, requireRoles("ADMIN"), resetDatabase);

module.exports = router;
