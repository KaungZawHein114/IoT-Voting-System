const Project = require("../models/projectModel");
const User = require("../models/userModel");
const Group = require("../models/groupModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const {
  invalidateProjectPublication,
} = require("../services/votingService");

const PROJECT_LIST_FIELDS = "batch projectManager status projectStartDate _id";
const PROJECT_MANAGER_FIELDS = "fullName";
const GROUP_DETAIL_FIELDS = "groupNumber members title description images status";

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key);

const findAssignableManager = async (managerId) => {
  const manager = await User.findById(managerId);

  if (!manager || manager.role !== "MANAGER") {
    throw new AppError("Please select a valid project manager", 400);
  }

  if (manager.status === "DISABLED") {
    throw new AppError(
      "A disabled manager cannot be assigned to a project. Enable the manager first.",
      400,
    );
  }

  return manager;
};

const ensureProjectAccess = (project, user) => {
  if (user.role === "ADMIN") return;

  if (
    !project.projectManager ||
    project.projectManager.toString() !== user._id.toString()
  ) {
    throw new AppError("You can only access projects assigned to you", 403);
  }
};

const rejectUnknownFields = (body, allowedFields) => {
  const unknownFields = Object.keys(body).filter(
    (field) => !allowedFields.includes(field),
  );

  if (unknownFields.length > 0) {
    throw new AppError(
      `These fields cannot be updated: ${unknownFields.join(", ")}`,
      400,
    );
  }
};

const updateProjectShow = (project, showUpdates) => {
  if (
    !showUpdates ||
    typeof showUpdates !== "object" ||
    Array.isArray(showUpdates)
  ) {
    throw new AppError("projectShow must be an object", 400);
  }

  const allowedShowFields = [
    "startDate",
    "startTime",
    "endTime",
    "location",
    "votingCategories",
  ];
  rejectUnknownFields(showUpdates, allowedShowFields);

  ["startDate", "startTime", "endTime", "votingCategories"].forEach((field) => {
    if (hasOwn(showUpdates, field)) {
      project.projectShow[field] = showUpdates[field];
    }
  });

  if (hasOwn(showUpdates, "location")) {
    const location = showUpdates.location;
    if (!location || typeof location !== "object" || Array.isArray(location)) {
      throw new AppError("projectShow.location must be an object", 400);
    }

    rejectUnknownFields(location, ["campus", "floor", "room"]);
    ["campus", "floor", "room"].forEach((field) => {
      if (hasOwn(location, field)) {
        project.projectShow.location[field] = location[field];
      }
    });
  }
};

const formatProjectDetail = (project, user) => {
  const projectData = project.toObject();

  if (user.role === "MANAGER") {
    delete projectData.createdAt;
    delete projectData.updatedAt;
    delete projectData.__v;
  }

  return projectData;
};

// POST /api/v1/projects - ADMIN only
exports.createProject = catchAsync(async (req, res, next) => {
  const allowedFields = ["batch", "projectStartDate", "projectManager"];
  const providedFields = Object.keys(req.body);
  const unknownFields = providedFields.filter(
    (field) => !allowedFields.includes(field),
  );

  if (unknownFields.length > 0) {
    return next(
      new AppError(
        `Only batch, projectStartDate, and projectManager are allowed. Remove: ${unknownFields.join(", ")}`,
        400,
      ),
    );
  }

  const missingFields = allowedFields.filter((field) => !req.body[field]);
  if (missingFields.length > 0) {
    return next(
      new AppError(`Please provide: ${missingFields.join(", ")}`, 400),
    );
  }

  await findAssignableManager(req.body.projectManager);

  const project = await Project.create({
    batch: req.body.batch,
    projectStartDate: req.body.projectStartDate,
    projectManager: req.body.projectManager,
  });

  await project.populate("projectManager", PROJECT_MANAGER_FIELDS);

  res.status(201).json({
    status: "success",
    data: { project },
  });
});

// GET /api/v1/projects - ADMIN and MANAGER both see all projects
exports.getAllProjects = catchAsync(async (req, res) => {
  const projects = await Project.find()
    .select(PROJECT_LIST_FIELDS)
    .populate("projectManager", PROJECT_MANAGER_FIELDS)
    .sort({ projectStartDate: -1 });

  res.status(200).json({
    status: "success",
    results: projects.length,
    data: { projects },
  });
});

// GET /api/v1/projects/:id - ADMIN or the currently assigned MANAGER
exports.getProject = catchAsync(async (req, res, next) => {
  const project = await Project.findById(req.params.id).populate(
    "projectManager",
    PROJECT_MANAGER_FIELDS,
  );

  if (!project) {
    return next(new AppError("No project found with that ID", 404));
  }

  const managerId = project.projectManager?._id || project.projectManager;
  ensureProjectAccess({ projectManager: managerId }, req.user);

  const groups = await Group.find({ project: project._id })
    .select(GROUP_DETAIL_FIELDS)
    .sort({ groupNumber: 1 });

  const projectDetail = formatProjectDetail(project, req.user);
  projectDetail.groups = groups;

  res.status(200).json({
    status: "success",
    data: { project: projectDetail },
  });
});

// PATCH /api/v1/projects/:id - ADMIN or the currently assigned MANAGER
exports.updateProject = catchAsync(async (req, res, next) => {
  const project = await Project.findById(req.params.id);

  if (!project) {
    return next(new AppError("No project found with that ID", 404));
  }

  ensureProjectAccess(project, req.user);

  const allowedFields =
    req.user.role === "ADMIN"
      ? ["batch", "projectStartDate", "projectManager", "theme", "projectShow"]
      : ["theme", "projectShow"];

  try {
    rejectUnknownFields(req.body, allowedFields);
  } catch (error) {
    return next(error);
  }

  if (Object.keys(req.body).length === 0) {
    return next(
      new AppError("Please provide at least one field to update", 400),
    );
  }

  const changesPublishedContent =
    hasOwn(req.body, "batch") ||
    hasOwn(req.body, "theme") ||
    hasOwn(req.body, "projectShow");
  if (changesPublishedContent && project.status !== "DRAFT") {
    return next(
      new AppError(
        "Batch, project theme, and show information can only be edited while the project is in draft status",
        400,
      ),
    );
  }

  if (hasOwn(req.body, "projectManager")) {
    await findAssignableManager(req.body.projectManager);
    project.projectManager = req.body.projectManager;
  }

  ["batch", "projectStartDate", "theme"].forEach((field) => {
    if (hasOwn(req.body, field)) project[field] = req.body[field];
  });

  if (hasOwn(req.body, "projectShow")) {
    try {
      updateProjectShow(project, req.body.projectShow);
    } catch (error) {
      return next(error);
    }
  }

  await project.save();

  if (changesPublishedContent) {
    await invalidateProjectPublication(project, req.user._id);
  }

  await project.populate("projectManager", PROJECT_MANAGER_FIELDS);

  res.status(200).json({
    status: "success",
    data: { project: formatProjectDetail(project, req.user) },
  });
});

// DELETE /api/v1/projects/:id - ADMIN only, DRAFT projects only
exports.deleteProject = catchAsync(async (req, res, next) => {
  const project = await Project.findById(req.params.id);

  if (!project) {
    return next(new AppError("No project found with that ID", 404));
  }

  if (project.status !== "DRAFT") {
    return next(new AppError("Only draft projects can be deleted", 400));
  }

  const hasGroups = await Group.exists({ project: project._id });
  if (hasGroups) {
    return next(
      new AppError(
        "Delete this project's groups before deleting the project",
        400,
      ),
    );
  }

  await project.deleteOne();

  res.status(204).json({ status: "success", data: null });
});
