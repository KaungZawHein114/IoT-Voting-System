const Group = require("../models/groupModel");
const Project = require("../models/projectModel");
const Vote = require("../models/voteModel");
const VotingSession = require("../models/votingSessionModel");

const VOTING_STATES = Object.freeze({
  NOT_PUBLISHED: "NOT_PUBLISHED",
  UPCOMING: "UPCOMING",
  VOTING_OPEN: "VOTING_OPEN",
  VOTING_CLOSED: "VOTING_CLOSED",
});

const VOTING_MODES = Object.freeze({
  SCHEDULED: "SCHEDULED",
  FORCED_OPEN: "FORCED_OPEN",
  FORCED_CLOSED: "FORCED_CLOSED",
});

const configuredOffset = process.env.VOTING_TIMEZONE_OFFSET || "+06:30";
const TIMEZONE_OFFSET = /^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(configuredOffset)
  ? configuredOffset
  : "+06:30";

const cleanText = (value) => String(value || "").trim();

const getDatePart = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const validTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || "");

const getShowSchedule = (project) => {
  const show = project.projectShow || {};
  const datePart = getDatePart(show.startDate);

  if (!datePart || !validTime(show.startTime) || !validTime(show.endTime)) {
    return { startAt: null, endAt: null, valid: false };
  }

  const startAt = new Date(
    `${datePart}T${show.startTime}:00${TIMEZONE_OFFSET}`,
  );
  const endAt = new Date(`${datePart}T${show.endTime}:00${TIMEZONE_OFFSET}`);
  const valid =
    !Number.isNaN(startAt.getTime()) &&
    !Number.isNaN(endAt.getTime()) &&
    endAt > startAt;

  return { startAt, endAt, valid };
};

const getVotingReadiness = (project, groups = []) => {
  const show = project.projectShow || {};
  const location = show.location || {};
  const categories = show.votingCategories || [];
  const activeGroups = groups.filter((group) => group.status === "ACTIVE");
  const missing = [];

  if (!cleanText(project.theme)) missing.push("Project theme");
  if (!show.startDate) missing.push("Project show date");
  if (!validTime(show.startTime)) missing.push("Valid start time");
  if (!validTime(show.endTime)) missing.push("Valid end time");
  if (!cleanText(location.campus)) missing.push("Campus");
  if (!cleanText(location.floor)) missing.push("Floor");
  if (!cleanText(location.room)) missing.push("Room");

  const schedule = getShowSchedule(project);
  if (show.startDate && show.startTime && show.endTime && !schedule.valid) {
    missing.push("End time must be later than start time");
  }

  if (activeGroups.length < 2) missing.push("At least 2 active groups");
  if (
    activeGroups.some(
      (group) =>
        !cleanText(group.title) ||
        !cleanText(group.description) ||
        !Array.isArray(group.members) ||
        group.members.filter(cleanText).length === 0,
    )
  ) {
    missing.push("Every active group needs a title, description, and members");
  }

  if (categories.length < 2) missing.push("At least 2 voting categories");
  if (
    categories.some(
      (category) =>
        !cleanText(category.name) || !cleanText(category.description),
    )
  ) {
    missing.push("Every voting category needs a name and description");
  }

  const categoryNames = categories.map((category) =>
    cleanText(category.name).toLowerCase(),
  );
  if (new Set(categoryNames).size !== categoryNames.length) {
    missing.push("Voting category names must be unique");
  }

  return {
    ready: missing.length === 0,
    missing,
    schedule,
    activeGroups,
    categories,
  };
};

const resolveVotingState = (project, now = new Date()) => {
  const show = project.projectShow || {};
  if (!show.isPublished) return VOTING_STATES.NOT_PUBLISHED;
  if (show.votingMode === VOTING_MODES.FORCED_OPEN) {
    return VOTING_STATES.VOTING_OPEN;
  }
  if (show.votingMode === VOTING_MODES.FORCED_CLOSED) {
    return VOTING_STATES.VOTING_CLOSED;
  }

  const schedule = getShowSchedule(project);
  if (!schedule.valid) return VOTING_STATES.NOT_PUBLISHED;
  if (now < schedule.startAt) return VOTING_STATES.UPCOMING;
  if (now <= schedule.endAt) return VOTING_STATES.VOTING_OPEN;
  return VOTING_STATES.VOTING_CLOSED;
};

const getDesiredProjectStatus = (project, now = new Date()) => {
  const state = resolveVotingState(project, now);
  if (state === VOTING_STATES.VOTING_OPEN) return "ACTIVE";
  if (state === VOTING_STATES.UPCOMING) return "DRAFT";

  if (state === VOTING_STATES.VOTING_CLOSED) {
    const schedule = getShowSchedule(project);
    if (schedule.valid && now > schedule.endAt) return "COMPLETED";
  }

  return project.status;
};

const syncProjectStatus = async (project, now = new Date()) => {
  const desiredStatus = getDesiredProjectStatus(project, now);
  if (project.status !== desiredStatus) {
    await Project.updateOne(
      { _id: project._id, status: { $ne: desiredStatus } },
      { $set: { status: desiredStatus } },
    );
    project.status = desiredStatus;
  }
  return project;
};

const invalidateProjectPublication = async (project, changedBy) => {
  const show = project.projectShow || {};
  if (!show.isPublished && show.votingMode === VOTING_MODES.SCHEDULED) return;

  show.isPublished = false;
  show.publishedAt = null;
  show.votingMode = VOTING_MODES.SCHEDULED;
  show.votingGeneration = (show.votingGeneration || 0) + 1;
  show.votingModeChangedAt = new Date();
  show.votingModeChangedBy = changedBy || null;
  if (project.status !== "COMPLETED") project.status = "DRAFT";
  await project.save();
};

const getProjectVotingContext = async (project) => {
  const groups = await Group.find({ project: project._id }).sort({
    groupNumber: 1,
  });
  const readiness = getVotingReadiness(project, groups);
  return {
    groups,
    readiness,
    state:
      readiness.ready && project.projectShow?.isPublished
        ? resolveVotingState(project)
        : VOTING_STATES.NOT_PUBLISHED,
  };
};

const getVotingStats = async (projectId) => {
  const [scannedCount, votedCount] = await Promise.all([
    VotingSession.countDocuments({ project: projectId }),
    Vote.countDocuments({ project: projectId }),
  ]);

  return {
    scannedCount,
    votedCount,
    waitingCount: Math.max(scannedCount - votedCount, 0),
  };
};

const syncAllPublishedProjects = async () => {
  const projects = await Project.find({ "projectShow.isPublished": true });
  await Promise.all(projects.map((project) => syncProjectStatus(project)));
};

module.exports = {
  TIMEZONE_OFFSET,
  VOTING_MODES,
  VOTING_STATES,
  getDesiredProjectStatus,
  getProjectVotingContext,
  getShowSchedule,
  getVotingReadiness,
  getVotingStats,
  invalidateProjectPublication,
  resolveVotingState,
  syncAllPublishedProjects,
  syncProjectStatus,
};
