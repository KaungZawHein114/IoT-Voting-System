const express = require("express");
const { rateLimit } = require("express-rate-limit");

const publicShowController = require("../controllers/publicShowController");

const router = express.Router();

const admissionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    status: "fail",
    message: "Too many admission attempts. Please wait a moment and try again.",
  },
});

const voteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    status: "fail",
    message: "Too many voting requests. Please wait a moment and try again.",
  },
});

router.post("/admit", admissionLimiter, publicShowController.claimAdmission);
router.post("/votes", voteLimiter, publicShowController.submitVote);

module.exports = router;
