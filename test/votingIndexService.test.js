const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getLegacyVoteIndexNames,
} = require("../services/votingIndexService");

test("only obsolete vote indexes are selected for cleanup", () => {
  const indexes = [
    { name: "_id_" },
    { name: "sessionID_1" },
    { name: "sessionID_1_projectShowID_1_groupID_1_categoryID_1" },
    { name: "votingSession_1" },
    { name: "project_1_votingSession_1" },
  ];

  assert.deepEqual(getLegacyVoteIndexNames(indexes), [
    "sessionID_1",
    "sessionID_1_projectShowID_1_groupID_1_categoryID_1",
    "votingSession_1",
  ]);
});
