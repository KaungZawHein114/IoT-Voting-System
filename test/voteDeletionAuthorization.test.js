const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.JWT_SECRET ||= "vote-deletion-test-secret";

// deleteVote (controllers/votingController.js) authorizes exactly the way
// every other voting-control action does: findProjectById + ensureControlAccess.
// These tests exercise that shared gate directly, since deleteVote has no
// authorization logic of its own beyond it.
const { ensureControlAccess } = require("../controllers/votingController");

const managerId = "507f1f77bcf86cd799439011";
const otherManagerId = "507f1f77bcf86cd799439012";

const projectFor = (managerId) => ({ projectManager: managerId });

const readDeleteVoteBody = () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../controllers/votingController.js"),
    "utf8",
  );
  return source.slice(source.indexOf("exports.deleteVote"));
};

test("an admin can act on any project's votes regardless of its manager", () => {
  const project = projectFor(otherManagerId);
  const admin = { role: "ADMIN", _id: managerId };
  assert.doesNotThrow(() => ensureControlAccess(project, admin));
});

test("the assigned project manager can act on their own project's votes", () => {
  const project = projectFor(managerId);
  const manager = { role: "MANAGER", _id: managerId };
  assert.doesNotThrow(() => ensureControlAccess(project, manager));
});

test("a manager who is not assigned to the project cannot delete its votes", () => {
  const project = projectFor(managerId);
  const otherManager = { role: "MANAGER", _id: otherManagerId };
  assert.throws(
    () => ensureControlAccess(project, otherManager),
    /assigned project manager/i,
  );
});

test("a manager assigned to no project at all is rejected, not silently allowed", () => {
  const project = { projectManager: null };
  const manager = { role: "MANAGER", _id: managerId };
  assert.throws(() => ensureControlAccess(project, manager));
});

test(
  "deleteVote looks up the vote scoped by both its id AND the project id, " +
    "so deleting one vote cannot reach a vote belonging to a different project",
  () => {
    // No MongoDB test harness exists in this repo (see votingService.test.js /
    // deviceBindingService.test.js for the same constraint), so this checks
    // the actual guarantee structurally: deleteVote must use a compound
    // {_id, project} filter — an unscoped findById(voteId) would let any
    // authorized caller delete a vote belonging to a project they don't
    // control, and would make "unrelated votes stay untouched" false.
    assert.match(
      readDeleteVoteBody(),
      /Vote\.findOne\(\s*\{\s*_id:\s*req\.params\.voteId,\s*project:\s*project\._id,?\s*\}\s*\)/,
    );
  },
);

test(
  "deleteVote deletes the vote BEFORE writing the audit log, " +
    "so a failed deletion can never leave behind a false 'deleted' log entry",
  () => {
    const body = readDeleteVoteBody();
    const deleteIndex = body.indexOf("vote.deleteOne()");
    const logIndex = body.indexOf("VoteDeletionLog.create(");
    assert.notEqual(deleteIndex, -1, "expected deleteVote to call vote.deleteOne()");
    assert.notEqual(logIndex, -1, "expected deleteVote to call VoteDeletionLog.create()");
    assert.ok(
      deleteIndex < logIndex,
      "vote.deleteOne() must run before VoteDeletionLog.create() " +
        "so the log is only ever written for a deletion that actually happened",
    );
  },
);
