const fs = require("fs");
const path = require("path");

const PublicShow = require("../models/publicShowModel");
const PublicShowGroup = require("../models/publicShowGroupModel");
const PublicVotingSession = require("../models/publicVotingSessionModel");
const PublicVote = require("../models/publicVoteModel");

const PUBLIC_SHOW_STATES = Object.freeze({
  OPEN: "OPEN",
  CLOSED: "CLOSED",
});

const PUBLIC_SHOW_CATEGORY_NAME = "People's Choice Award";

const IMAGE_FOLDER_NAME = "Aug 23 Public Show";
const IMAGE_DIRECTORY = path.join(
  __dirname,
  "..",
  "public",
  "images",
  IMAGE_FOLDER_NAME,
);
const IMAGE_URL_PREFIX = `/assets/images/${IMAGE_FOLDER_NAME}`;
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const humanizeFileName = (fileName) =>
  path
    .basename(fileName, path.extname(fileName))
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

const getOrCreateShow = async () =>
  PublicShow.findOneAndUpdate(
    {},
    { $setOnInsert: {} },
    { new: true, upsert: true },
  );

const resolveState = (show) =>
  show.isOpen ? PUBLIC_SHOW_STATES.OPEN : PUBLIC_SHOW_STATES.CLOSED;

const getAllGroups = async () =>
  PublicShowGroup.find().sort({ groupNumber: 1 });

const getActiveGroups = async () =>
  PublicShowGroup.find({ status: "ACTIVE" }).sort({ groupNumber: 1 });

const getReadiness = (groups) => {
  const activeGroups = groups.filter((group) => group.status === "ACTIVE");
  const missing = [];
  if (activeGroups.length < 2) missing.push("At least 2 active groups");

  return { ready: missing.length === 0, missing, activeGroups };
};

const getStats = async () => {
  const [scannedCount, votedCount] = await Promise.all([
    PublicVotingSession.countDocuments(),
    PublicVote.countDocuments(),
  ]);

  return {
    scannedCount,
    votedCount,
    waitingCount: Math.max(scannedCount - votedCount, 0),
  };
};

const getResults = async () => {
  const [groups, voteCounts] = await Promise.all([
    PublicShowGroup.find().sort({ groupNumber: 1 }),
    PublicVote.aggregate([{ $group: { _id: "$group", count: { $sum: 1 } } }]),
  ]);

  const counts = new Map(
    voteCounts.map((item) => [item._id.toString(), item.count]),
  );
  const totalVotes = voteCounts.reduce((sum, item) => sum + item.count, 0);

  const results = groups.map((group) => ({
    id: group._id.toString(),
    groupNumber: group.groupNumber,
    title: group.title,
    image: group.image,
    status: group.status,
    voteCount: counts.get(group._id.toString()) || 0,
  }));

  results.sort(
    (a, b) => b.voteCount - a.voteCount || a.groupNumber - b.groupNumber,
  );

  return { results, totalVotes };
};

const getNextGroupNumber = async () => {
  const lastGroup = await PublicShowGroup.findOne().sort({ groupNumber: -1 });
  return lastGroup ? lastGroup.groupNumber + 1 : 1;
};

// Additive only: creates a group for every image file not already represented.
// Never renames, deactivates, or deletes an existing group.
const syncGroupsFromImages = async () => {
  let files;
  try {
    files = fs.readdirSync(IMAGE_DIRECTORY);
  } catch (error) {
    return { created: [], missingDirectory: true };
  }

  const imageFiles = files
    .filter((file) =>
      ALLOWED_IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()),
    )
    .sort((a, b) => a.localeCompare(b));

  const existingGroups = await PublicShowGroup.find().select("sourceFile");
  const existingSourceFiles = new Set(
    existingGroups.map((group) => group.sourceFile).filter(Boolean),
  );

  const created = [];
  let nextGroupNumber = await getNextGroupNumber();

  for (const file of imageFiles) {
    if (existingSourceFiles.has(file)) continue;

    const group = await PublicShowGroup.create({
      groupNumber: nextGroupNumber,
      title: humanizeFileName(file) || file,
      image: `${IMAGE_URL_PREFIX}/${file}`,
      sourceFile: file,
    });
    created.push(group);
    nextGroupNumber += 1;
  }

  return { created, missingDirectory: false };
};

module.exports = {
  PUBLIC_SHOW_STATES,
  PUBLIC_SHOW_CATEGORY_NAME,
  getOrCreateShow,
  resolveState,
  getAllGroups,
  getActiveGroups,
  getReadiness,
  getStats,
  getResults,
  syncGroupsFromImages,
};
