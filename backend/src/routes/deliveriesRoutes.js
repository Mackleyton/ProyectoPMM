const express = require("express");
const multer = require("multer");
const router = express.Router();
const env = require("../config/env");
const { registerDelivery, getEvidenceFile } = require("../controllers/deliveriesController");
const { authenticateToken } = require("../middlewares/auth");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 },
});

router.post("/deliveries/register", authenticateToken, upload.single("acta"), registerDelivery);
router.get("/evidences/:id/file", getEvidenceFile);

module.exports = router;
