const Group = require("../models/groupModel");
const Project = require("../models/projectModel");
const User = require("../models/userModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const {
  VOTING_STATES,
  getVotingReadiness,
  getVotingStats,
  resolveVotingState,
} = require("../services/votingService");

const OPEN_PROJECT_STATUSES = ["DRAFT", "ACTIVE"];

const managerProjectCounts = async () => {
  const counts = await Project.aggregate([
    {
      $group: {
        _id: "$projectManager",
        currentProjectCount: {
          $sum: {
            $cond: [{ $in: ["$status", OPEN_PROJECT_STATUSES] }, 1, 0],
          },
        },
        completedProjectCount: {
          $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] },
        },
      },
    },
  ]);

  return new Map(counts.map((item) => [item._id.toString(), item]));
};

const projectAccessAllowed = (project, user) =>
  user.role === "ADMIN" ||
  project.projectManager?._id?.toString() === user._id.toString() ||
  project.projectManager?.toString() === user._id.toString();

const renderForbidden = (res, user, path) =>
  res.status(403).render("errors/403", {
    pageTitle: "Access denied",
    currentUser: user,
    currentPath: path,
  });

exports.loginPage = (req, res) => {
  res.status(200).render("auth/login", {
    pageTitle: "Sign in",
    sessionExpired: req.query.session === "expired",
  });
};

exports.home = (req, res) => {
  res.redirect(req.user.role === "ADMIN" ? "/admin" : "/manager");
};

exports.adminDashboard = catchAsync(async (req, res) => {
  const [managerCount, projectCounts, groupCount, recentProjects] =
    await Promise.all([
      User.countDocuments({ role: "MANAGER" }),
      Project.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Group.countDocuments(),
      Project.find()
        .select("batch status projectStartDate projectManager")
        .populate("projectManager", "fullName")
        .sort({ createdAt: -1 })
        .limit(5),
    ]);

  const statuses = Object.fromEntries(
    projectCounts.map((item) => [item._id, item.count]),
  );

  res.status(200).render("admin/dashboard", {
    pageTitle: "Admin dashboard",
    activeNav: "dashboard",
    managerCount,
    groupCount,
    statuses,
    recentProjects,
  });
});

exports.managerDashboard = catchAsync(async (req, res) => {
  const [allProjectCount, assignedProjects] = await Promise.all([
    Project.countDocuments(),
    Project.find({ projectManager: req.user._id })
      .select("batch status projectStartDate")
      .sort({ projectStartDate: -1 }),
  ]);
  const assignedIds = assignedProjects.map((project) => project._id);
  const groupCount = await Group.countDocuments({
    project: { $in: assignedIds },
  });

  res.status(200).render("shared/manager-dashboard", {
    pageTitle: "Manager dashboard",
    activeNav: "dashboard",
    allProjectCount,
    assignedProjects,
    groupCount,
  });
});

exports.managers = catchAsync(async (req, res) => {
  const [managers, counts] = await Promise.all([
    User.find({ role: "MANAGER" })
      .select("fullName email status createdAt")
      .sort({ createdAt: -1 }),
    managerProjectCounts(),
  ]);

  const managerRows = managers.map((manager) => ({
    ...manager.toObject(),
    currentProjectCount:
      counts.get(manager._id.toString())?.currentProjectCount || 0,
    completedProjectCount:
      counts.get(manager._id.toString())?.completedProjectCount || 0,
  }));

  res.status(200).render("admin/managers", {
    pageTitle: "Managers",
    activeNav: "managers",
    managers: managerRows,
  });
});

