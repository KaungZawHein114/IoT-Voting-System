// Helpers for the manual post-event vote review screen. Pure and DB-free so
// they're directly unit-testable — no new data is collected here, this just
// makes existing repeats (same name + batch on more than one vote) visible
// instead of collecting anything further about the voter.

const normalizeVoterKey = (voterName, batchType, batchNumber) => {
  if (!voterName) return null;
  const normalizedName = String(voterName).trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalizedName) return null;
  return `${normalizedName}::${batchType}::${batchNumber}`;
};

/**
 * @param {Array<{voterName: *, batchType: *, batchNumber: *}>} voters
 * @returns {number[]} how many entries (including itself) share that voter's
 *   normalized name+batch, aligned by index with the input array. Entries
 *   with no usable name (e.g. legacy votes predating this field) get 1, so
 *   they're never flagged as duplicates of each other.
 */
const countDuplicateVoters = (voters) => {
  const keys = voters.map((voter) =>
    normalizeVoterKey(voter.voterName, voter.batchType, voter.batchNumber),
  );

  const counts = new Map();
  for (const key of keys) {
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }

  return keys.map((key) => (key ? counts.get(key) : 1));
};

module.exports = { normalizeVoterKey, countDuplicateVoters };
