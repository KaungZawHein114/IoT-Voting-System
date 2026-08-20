const Vote = require("../models/voteModel");

const LEGACY_VOTE_INDEXES = new Set([
  "sessionID_1",
  "sessionID_1_projectShowID_1_groupID_1_categoryID_1",
  "votingSession_1",
]);

const getLegacyVoteIndexNames = (indexes = []) =>
  indexes
    .map((index) => index.name)
    .filter((name) => LEGACY_VOTE_INDEXES.has(name));

const cleanupLegacyVoteIndexes = async () => {
  const indexes = await Vote.collection.indexes();
  const legacyIndexNames = getLegacyVoteIndexNames(indexes);

  for (const indexName of legacyIndexNames) {
    await Vote.collection.dropIndex(indexName);
  }

  await Vote.createIndexes();
  return legacyIndexNames;
};

module.exports = {
  cleanupLegacyVoteIndexes,
  getLegacyVoteIndexNames,
};
