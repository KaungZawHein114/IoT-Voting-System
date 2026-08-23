const express = require("express");

const authController = require("../controllers/authControllers");
const publicShowController = require("../controllers/publicShowController");

const router = express.Router();

router.use(authController.protect, authController.restrictTo("ADMIN"));

router.get("/control", publicShowController.getControl);
router.post("/verify-admin", publicShowController.verifyAdmin);
router.post("/open", publicShowController.openVoting);
router.post("/close", publicShowController.closeVoting);
router.post("/qr-token", publicShowController.createQrToken);
router.get(
  "/qr-token/:publicId/status",
  publicShowController.getQrTokenStatus,
);
router.get("/results", publicShowController.getResultsSummary);
router.post("/reset-votes", publicShowController.resetVotes);
router.get("/groups", publicShowController.listGroups);
router.patch("/groups/:id", publicShowController.updateGroup);
router.post("/groups/sync", publicShowController.syncGroups);

module.exports = router;
