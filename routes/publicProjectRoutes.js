const express = require("express");

const publicProjectController = require("../controllers/publicProjectController");

const router = express.Router();

router.get("/", publicProjectController.listProjects);
router.get("/:batch", publicProjectController.getProject);
router.get("/:batch/results", publicProjectController.getResults);

module.exports = router;
