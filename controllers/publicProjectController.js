const Project = require("../models/projectModel");
const Group = require("../models/groupModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const {
  getVotingResults,
  syncAllPublishedProjects,
} = require("../services/votingService");
const {
  serializeGroup,
  serializeProjectSummary,
} = require("../utils/publicSerializers");

const normalizeBatch = (batch) =>
  String(batch || "")
    .trim()
    .toUpperCase();

const findPublishedProjectByBatch = async (batch) => {
  const project = await Project.findOne({
    batch: normalizeBatch(batch),
    "projectShow.isPublished": true,
  });
  if (!project) throw new AppError("No show found with that batch code", 404);
  return project;
};

// GET /api/v1/public/projects
// Every published show, for the public Home/History pages to bucket by state.
exports.listProjects = catchAsync(async (req, res) => {
  await syncAllPublishedProjects();
  const projects = await Project.find({
    "projectShow.isPublished": true,
  }).sort({ "projectShow.startDate": 1 });

  const groupCounts = await Group.aggregate([
    {
      $match: {
        project: { $in: projects.map((project) => project._id) },
        status: "ACTIVE",
      },
    },
    { $group: { _id: "$project", count: { $sum: 1 } } },
  ]);
  const countsByProject = new Map(
    groupCounts.map((item) => [item._id.toString(), item.count]),
  );

  res.status(200).json({
    status: "success",
    data: {
      projects: projects.map((project) => ({
        ...serializeProjectSummary(project),
        groupCount: countsByProject.get(project._id.toString()) || 0,
      })),
    },
  });
});

// GET /api/v1/public/projects/:batch
// A single show plus its active groups — used for the public Group/Project
// page, for both upcoming/active and historical shows.
exports.getProject = catchAsync(async (req, res) => {
  const project = await findPublishedProjectByBatch(req.params.batch);
  const groups = await Group.find({
    project: project._id,
    status: "ACTIVE",
  }).sort({ groupNumber: 1 });

  res.status(200).json({
    status: "success",
    data: {
      project: serializeProjectSummary(project),
      groups: groups.map(serializeGroup),
    },
  });
});

// GET /api/v1/public/projects/:batch/results
// Only once voting has fully closed — per-category vote tallies.
exports.getResults = catchAsync(async (req, res, next) => {
  const project = await findPublishedProjectByBatch(req.params.batch);
  if (project.status !== "COMPLETED") {
    return next(
      new AppError("Results are not available until voting has closed", 409),
    );
  }

  const results = await getVotingResults(project);
  res.status(200).json({
    status: "success",
    data: {
      project: serializeProjectSummary(project),
      categories: results.categories,
    },
  });
});
