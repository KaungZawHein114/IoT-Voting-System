const express = require("express");

const votingController = require("../controllers/votingController");

const router = express.Router();

router.get("/:batch/admit", votingController.renderAdmissionPage);
router.get("/:batch", votingController.renderVotingPage);

module.exports = router;
