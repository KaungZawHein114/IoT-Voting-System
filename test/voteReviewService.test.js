const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeVoterKey, countDuplicateVoters } = require("../services/voteReviewService");

test("normalizeVoterKey folds case and collapses whitespace", () => {
  assert.equal(
    normalizeVoterKey("John Doe", "HND-COMPUTING", 55),
    normalizeVoterKey("john   doe", "HND-COMPUTING", 55),
  );
  assert.equal(
    normalizeVoterKey("  Aye Aye  ", "GED", 5),
    normalizeVoterKey("Aye Aye", "GED", 5),
  );
});

test("normalizeVoterKey treats different batches as different voters", () => {
  assert.notEqual(
    normalizeVoterKey("John Doe", "HND-COMPUTING", 55),
    normalizeVoterKey("John Doe", "HND-COMPUTING", 56),
  );
  assert.notEqual(
    normalizeVoterKey("John Doe", "HND-COMPUTING", 55),
    normalizeVoterKey("John Doe", "HND-BUSINESS", 55),
  );
});

test("normalizeVoterKey returns null for a missing/blank name", () => {
  assert.equal(normalizeVoterKey(null, "GED", 5), null);
  assert.equal(normalizeVoterKey(undefined, "GED", 5), null);
  assert.equal(normalizeVoterKey("   ", "GED", 5), null);
});

test("a single unique voter is not flagged as a duplicate", () => {
  const counts = countDuplicateVoters([
    { voterName: "Aye Aye", batchType: "GED", batchNumber: 5 },
  ]);
  assert.deepEqual(counts, [1]);
});

test("votes sharing the same name and batch are all counted as duplicates", () => {
  const voters = [
    { voterName: "Aye Aye", batchType: "GED", batchNumber: 5 },
    { voterName: "aye  aye", batchType: "GED", batchNumber: 5 },
    { voterName: "AYE AYE", batchType: "GED", batchNumber: 5 },
  ];
  assert.deepEqual(countDuplicateVoters(voters), [3, 3, 3]);
});

test("same name but a different batch number is NOT flagged as a duplicate", () => {
  const voters = [
    { voterName: "Aye Aye", batchType: "GED", batchNumber: 5 },
    { voterName: "Aye Aye", batchType: "GED", batchNumber: 6 },
  ];
  assert.deepEqual(countDuplicateVoters(voters), [1, 1]);
});

test("two different voters are never counted against each other", () => {
  const voters = [
    { voterName: "Aye Aye", batchType: "GED", batchNumber: 5 },
    { voterName: "Zin Zin", batchType: "GED", batchNumber: 5 },
  ];
  assert.deepEqual(countDuplicateVoters(voters), [1, 1]);
});

test("votes with no name (e.g. legacy pre-migration votes) are never flagged against each other", () => {
  const voters = [
    { voterName: null, batchType: null, batchNumber: null },
    { voterName: undefined, batchType: null, batchNumber: null },
    { voterName: "", batchType: null, batchNumber: null },
  ];
  assert.deepEqual(countDuplicateVoters(voters), [1, 1, 1]);
});

test("a mix of unique, duplicate, and nameless votes is handled correctly together", () => {
  const voters = [
    { voterName: "Aye Aye", batchType: "GED", batchNumber: 5 }, // dup A
    { voterName: "Zin Zin", batchType: "IGCSE", batchNumber: 2 }, // unique
    { voterName: null, batchType: null, batchNumber: null }, // legacy/nameless
    { voterName: "Aye Aye", batchType: "GED", batchNumber: 5 }, // dup A
  ];
  assert.deepEqual(countDuplicateVoters(voters), [2, 1, 1, 2]);
});
