const express = require("express");

const authController = require("../controllers/authControllers");
const projectController = require("../controllers/projectController");
const votingController = require("../controllers/votingController");

const router = express.Router();

router.use(authController.protect);

router.get(
  "/:id/voting-control",
  authController.restrictTo("ADMIN", "MANAGER"),
  votingController.getVotingControl,
);
router.post(
  "/:id/publish",
  authController.restrictTo("ADMIN", "MANAGER"),
  votingController.publishProjectShow,
);
router.post(
  "/:id/unpublish",
  authController.restrictTo("ADMIN", "MANAGER"),
  votingController.unpublishProjectShow,
);
router.patch(
  "/:id/voting-mode",
  authController.restrictTo("ADMIN", "MANAGER"),
  votingController.updateVotingMode,
);
router.post(
  "/:id/qr-token",
  authController.restrictTo("ADMIN", "MANAGER"),
  votingController.createQrToken,
);
router.get(
  "/:id/qr-token/:publicId/status",
  authController.restrictTo("ADMIN", "MANAGER"),
  votingController.getQrTokenStatus,
);

router
  .route("/")
  .get(
    authController.restrictTo("ADMIN", "MANAGER"),
    projectController.getAllProjects,
  )
  .post(authController.restrictTo("ADMIN"), projectController.createProject);

router
  .route("/:id")
  .get(
    authController.restrictTo("ADMIN", "MANAGER"),
    projectController.getProject,
  )
  .patch(
    authController.restrictTo("ADMIN", "MANAGER"),
    projectController.updateProject,
  )
  .delete(authController.restrictTo("ADMIN"), projectController.deleteProject);

module.exports = router;
