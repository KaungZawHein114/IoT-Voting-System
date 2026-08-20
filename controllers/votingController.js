const crypto = require("crypto");
const mongoose = require("mongoose");
const QRCode = require("qrcode");

const Project = require("../models/projectModel");
const QrAccessToken = require("../models/qrAccessTokenModel");
const Vote = require("../models/voteModel");
const VotingSession = require("../models/votingSessionModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const {
  VOTING_MODES,
  VOTING_STATES,
  getDesiredProjectStatus,
  getProjectVotingContext,
  getVotingStats,
  resolveVotingState,
  syncProjectStatus,
} = require("../services/votingService");
const {
  createCsrfToken,
  hashToken,
  randomToken,
  validCsrfToken,
} = require("../services/votingTokenService");

const SESSION_COOKIE = "voteSession";
const QR_TOKEN_TTL_MS = 30000;
const VOTING_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ALLOWED_MODES = Object.values(VOTING_MODES);

const normalizeBatch = (batch) =>
  String(batch || "")
    .trim()
    .toUpperCase();

const setNoStoreHeaders = (res) => {
  res.set("Cache-Control", "no-store, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("Referrer-Policy", "no-referrer");
};

const sessionCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: VOTING_SESSION_TTL_MS,
  path: "/",
});

const clearSessionCookie = (res) => {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
};

const getPublicBaseUrl = (req) => {
  const configuredUrl = String(process.env.PUBLIC_BASE_URL || "").replace(
    /\/$/,
    "",
  );
  return configuredUrl || `${req.protocol}://${req.get("host")}`;
};

const ensureControlAccess = (project, user) => {
  if (user.role === "ADMIN") return;
  const managerId = project.projectManager?._id || project.projectManager;
  if (!managerId || managerId.toString() !== user._id.toString()) {
    throw new AppError(
      "Only the assigned project manager can control this voting website",
      403,
    );
  }
};

const findProjectById = async (id) => {
  const project = await Project.findById(id).populate(
    "projectManager",
    "fullName",
  );
  if (!project) throw new AppError("No project found with that ID", 404);
  return project;
};

const findProjectByBatch = async (batch) => {
  const normalizedBatch = normalizeBatch(batch);
  if (!/^HND-\d+$/.test(normalizedBatch)) {
    throw new AppError("Voting website not found", 404);
  }

  const project = await Project.findOne({ batch: normalizedBatch });
  if (!project) throw new AppError("Voting website not found", 404);
  return project;
};

const findBrowserSession = async (req, project) => {
  const rawToken = req.cookies?.[SESSION_COOKIE];
  if (!rawToken) {
    return { rawToken: null, session: null, belongsToAnotherProject: false };
  }

  const session = await VotingSession.findOne({
    sessionTokenHash: hashToken(rawToken),
  });
  const belongsToAnotherProject =
    session && session.project.toString() !== project._id.toString();
  return {
    rawToken,
    session: belongsToAnotherProject ? null : session,
    belongsToAnotherProject,
  };
};

const sendControlResponse = async (res, project, statusCode = 200) => {
  const [context, stats] = await Promise.all([
    getProjectVotingContext(project),
    getVotingStats(project._id),
  ]);

  res.status(statusCode).json({
    status: "success",
    data: {
      votingControl: {
        isPublished: project.projectShow.isPublished,
        mode: project.projectShow.votingMode,
        state: context.state,
        readiness: {
          ready: context.readiness.ready,
          missing: context.readiness.missing,
        },
        stats,
      },
    },
  });
};

// GET /api/v1/projects/:id/voting-control
exports.getVotingControl = catchAsync(async (req, res) => {
  const project = await findProjectById(req.params.id);
  ensureControlAccess(project, req.user);
  await syncProjectStatus(project);
  await sendControlResponse(res, project);
});

// POST /api/v1/projects/:id/publish
exports.publishProjectShow = catchAsync(async (req, res, next) => {
  const project = await findProjectById(req.params.id);
  ensureControlAccess(project, req.user);

  const context = await getProjectVotingContext(project);
  if (!context.readiness.ready) {
    return next(
      new AppError(
        `Project show is not ready: ${context.readiness.missing.join(", ")}`,
        400,
      ),
    );
  }

  if (!project.projectShow.isPublished) {
    project.projectShow.isPublished = true;
    project.projectShow.publishedAt = new Date();
    project.projectShow.votingMode = VOTING_MODES.SCHEDULED;
    project.projectShow.votingGeneration =
      (project.projectShow.votingGeneration || 0) + 1;
    project.projectShow.votingModeChangedAt = new Date();
    project.projectShow.votingModeChangedBy = req.user._id;
    project.status = getDesiredProjectStatus(project);
    await project.save();
  }

  await sendControlResponse(res, project);
});

