const crypto = require("crypto");
const mongoose = require("mongoose");
const QRCode = require("qrcode");

const PublicShowGroup = require("../models/publicShowGroupModel");
const PublicQrAccessToken = require("../models/publicQrAccessTokenModel");
const PublicVote = require("../models/publicVoteModel");
const PublicVotingSession = require("../models/publicVotingSessionModel");
const User = require("../models/userModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const {
  PUBLIC_SHOW_CATEGORY_NAME,
  getActiveGroups,
  getAllGroups,
  getOrCreateShow,
  getReadiness,
  getResults,
  getStats,
  resolveState,
  syncGroupsFromImages,
} = require("../services/publicShowService");
const {
  createCsrfToken,
  hashToken,
  randomToken,
  validCsrfToken,
} = require("../services/votingTokenService");

const SESSION_COOKIE = "publicVoteSession";
// Rotate the visible QR after 10 seconds, but keep its link valid for another
// 5 seconds so visitors who scan near the end of the countdown can still enter.
const QR_DISPLAY_TTL_MS = 10000;
const QR_TOKEN_TTL_MS = 15000;
// How long a re-entered admin password unlocks the sensitive actions below —
// long enough to cover one show without repeat prompts, short enough to expire on its own.
const ADMIN_ACTION_TTL_MS = 6 * 60 * 60 * 1000;
const VOTING_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

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

const findBrowserSession = async (req) => {
  const rawToken = req.cookies?.[SESSION_COOKIE];
  if (!rawToken) return { rawToken: null, session: null };

  const session = await PublicVotingSession.findOne({
    sessionTokenHash: hashToken(rawToken),
  });
  return { rawToken, session };
};

// Short-lived, stateless proof that the admin password was just re-entered.
// Gates the two actions anyone standing at an already-logged-in screen could otherwise trigger.
const createAdminActionToken = (userId) => {
  const expiresAt = Date.now() + ADMIN_ACTION_TTL_MS;
  const signature = crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`admin-action:${userId}:${expiresAt}`)
    .digest("base64url");
  return `${expiresAt}.${signature}`;
};

const validAdminActionToken = (userId, candidate) => {
  if (!candidate || typeof candidate !== "string") return false;
  const [expiresAtRaw, signature] = candidate.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now() || !signature) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`admin-action:${userId}:${expiresAt}`)
    .digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
};

const requireAdminActionToken = (req, next) => {
  if (validAdminActionToken(req.user._id.toString(), req.get("x-admin-action"))) {
    return true;
  }
  next(new AppError("Re-enter the admin email and password to continue", 401));
  return false;
};

const sendControlResponse = async (res, show, statusCode = 200) => {
  const [groups, stats] = await Promise.all([getAllGroups(), getStats()]);
  const readiness = getReadiness(groups);

  res.status(statusCode).json({
    status: "success",
    data: {
      control: {
        isOpen: show.isOpen,
        state: resolveState(show),
        readiness: { ready: readiness.ready, missing: readiness.missing },
        stats,
      },
    },
  });
};

/* ==========================================
   ADMIN CONTROL — restricted to ADMIN by the router
========================================== */

// GET /api/v1/public-show/control
exports.getControl = catchAsync(async (req, res) => {
  const show = await getOrCreateShow();
  await sendControlResponse(res, show);
});

// POST /api/v1/public-show/open
exports.openVoting = catchAsync(async (req, res, next) => {
  const show = await getOrCreateShow();
  const groups = await getAllGroups();
  const readiness = getReadiness(groups);

  if (!readiness.ready) {
    return next(
      new AppError(
        `Voting is not ready to open: ${readiness.missing.join(", ")}`,
        400,
      ),
    );
  }

  if (!show.isOpen) {
    show.isOpen = true;
    show.votingGeneration = (show.votingGeneration || 0) + 1;
    show.openedAt = new Date();
    show.closedAt = null;
    show.lastChangedBy = req.user._id;
    await show.save();
  }

  await sendControlResponse(res, show);
});

