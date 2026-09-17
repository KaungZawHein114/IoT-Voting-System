// Server-side validation for the voter-identification fields collected
// after admission and before a vote is recorded (name + batch). This exists
// purely for manual, human/event-manager review after the event — it is not
// a technical one-human-one-vote guarantee, so it deliberately does not
// touch session/device binding logic.
const { BATCH_TYPES } = require("../utils/batchTypes");

const MAX_VOTER_NAME_LENGTH = 100;

const validateVoterName = (value) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return { valid: false, error: "Voter name is required" };
  if (trimmed.length > MAX_VOTER_NAME_LENGTH) {
    return {
      valid: false,
      error: `Voter name must be ${MAX_VOTER_NAME_LENGTH} characters or fewer`,
    };
  }
  return { valid: true, value: trimmed };
};

const validateBatchType = (value) => {
  if (!BATCH_TYPES.includes(value)) {
    return { valid: false, error: "Invalid batch type" };
  }
  return { valid: true, value };
};

const validateBatchNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return { valid: false, error: "Batch number is required" };
  }
  // Reject booleans/arrays etc. up front — Number(true) is 1, which would
  // otherwise slip through as a "valid" batch number.
  if (typeof value !== "number" && typeof value !== "string") {
    return { valid: false, error: "Batch number must be a positive whole number" };
  }
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < 1) {
    return { valid: false, error: "Batch number must be a positive whole number" };
  }
  return { valid: true, value: number };
};

/**
 * @param {object} input
 * @param {*} input.voterName
 * @param {*} input.batchType
 * @param {*} input.batchNumber
 * @returns {{valid:true, voterName:string, batchType:string, batchNumber:number}|{valid:false, error:string}}
 */
const validateVoterInfo = ({ voterName, batchType, batchNumber } = {}) => {
  const nameResult = validateVoterName(voterName);
  if (!nameResult.valid) return { valid: false, error: nameResult.error };

  const batchTypeResult = validateBatchType(batchType);
  if (!batchTypeResult.valid) return { valid: false, error: batchTypeResult.error };

  const batchNumberResult = validateBatchNumber(batchNumber);
  if (!batchNumberResult.valid) return { valid: false, error: batchNumberResult.error };

  return {
    valid: true,
    voterName: nameResult.value,
    batchType: batchTypeResult.value,
    batchNumber: batchNumberResult.value,
  };
};

module.exports = {
  BATCH_TYPES,
  MAX_VOTER_NAME_LENGTH,
  validateVoterInfo,
};