// POST /api/v1/projects/:id/unpublish
exports.unpublishProjectShow = catchAsync(async (req, res, next) => {
  const project = await findProjectById(req.params.id);
  ensureControlAccess(project, req.user);

  if (!project.projectShow.isPublished) {
    return sendControlResponse(res, project);
  }

  const state = resolveVotingState(project);
  if (state === VOTING_STATES.VOTING_OPEN || project.status === "ACTIVE") {
    return next(
      new AppError("Stop voting before unpublishing the project show", 400),
    );
  }
  if (project.status === "COMPLETED") {
    return next(
      new AppError("A completed project show cannot be unpublished", 400),
    );
  }

  project.projectShow.isPublished = false;
  project.projectShow.publishedAt = null;
  project.projectShow.votingMode = VOTING_MODES.SCHEDULED;
  project.projectShow.votingGeneration =
    (project.projectShow.votingGeneration || 0) + 1;
  project.projectShow.votingModeChangedAt = new Date();
  project.projectShow.votingModeChangedBy = req.user._id;
  project.status = "DRAFT";
  await project.save();

  await sendControlResponse(res, project);
});

// PATCH /api/v1/projects/:id/voting-mode
exports.updateVotingMode = catchAsync(async (req, res, next) => {
  const project = await findProjectById(req.params.id);
  ensureControlAccess(project, req.user);

  const requestedMode = req.body.mode;
  if (!ALLOWED_MODES.includes(requestedMode)) {
    return next(
      new AppError(
        "mode must be SCHEDULED, FORCED_OPEN, or FORCED_CLOSED",
        400,
      ),
    );
  }

  const context = await getProjectVotingContext(project);
  if (!project.projectShow.isPublished || !context.readiness.ready) {
    return next(
      new AppError(
        "Publish a complete project show before controlling voting",
        400,
      ),
    );
  }

  const previousState = context.state;
  if (
    requestedMode === VOTING_MODES.FORCED_CLOSED &&
    previousState !== VOTING_STATES.VOTING_OPEN
  ) {
    return next(new AppError("Voting is not currently open", 400));
  }

  if (requestedMode === project.projectShow.votingMode) {
    return sendControlResponse(res, project);
  }

  project.projectShow.votingMode = requestedMode;
  project.projectShow.votingModeChangedAt = new Date();
  project.projectShow.votingModeChangedBy = req.user._id;

  const nextState = resolveVotingState(project);
  const votingWindowChanged =
    (previousState === VOTING_STATES.VOTING_OPEN) !==
    (nextState === VOTING_STATES.VOTING_OPEN);
  if (votingWindowChanged) {
    project.projectShow.votingGeneration =
      (project.projectShow.votingGeneration || 0) + 1;
  }

  project.status = getDesiredProjectStatus(project);
  await project.save();
  await sendControlResponse(res, project);
});

// POST /api/v1/projects/:id/qr-token
exports.createQrToken = catchAsync(async (req, res, next) => {
  const project = await findProjectById(req.params.id);
  ensureControlAccess(project, req.user);

  const context = await getProjectVotingContext(project);
  if (
    !context.readiness.ready ||
    !project.projectShow.isPublished ||
    context.state !== VOTING_STATES.VOTING_OPEN
  ) {
    return next(new AppError("Voting is not open for this project", 409));
  }

  await syncProjectStatus(project);
  const rawToken = randomToken();
  const publicId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + QR_TOKEN_TTL_MS);

  await QrAccessToken.create({
    project: project._id,
    publicId,
    tokenHash: hashToken(rawToken),
    expiresAt,
  });

  const admissionUrl = `${getPublicBaseUrl(req)}/vote/${project.batch}/admit#${rawToken}`;
  const [qrImage, stats] = await Promise.all([
    QRCode.toDataURL(admissionUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 560,
      color: { dark: "#003f67", light: "#ffffff" },
    }),
    getVotingStats(project._id),
  ]);

  setNoStoreHeaders(res);
  res.status(201).json({
    status: "success",
    data: { publicId, expiresAt, qrImage, stats },
  });
});