// POST /api/v1/public-show/verify-admin
exports.verifyAdmin = catchAsync(async (req, res, next) => {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body.password || "");

  const user = await User.findById(req.user._id).select("+password");
  const valid =
    user &&
    email === user.email &&
    password &&
    (await user.correctPassword(password, user.password));

  if (!valid) {
    return next(new AppError("Incorrect admin email or password", 401));
  }

  res.status(200).json({
    status: "success",
    data: { token: createAdminActionToken(user._id.toString()) },
  });
});

// POST /api/v1/public-show/close
exports.closeVoting = catchAsync(async (req, res, next) => {
  if (!requireAdminActionToken(req, next)) return;

  const show = await getOrCreateShow();

  if (show.isOpen) {
    show.isOpen = false;
    show.votingGeneration = (show.votingGeneration || 0) + 1;
    show.closedAt = new Date();
    show.lastChangedBy = req.user._id;
    await show.save();
  }

  await sendControlResponse(res, show);
});

// POST /api/v1/public-show/qr-token
exports.createQrToken = catchAsync(async (req, res, next) => {
  const show = await getOrCreateShow();
  if (!show.isOpen) {
    return next(new AppError("Voting is not open", 409));
  }

  const rawToken = randomToken();
  const publicId = crypto.randomUUID();
  const createdAt = Date.now();
  const displayExpiresAt = new Date(createdAt + QR_DISPLAY_TTL_MS);
  const expiresAt = new Date(createdAt + QR_TOKEN_TTL_MS);

  await PublicQrAccessToken.create({
    publicId,
    tokenHash: hashToken(rawToken),
    expiresAt,
  });

  const admissionUrl = `${getPublicBaseUrl(req)}/public-vote/admit#${rawToken}`;
  const [qrImage, stats] = await Promise.all([
    QRCode.toDataURL(admissionUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 560,
      color: { dark: "#003f67", light: "#ffffff" },
    }),
    getStats(),
  ]);

  setNoStoreHeaders(res);
  res.status(201).json({
    status: "success",
    data: { publicId, displayExpiresAt, expiresAt, qrImage, stats },
  });
});

// GET /api/v1/public-show/qr-token/:publicId/status
exports.getQrTokenStatus = catchAsync(async (req, res) => {
  const [show, token, stats] = await Promise.all([
    getOrCreateShow(),
    PublicQrAccessToken.findOne({ publicId: req.params.publicId }),
    getStats(),
  ]);
  const now = new Date();

  setNoStoreHeaders(res);
  res.status(200).json({
    status: "success",
    data: {
      open: show.isOpen,
      claimed: Boolean(token?.claimedAt),
      expired: !token || token.expiresAt <= now,
      expiresAt: token?.expiresAt || null,
      stats,
    },
  });
});

// GET /api/v1/public-show/results — always available (open or closed) but gated
// behind a freshly re-entered admin password; see verifyAdmin above.
exports.getResultsSummary = catchAsync(async (req, res, next) => {
  if (!requireAdminActionToken(req, next)) return;

  const { results, totalVotes } = await getResults();
  res.status(200).json({ status: "success", data: { results, totalVotes } });
});

// POST /api/v1/public-show/reset-votes — destructive, so gated the same way
// as closing voting. Wipes every vote, session, and QR link so a clean test
// round (or the real show) can start from zero. Groups and the open/closed
// state are left untouched.
exports.resetVotes = catchAsync(async (req, res, next) => {
  if (!requireAdminActionToken(req, next)) return;

  const [{ deletedCount: votesDeleted }, { deletedCount: sessionsDeleted }, { deletedCount: tokensDeleted }] =
    await Promise.all([
      PublicVote.deleteMany({}),
      PublicVotingSession.deleteMany({}),
      PublicQrAccessToken.deleteMany({}),
    ]);

  const show = await getOrCreateShow();
  show.votingGeneration = (show.votingGeneration || 0) + 1;
  await show.save();

  res.status(200).json({
    status: "success",
    data: { votesDeleted, sessionsDeleted, tokensDeleted },
  });
});

