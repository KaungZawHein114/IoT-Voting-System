const Group = require("../models/groupModel");
const Project = require("../models/projectModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const {
  deleteStoredImages,
  getUploadedImagePaths,
} = require("../middleware/uploadMiddleware");
const {
  invalidateProjectPublication,
} = require("../services/votingService");

const GROUP_FIELDS = ["project", "members", "title", "description"];
const GROUP_UPDATE_FIELDS = ["members", "title", "description", "status"];
const PROJECT_SUMMARY_FIELDS = "batch status projectManager";
const GROUP_LIST_FIELDS = "project groupNumber title status";
const GROUP_LIST_PROJECT_FIELDS = "batch";

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key);

const rejectUnknownFields = (body, allowedFields) => {
  const unknownFields = Object.keys(body).filter(
    (field) => !allowedFields.includes(field),
  );

  if (unknownFields.length > 0) {
    throw new AppError(
      `These fields are not allowed: ${unknownFields.join(", ")}`,
      400,
    );
  }
};

const parseMembers = (members) => {
  if (Array.isArray(members)) return members;
  if (typeof members !== "string") return members;

  const trimmedMembers = members.trim();
  if (!trimmedMembers.startsWith("[")) return [trimmedMembers];

  let parsedMembers;
  try {
    parsedMembers = JSON.parse(trimmedMembers);
  } catch (error) {
    throw new AppError("members must be a valid JSON array of names", 400);
  }

  if (!Array.isArray(parsedMembers)) {
    throw new AppError("members must be an array of names", 400);
  }

  return parsedMembers;
};

const ensureProjectAccess = (project, user) => {
  if (user.role === "ADMIN") return;

  if (
    !project.projectManager ||
    project.projectManager.toString() !== user._id.toString()
  ) {
    throw new AppError(
      "You can only manage groups for projects assigned to you",
      403,
    );
  }
};

const ensureDraftProject = (project) => {
  if (project.status !== "DRAFT") {
    throw new AppError(
      "Groups can only be created, updated, or deleted while the project is in draft status",
      400,
    );
  }
};

const findProject = async (projectId) => {
  const project = await Project.findById(projectId);
  if (!project) {
    throw new AppError("No project found with that ID", 404);
  }
  return project;
};

const findGroupWithProject = async (groupId) => {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new AppError("No group found with that ID", 404);
  }

  const project = await findProject(group.project);
  return { group, project };
};

const getNextGroupNumber = async (projectId) => {
  const lastGroup = await Group.findOne({ project: projectId })
    .select("groupNumber")
    .sort({ groupNumber: -1 });

  return lastGroup ? lastGroup.groupNumber + 1 : 1;
};

const closeGroupNumberGap = async (projectId, deletedGroupNumber) => {
  const laterGroups = await Group.find({
    project: projectId,
    groupNumber: { $gt: deletedGroupNumber },
  }).sort({ groupNumber: 1 });

  for (const laterGroup of laterGroups) {
    await Group.updateOne(
      { _id: laterGroup._id },
      { $inc: { groupNumber: -1 } },
    );
  }
};

// POST /api/v1/groups - ADMIN or the assigned MANAGER, DRAFT project only
exports.createGroup = catchAsync(async (req, res, next) => {
  try {
    rejectUnknownFields(req.body, GROUP_FIELDS);
  } catch (error) {
    return next(error);
  }

  const requiredFields = ["project", "members", "title", "description"];
  const missingFields = requiredFields.filter(
    (field) => !hasOwn(req.body, field) || req.body[field] === "",
  );

  if (missingFields.length > 0) {
    return next(
      new AppError(`Please provide: ${missingFields.join(", ")}`, 400),
    );
  }

  const project = await findProject(req.body.project);
  ensureProjectAccess(project, req.user);
  ensureDraftProject(project);

  const groupData = {};
  GROUP_FIELDS.forEach((field) => {
    if (hasOwn(req.body, field)) groupData[field] = req.body[field];
  });
  groupData.members = parseMembers(groupData.members);
  groupData.images = getUploadedImagePaths(req.files);
  groupData.groupNumber = await getNextGroupNumber(project._id);

  const group = await Group.create(groupData);
  await invalidateProjectPublication(project, req.user._id);
  await group.populate("project", PROJECT_SUMMARY_FIELDS);

  res.status(201).json({
    status: "success",
    data: { group },
  });
});

// GET /api/v1/groups - ADMIN sees all; MANAGER sees assigned-project groups
exports.getAllGroups = catchAsync(async (req, res) => {
  let filter = {};

  if (req.user.role === "MANAGER") {
    const assignedProjects = await Project.find({
      projectManager: req.user._id,
    }).select("_id");

    filter = {
      project: { $in: assignedProjects.map((project) => project._id) },
    };
  }

  const groups = await Group.find(filter)
    .select(GROUP_LIST_FIELDS)
    .populate("project", GROUP_LIST_PROJECT_FIELDS)
    .sort({ project: 1, groupNumber: 1 });

  res.status(200).json({
    status: "success",
    results: groups.length,
    data: { groups },
  });
});

// GET /api/v1/groups/:id - ADMIN or the project's assigned MANAGER
exports.getGroup = catchAsync(async (req, res) => {
  const { group, project } = await findGroupWithProject(req.params.id);
  ensureProjectAccess(project, req.user);

  await group.populate("project", PROJECT_SUMMARY_FIELDS);

  res.status(200).json({
    status: "success",
    data: { group },
  });
});

// PATCH /api/v1/groups/:id - ADMIN or assigned MANAGER, DRAFT project only
exports.updateGroup = catchAsync(async (req, res, next) => {
  const uploadedFiles = req.files || [];

  try {
    rejectUnknownFields(req.body, GROUP_UPDATE_FIELDS);
  } catch (error) {
    return next(error);
  }

  if (Object.keys(req.body).length === 0 && uploadedFiles.length === 0) {
    return next(new AppError("Please provide at least one field to update", 400));
  }

  const { group, project } = await findGroupWithProject(req.params.id);
  ensureProjectAccess(project, req.user);
  ensureDraftProject(project);

  GROUP_UPDATE_FIELDS.forEach((field) => {
    if (hasOwn(req.body, field)) group[field] = req.body[field];
  });

  if (hasOwn(req.body, "members")) {
    group.members = parseMembers(req.body.members);
  }

  const oldImages = [...group.images];
  if (uploadedFiles.length > 0) {
    group.images = getUploadedImagePaths(uploadedFiles);
  }

  await group.save();
  await invalidateProjectPublication(project, req.user._id);

  if (uploadedFiles.length > 0) deleteStoredImages(oldImages);
  await group.populate("project", PROJECT_SUMMARY_FIELDS);

  res.status(200).json({
    status: "success",
    data: { group },
  });
});

// DELETE /api/v1/groups/:id - ADMIN or assigned MANAGER, DRAFT project only
exports.deleteGroup = catchAsync(async (req, res) => {
  const { group, project } = await findGroupWithProject(req.params.id);
  ensureProjectAccess(project, req.user);
  ensureDraftProject(project);

  const deletedGroupNumber = group.groupNumber;
  const projectId = group.project;
  await group.deleteOne();
  await closeGroupNumberGap(projectId, deletedGroupNumber);
  await invalidateProjectPublication(project, req.user._id);
  deleteStoredImages(group.images);

  res.status(204).json({ status: "success", data: null });
});
