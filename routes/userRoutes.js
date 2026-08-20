const express = require("express");

const authController = require("../controllers/authControllers");
const userController = require("../controllers/userController");

const router = express.Router();

// Every user-management route belongs exclusively to the Academic Head admin.
router.use(authController.protect, authController.restrictTo("ADMIN"));

router
  .route("/")
  .get(userController.getAllUsers)
  .post(userController.createManager);

router
  .route("/:id")
  .get(userController.getUser)
  .patch(userController.updateManager)
  .delete(userController.deleteManager);

router
  .route("/:id/password")
  .patch(userController.updateManagerPassword);

router
  .route("/:id/status")
  .patch(userController.updateManagerStatus);

module.exports = router;