// GET /api/v1/public-show/groups
exports.listGroups = catchAsync(async (req, res) => {
  const groups = await getAllGroups();
  res.status(200).json({ status: "success", data: { groups } });
});

// PATCH /api/v1/public-show/groups/:id
exports.updateGroup = catchAsync(async (req, res, next) => {
  const allowedFields = ["title", "description", "status"];
  const unknownFields = Object.keys(req.body).filter(
    (field) => !allowedFields.includes(field),
  );
  if (unknownFields.length > 0) {
    return next(
      new AppError(
        `These fields cannot be updated: ${unknownFields.join(", ")}`,
        400,
      ),
    );
  }

  const group = await PublicShowGroup.findById(req.params.id);
  if (!group) return next(new AppError("No group found with that ID", 404));

  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      group[field] = req.body[field];
    }
  });

  await group.save();
  res.status(200).json({ status: "success", data: { group } });
});

// POST /api/v1/public-show/groups/sync
exports.syncGroups = catchAsync(async (req, res, next) => {
  const { created, missingDirectory } = await syncGroupsFromImages();
  if (missingDirectory) {
    return next(
      new AppError("The show image folder could not be found on the server", 404),
    );
  }

  const groups = await getAllGroups();
  res.status(200).json({
    status: "success",
    data: { createdCount: created.length, groups },
  });
});

/* ==========================================
   ADMIN PAGES
========================================== */

// GET /admin/public-show
// Results are deliberately NOT loaded here — the Results tab fetches them
// client-side only after a fresh admin password check (see verify-admin/results
// above). Embedding them in this render would leak vote counts into the page
// source before anyone unlocks anything.
exports.renderControlPage = catchAsync(async (req, res) => {
  const show = await getOrCreateShow();
  const groups = await getAllGroups();
  const readiness = getReadiness(groups);
  const stats = await getStats();

  res.status(200).render("admin/public-show", {
    pageTitle: "Public IoT Show",
    activeNav: "public-show",
    show,
    state: resolveState(show),
    groups,
    readiness,
    stats,
    categoryName: PUBLIC_SHOW_CATEGORY_NAME,
  });
});

// GET /admin/public-show/qr-display
exports.renderQrDisplay = catchAsync(async (req, res) => {
  const show = await getOrCreateShow();
  const stats = await getStats();

  setNoStoreHeaders(res);
  res.status(200).render("admin/public-show-qr-display", {
    pageTitle: "Public IoT Show QR display",
    state: resolveState(show),
    stats,
    categoryName: PUBLIC_SHOW_CATEGORY_NAME,
  });
});

/* ==========================================
   VISITOR FLOW — public, no auth
========================================== */

// GET /public-vote/admit
exports.renderAdmissionPage = catchAsync(async (req, res) => {
  setNoStoreHeaders(res);
  res.status(200).render("public-voting/admit", {
    pageTitle: "Checking voting access",
  });
});

// POST /api/v1/public-voting/admit
exports.claimAdmission = catchAsync(async (req, res, next) => {
  const show = await getOrCreateShow();
  if (!show.isOpen) {
    return next(new AppError("Voting is not currently open", 409));
  }

  const admissionToken = String(req.body.token || "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(admissionToken)) {
    return next(new AppError("This QR code is invalid or has expired", 401));
  }

  const now = new Date();
  const claimedToken = await PublicQrAccessToken.findOneAndUpdate(
    {
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
      data: { redirectUrl: "/public-vote" },
    });
  };

  const { rawToken: existingRawToken, session: existingSession } =
    await findBrowserSession(req);
  if (existingSession) {
    const existingVote = await PublicVote.exists({
      votingSession: existingSession._id,
    });
    if (existingSession.status === "VOTED" || existingVote) {
      return redirectWithSession(existingSession);
    }

    if (
      existingSession.expiresAt > new Date() &&
      existingSession.votingGeneration === (show.votingGeneration || 0)
    ) {
      return redirectWithSession(existingSession);
    }

    if (existingRawToken) clearSessionCookie(res);
  }

  const refreshedShow = await getOrCreateShow();
  if (!refreshedShow.isOpen) {
    return next(new AppError("Voting has closed", 409));
  }

  const sessionToken = randomToken();
  const session = await PublicVotingSession.create({
    sessionTokenHash: hashToken(sessionToken),
    votingGeneration: refreshedShow.votingGeneration || 0,
    expiresAt: new Date(Date.now() + VOTING_SESSION_TTL_MS),
  });
  claimedToken.claimedSession = session._id;
  await claimedToken.save();

  res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions());
  setNoStoreHeaders(res);
  res.status(201).json({
    status: "success",
    data: { redirectUrl: "/public-vote" },
  });
});

