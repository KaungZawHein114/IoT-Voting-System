const express = require("express");

const publicShowController = require("../controllers/publicShowController");

const router = express.Router();

router.get("/admit", publicShowController.renderAdmissionPage);
router.get("/", publicShowController.renderVotingPage);

module.exports = router;
