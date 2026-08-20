const express = require("express");

const viewController = require("../controllers/viewController");
const votingController = require("../controllers/votingController");
const viewAuth = require("../middleware/viewAuthMiddleware");

const router = express.Router();

router.get("/login", viewController.loginPage);

router.use(viewAuth.requireLogin);
router.get("/", viewController.home);

router.get(
  "/admin",
  viewAuth.restrictTo("ADMIN"),
  viewController.adminDashboard,
);
router.get(
  "/admin/managers",
  viewAuth.restrictTo("ADMIN"),
  viewController.managers,
);
router.get(
  "/admin/managers/:id",
  viewAuth.restrictTo("ADMIN"),
  viewController.managerDetail,
);
router.get(
  "/admin/projects",
  viewAuth.restrictTo("ADMIN"),
  viewController.projects,
);
router.get(
  "/admin/projects/:id/qr-display",
  viewAuth.restrictTo("ADMIN"),
  votingController.renderQrDisplay,
);
router.get(
  "/admin/projects/:id",
  viewAuth.restrictTo("ADMIN"),
  viewController.projectDetail,
);
router.get(
  "/admin/groups",
  viewAuth.restrictTo("ADMIN"),
  viewController.groups,
);
router.get(
  "/admin/groups/:id",
  viewAuth.restrictTo("ADMIN"),
  viewController.groupDetail,
);

router.get(
  "/manager",
  viewAuth.restrictTo("MANAGER"),
  viewController.managerDashboard,
);
router.get(
  "/manager/projects",
  viewAuth.restrictTo("MANAGER"),
  viewController.projects,
);
router.get(
  "/manager/projects/:id/qr-display",
  viewAuth.restrictTo("MANAGER"),
  votingController.renderQrDisplay,
);
router.get(
  "/manager/projects/:id",
  viewAuth.restrictTo("MANAGER"),
  viewController.projectDetail,
);
router.get(
  "/manager/groups",
  viewAuth.restrictTo("MANAGER"),
  viewController.groups,
);
router.get(
  "/manager/groups/:id",
  viewAuth.restrictTo("MANAGER"),
  viewController.groupDetail,
);

module.exports = router;
