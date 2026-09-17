const test = require("node:test");
const assert = require("node:assert/strict");

const { BATCH_TYPES, validateVoterInfo } = require("../services/voterInfoService");

const validInput = () => ({
  voterName: "Aye Aye",
  batchType: "HND-COMPUTING",
  batchNumber: 55,
});

test("missing voter name is rejected", () => {
  const result = validateVoterInfo({ ...validInput(), voterName: undefined });
  assert.equal(result.valid, false);
  assert.match(result.error, /name/i);
});

test("empty/whitespace-only voter name is rejected", () => {
  const result = validateVoterInfo({ ...validInput(), voterName: "   " });
  assert.equal(result.valid, false);
  assert.match(result.error, /name/i);
});

test("voter name longer than the max length is rejected", () => {
  const result = validateVoterInfo({
    ...validInput(),
    voterName: "a".repeat(101),
  });
  assert.equal(result.valid, false);
  assert.match(result.error, /100/);
});

test("voter name is trimmed before being stored", () => {
  const result = validateVoterInfo({ ...validInput(), voterName: "  Aye Aye  " });
  assert.equal(result.valid, true);
  assert.equal(result.voterName, "Aye Aye");
});

test("invalid batch type is rejected", () => {
  const result = validateVoterInfo({ ...validInput(), batchType: "HND-57" });
  assert.equal(result.valid, false);
  assert.match(result.error, /batch type/i);
});

test("batch type is case-sensitive and rejects lowercase variants", () => {
  const result = validateVoterInfo({ ...validInput(), batchType: "hnd-computing" });
  assert.equal(result.valid, false);
});

test("zero batch number is rejected", () => {
  const result = validateVoterInfo({ ...validInput(), batchNumber: 0 });
  assert.equal(result.valid, false);
  assert.match(result.error, /positive/i);
});

test("negative batch number is rejected", () => {
  const result = validateVoterInfo({ ...validInput(), batchNumber: -5 });
  assert.equal(result.valid, false);
});

test("decimal batch number is rejected", () => {
  const result = validateVoterInfo({ ...validInput(), batchNumber: 5.5 });
  assert.equal(result.valid, false);
});

test("decimal batch number sent as a string is rejected", () => {
  const result = validateVoterInfo({ ...validInput(), batchNumber: "5.5" });
  assert.equal(result.valid, false);
});

test("non-numeric batch number is rejected", () => {
  const result = validateVoterInfo({ ...validInput(), batchNumber: "abc" });
  assert.equal(result.valid, false);
});

test("missing batch number is rejected", () => {
  const result = validateVoterInfo({ ...validInput(), batchNumber: undefined });
  assert.equal(result.valid, false);
});

test("a boolean batch number is rejected rather than coerced to 1", () => {
  const result = validateVoterInfo({ ...validInput(), batchNumber: true });
  assert.equal(result.valid, false);
});

test("every documented batch type is accepted with a valid positive integer number", () => {
  for (const batchType of BATCH_TYPES) {
    const result = validateVoterInfo({
      voterName: "Voter",
      batchType,
      batchNumber: 7,
    });
    assert.equal(result.valid, true, `expected ${batchType} to be accepted`);
    assert.equal(result.batchType, batchType);
    assert.equal(result.batchNumber, 7);
  }
});

test("a batch number sent as a numeric string is accepted and normalized to a number", () => {
  const result = validateVoterInfo({ ...validInput(), batchNumber: "55" });
  assert.equal(result.valid, true);
  assert.equal(result.batchNumber, 55);
  assert.equal(typeof result.batchNumber, "number");
});

test("a fully valid submission returns exactly the fields to persist on the vote", () => {
  const result = validateVoterInfo(validInput());
  assert.deepEqual(result, {
    valid: true,
    voterName: "Aye Aye",
    batchType: "HND-COMPUTING",
    batchNumber: 55,
  });
});

test("BATCH_TYPES exposes exactly the seven documented categories", () => {
  assert.deepEqual(BATCH_TYPES, [
    "HND-COMPUTING",
    "HND-BUSINESS",
    "GED",
    "IGCSE",
    "UoS-Cohort",
    "GUF",
    "Level-3",
  ]);
});
