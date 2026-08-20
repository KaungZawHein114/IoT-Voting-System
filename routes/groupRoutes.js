const express = require("express");

const authController = require("../controllers/authControllers");
const groupController = require("../controllers/groupController");
const uploadController = require("../middleware/uploadMiddleware");

const router = express.Router();

router.use(
  authController.protect,
  authController.restrictTo("ADMIN", "MANAGER"),
);

router
  .route("/")
  .get(groupController.getAllGroups)
  .post(
    uploadController.uploadGroupImages,
    uploadController.cleanupFailedUploads,
    groupController.createGroup,
  );

router
  .route("/:id")
  .get(groupController.getGroup)
  .patch(
    uploadController.uploadGroupImages,
    uploadController.cleanupFailedUploads,
    groupController.updateGroup,
  )
  .delete(groupController.deleteGroup);

module.exports = router;