// GET /api/v1/projects/:id/qr-token/:publicId/status
exports.getQrTokenStatus = catchAsync(async (req, res) => {
  const project = await findProjectById(req.params.id);
  ensureControlAccess(project, req.user);

  const [token, context, stats] = await Promise.all([
    QrAccessToken.findOne({
      project: project._id,
      publicId: req.params.publicId,
    }),
    getProjectVotingContext(project),
    getVotingStats(project._id),
  ]);
  const now = new Date();

  setNoStoreHeaders(res);
  res.status(200).json({
    status: "success",
    data: {
      open: context.state === VOTING_STATES.VOTING_OPEN,
      claimed: Boolean(token?.claimedAt),
      expired: !token || token.expiresAt <= now,
      expiresAt: token?.expiresAt || null,
      stats,
    },
  });
});

// GET /admin|manager/projects/:id/qr-display
exports.renderQrDisplay = catchAsync(async (req, res) => {
  const project = await findProjectById(req.params.id);
  ensureControlAccess(project, req.user);
  const [context, stats] = await Promise.all([
    getProjectVotingContext(project),
    getVotingStats(project._id),
  ]);

  setNoStoreHeaders(res);
  res.status(200).render("shared/qr-display", {
    pageTitle: `${project.batch} QR display`,
    project,
    votingState: context.state,
    stats,
    basePath: req.user.role === "ADMIN" ? "/admin" : "/manager",
  });
});

// GET /vote/:batch/admit
exports.renderAdmissionPage = catchAsync(async (req, res) => {
  const project = await findProjectByBatch(req.params.batch);
  setNoStoreHeaders(res);
  res.status(200).render("voting/admit", {
    pageTitle: "Checking voting access",
    batch: project.batch,
  });
});

// POST /api/v1/voting/:batch/admit
exports.claimAdmission = catchAsync(async (req, res, next) => {
  const project = await findProjectByBatch(req.params.batch);
  const context = await getProjectVotingContext(project);
  if (!context.readiness.ready || context.state !== VOTING_STATES.VOTING_OPEN) {
    return next(new AppError("Voting is not currently open", 409));
  }

  const admissionToken = String(req.body.token || "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(admissionToken)) {
    return next(new AppError("This QR code is invalid or has expired", 401));
  }

  const now = new Date();
  const claimedToken = await QrAccessToken.findOneAndUpdate(
    {
      project: project._id,
      tokenHash: hashToken(admissionToken),
      claimedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { claimedAt: now } },
    { new: true },
  );

  if (!claimedToken) {
    return next(
      new AppError("This QR code has expired or was already used", 401),
    );
  }

  const redirectWithSession = async (session) => {
    claimedToken.claimedSession = session._id;
    await claimedToken.save();
    setNoStoreHeaders(res);
    return res.status(200).json({
      status: "success",
      data: { redirectUrl: `/vote/${project.batch}` },
    });
  };

  const { rawToken: existingRawToken, session: existingSession } =
    await findBrowserSession(req, project);
  if (existingSession) {
    const existingVote = await Vote.exists({
      votingSession: existingSession._id,
    });
    if (existingSession.status === "VOTED" || existingVote) {
      return redirectWithSession(existingSession);
    }

    if (
      existingSession.expiresAt > new Date() &&
      existingSession.votingGeneration ===
        (project.projectShow.votingGeneration || 0)
    ) {
      return redirectWithSession(existingSession);
    }

    if (existingRawToken) clearSessionCookie(res);
  }

  const refreshedProject = await Project.findById(project._id);
  if (!refreshedProject) {
    return next(new AppError("Voting website not found", 404));
  }
  const refreshedContext = await getProjectVotingContext(refreshedProject);
  if (refreshedContext.state !== VOTING_STATES.VOTING_OPEN) {
    return next(new AppError("Voting has closed", 409));
  }

  const sessionToken = randomToken();
  const session = await VotingSession.create({
    project: project._id,
    sessionTokenHash: hashToken(sessionToken),
    votingGeneration: refreshedProject.projectShow.votingGeneration || 0,
    expiresAt: new Date(Date.now() + VOTING_SESSION_TTL_MS),
  });
  claimedToken.claimedSession = session._id;
  await claimedToken.save();

  res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions());
  setNoStoreHeaders(res);
  res.status(201).json({
    status: "success",
    data: { redirectUrl: `/vote/${project.batch}` },
  });
});