// GET /public-vote
exports.renderVotingPage = catchAsync(async (req, res) => {
  const show = await getOrCreateShow();
  const { rawToken, session } = await findBrowserSession(req);
  setNoStoreHeaders(res);

  const baseData = {
    pageTitle: "Public IoT Show voting",
    groups: [],
    categoryName: PUBLIC_SHOW_CATEGORY_NAME,
    csrfToken: null,
    splashKey: null,
    votedGroupId: null,
  };

  if (!rawToken || !session) {
    clearSessionCookie(res);
    return res.status(403).render("public-voting/page", {
      ...baseData,
      pageState: "NO_ACCESS",
    });
  }

  const existingVote = await PublicVote.findOne({
    votingSession: session._id,
  }).select("group");
  if (session.status === "VOTED" || existingVote) {
    if (session.status !== "VOTED") {
      await PublicVotingSession.updateOne(
        { _id: session._id },
        { status: "VOTED", votedAt: new Date() },
      );
    }
    const groups = await getActiveGroups();
    return res.status(200).render("public-voting/page", {
      ...baseData,
      pageState: "VOTED",
      groups,
      votedGroupId: existingVote?.group?.toString() || null,
    });
  }

  if (
    session.expiresAt <= new Date() ||
    session.votingGeneration !== (show.votingGeneration || 0)
  ) {
    clearSessionCookie(res);
    return res.status(403).render("public-voting/page", {
      ...baseData,
      pageState: "EXPIRED",
    });
  }

  if (!show.isOpen) {
    return res.status(200).render("public-voting/page", {
      ...baseData,
      pageState: "CLOSED",
    });
  }

  const groups = await getActiveGroups();
  return res.status(200).render("public-voting/page", {
    ...baseData,
    pageState: "OPEN",
    groups,
    csrfToken: createCsrfToken(rawToken),
    splashKey: hashToken(`public-vote-pass:${rawToken}`).slice(0, 24),
  });
});

// POST /api/v1/public-voting/votes
exports.submitVote = catchAsync(async (req, res, next) => {
  const show = await getOrCreateShow();
  const { rawToken, session } = await findBrowserSession(req);

  if (!rawToken || !session) {
    return next(new AppError("A valid voting session is required", 401));
  }

  const existingVote = await PublicVote.exists({ votingSession: session._id });
  if (session.status === "VOTED" || existingVote) {
    return next(new AppError("This voting session has already voted", 409));
  }
  if (
    session.expiresAt <= new Date() ||
    session.votingGeneration !== (show.votingGeneration || 0)
  ) {
    return next(new AppError("This voting session has expired", 401));
  }
  if (!validCsrfToken(rawToken, req.get("x-vote-csrf"))) {
    return next(new AppError("Invalid voting request", 403));
  }
  if (!show.isOpen) {
    return next(new AppError("Voting is closed", 409));
  }

  const groupId = String(req.body.group || "");
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return next(new AppError("Please choose a group to vote for", 400));
  }

  const group = await PublicShowGroup.findOne({
    _id: groupId,
    status: "ACTIVE",
  });
  if (!group) {
    return next(new AppError("Please choose a valid group", 400));
  }

  let vote;
  try {
    vote = await PublicVote.create({
      votingSession: session._id,
      group: group._id,
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
