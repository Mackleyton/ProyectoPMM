const express = require("express");
const router = express.Router();
const { getBeneficiaryByRut, listBeneficiaries } = require("../controllers/beneficiariesController");
const { authenticateToken } = require("../middlewares/auth");

router.get("/guardians/:rut", authenticateToken, getBeneficiaryByRut);
router.get("/beneficiaries", authenticateToken, listBeneficiaries);

module.exports = router;