// GET /vote/:batch
exports.renderVotingPage = catchAsync(async (req, res) => {
  const project = await findProjectByBatch(req.params.batch);
  const { rawToken, session, belongsToAnotherProject } =
    await findBrowserSession(req, project);
  setNoStoreHeaders(res);

  const baseData = {
    pageTitle: `${project.batch} voting`,
    project,
    groups: [],
    categories: project.projectShow.votingCategories || [],
    csrfToken: null,
  };

  if (!rawToken || !session) {
    if (!belongsToAnotherProject) clearSessionCookie(res);
    return res.status(403).render("voting/page", {
      ...baseData,
      pageState: "NO_ACCESS",
    });
  }

  const existingVote = await Vote.exists({ votingSession: session._id });
  if (session.status === "VOTED" || existingVote) {
    if (session.status !== "VOTED") {
      await VotingSession.updateOne(
        { _id: session._id },
        { status: "VOTED", votedAt: new Date() },
      );
    }
    return res.status(200).render("voting/page", {
      ...baseData,
      pageState: "VOTED",
    });
  }

  if (
    session.expiresAt <= new Date() ||
    session.votingGeneration !== (project.projectShow.votingGeneration || 0)
  ) {
    clearSessionCookie(res);
    return res.status(403).render("voting/page", {
      ...baseData,
      pageState: "EXPIRED",
    });
  }

  const context = await getProjectVotingContext(project);
  if (context.state !== VOTING_STATES.VOTING_OPEN) {
    return res.status(200).render("voting/page", {
      ...baseData,
      pageState: "CLOSED",
    });
  }

  await syncProjectStatus(project);
  return res.status(200).render("voting/page", {
    ...baseData,
    pageState: "OPEN",
    groups: context.readiness.activeGroups,
    categories: context.readiness.categories,
    csrfToken: createCsrfToken(rawToken),
    splashKey: hashToken(`voting-pass:${rawToken}`).slice(0, 24),
  });
});

// POST /api/v1/voting/:batch/votes
exports.submitVote = catchAsync(async (req, res, next) => {
  const project = await findProjectByBatch(req.params.batch);
  const { rawToken, session } = await findBrowserSession(req, project);

  if (!rawToken || !session) {
    return next(new AppError("A valid voting session is required", 401));
  }

  const existingVote = await Vote.exists({ votingSession: session._id });
  if (session.status === "VOTED" || existingVote) {
    return next(new AppError("This voting session has already voted", 409));
  }
  if (
    session.expiresAt <= new Date() ||
    session.votingGeneration !== (project.projectShow.votingGeneration || 0)
  ) {
    return next(new AppError("This voting session has expired", 401));
  }
  if (!validCsrfToken(rawToken, req.get("x-vote-csrf"))) {
    return next(new AppError("Invalid voting request", 403));
  }

  const context = await getProjectVotingContext(project);
  if (context.state !== VOTING_STATES.VOTING_OPEN) {
    return next(new AppError("Voting is closed", 409));
  }

  const selections = req.body.selections;
  if (!Array.isArray(selections)) {
    return next(
      new AppError("Please select one group for every category", 400),
    );
  }

  const categoryIds = context.readiness.categories.map((category) =>
    category._id.toString(),
  );
  const validGroupIds = new Set(
    context.readiness.activeGroups.map((group) => group._id.toString()),
  );
  const selectedCategories = new Set();

  for (const selection of selections) {
    const categoryId = String(selection.votingCategory || "");
    const groupId = String(selection.group || "");
    if (
      !mongoose.Types.ObjectId.isValid(categoryId) ||
      !mongoose.Types.ObjectId.isValid(groupId) ||
      !categoryIds.includes(categoryId) ||
      !validGroupIds.has(groupId) ||
      selectedCategories.has(categoryId)
    ) {
      return next(new AppError("One or more vote selections are invalid", 400));
    }
    selectedCategories.add(categoryId);
  }

  if (
    selections.length !== categoryIds.length ||
    selectedCategories.size !== categoryIds.length
  ) {
    return next(
      new AppError("Please select one group for every category", 400),
    );
  }

  let vote;
  try {
    vote = await Vote.create({
      project: project._id,
      votingSession: session._id,
      selections,
    });
  } catch (error) {
    if (error.code === 11000) {
      return next(new AppError("This voting session has already voted", 409));
    }
    throw error;
  }

  session.status = "VOTED";
  session.votedAt = new Date();
  await session.save();

  setNoStoreHeaders(res);
  res.status(201).json({
    status: "success",
    data: { vote: { _id: vote._id, submittedAt: vote.createdAt } },
  });
});