exports.managerDetail = catchAsync(async (req, res, next) => {
  const [manager, currentProjects, completedProjects] = await Promise.all([
    User.findOne({ _id: req.params.id, role: "MANAGER" }).select(
      "fullName email status createdAt",
    ),
    Project.find({
      projectManager: req.params.id,
      status: { $in: OPEN_PROJECT_STATUSES },
    })
      .select("batch status projectStartDate")
      .sort({ projectStartDate: -1 }),
    Project.find({ projectManager: req.params.id, status: "COMPLETED" })
      .select("batch status projectStartDate")
      .sort({ projectStartDate: -1 }),
  ]);

  if (!manager) return next(new AppError("No manager found with that ID", 404));

  res.status(200).render("admin/manager-detail", {
    pageTitle: manager.fullName,
    activeNav: "managers",
    manager,
    currentProjects,
    completedProjects,
  });
});

exports.projects = catchAsync(async (req, res) => {
  const [projects, managers] = await Promise.all([
    Project.find()
      .select("batch status projectStartDate projectManager")
      .populate("projectManager", "fullName")
      .sort({ projectStartDate: -1 }),
    req.user.role === "ADMIN"
      ? User.find({ role: "MANAGER", status: "ACTIVE" })
          .select("fullName")
          .sort({ fullName: 1 })
      : Promise.resolve([]),
  ]);

  res.status(200).render("shared/projects", {
    pageTitle: "Projects",
    activeNav: "projects",
    projects,
    managers,
    panelRole: req.user.role,
  });
});

exports.projectDetail = catchAsync(async (req, res, next) => {
  const project = await Project.findById(req.params.id).populate(
    "projectManager",
    "fullName",
  );
  if (!project) return next(new AppError("No project found with that ID", 404));
  if (!projectAccessAllowed(project, req.user)) {
    return renderForbidden(res, req.user, req.path);
  }

  const [groups, managers] = await Promise.all([
    Group.find({ project: project._id }).sort({ groupNumber: 1 }),
    req.user.role === "ADMIN"
      ? User.find({ role: "MANAGER", status: "ACTIVE" })
          .select("fullName")
          .sort({ fullName: 1 })
      : Promise.resolve([]),
  ]);
  const readiness = getVotingReadiness(project, groups);
  const votingState =
    readiness.ready && project.projectShow?.isPublished
      ? resolveVotingState(project)
      : VOTING_STATES.NOT_PUBLISHED;
  const votingStats = await getVotingStats(project._id);

  res.status(200).render("shared/project-detail", {
    pageTitle: project.batch,
    activeNav: "projects",
    project,
    groups,
    managers,
    panelRole: req.user.role,
    votingControl: {
      readiness,
      state: votingState,
      stats: votingStats,
    },
  });
});

exports.groups = catchAsync(async (req, res) => {
  let groupFilter = {};
  let projectFilter = { status: "DRAFT" };

  if (req.user.role === "MANAGER") {
    const assignedProjectIds = await Project.find({
      projectManager: req.user._id,
    }).distinct("_id");
    groupFilter = { project: { $in: assignedProjectIds } };
    projectFilter = {
      _id: { $in: assignedProjectIds },
      status: "DRAFT",
    };
  }

  const [groups, availableProjects] = await Promise.all([
    Group.find(groupFilter)
      .populate("project", "batch status projectManager")
      .sort({ project: 1, groupNumber: 1 }),
    Project.find(projectFilter).select("batch").sort({ batch: 1 }),
  ]);

  res.status(200).render("shared/groups", {
    pageTitle: "Groups",
    activeNav: "groups",
    groups,
    availableProjects,
    panelRole: req.user.role,
  });
});

exports.groupDetail = catchAsync(async (req, res, next) => {
  const group = await Group.findById(req.params.id);
  if (!group) return next(new AppError("No group found with that ID", 404));

  const project = await Project.findById(group.project).populate(
    "projectManager",
    "fullName",
  );
  if (!project) return next(new AppError("No project found for this group", 404));
  if (!projectAccessAllowed(project, req.user)) {
    return renderForbidden(res, req.user, req.path);
  }

  res.status(200).render("shared/group-detail", {
    pageTitle: `Group ${group.groupNumber}`,
    activeNav: "groups",
    group,
    project,
    panelRole: req.user.role,
  });
});
