const express = require("express");
const authController = require("../controllers/authControllers");

const router = express.Router();

// Login is public. Signup is intentionally not public and is mounted in userRoutes.
router.post("/login", authController.login);
router.post("/logout", authController.logout);

module.exports = router;
