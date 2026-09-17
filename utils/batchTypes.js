// The seven batch/cohort categories a voter can identify themselves with.
// Shared by the Vote model (schema enum) and the voter-info validation
// service so there is exactly one place that defines the allowed list.
const BATCH_TYPES = Object.freeze([
  "HND-COMPUTING",
  "HND-BUSINESS",
  "GED",
  "IGCSE",
  "UoS-Cohort",
  "GUF",
  "Level-3",
]);

module.exports = { BATCH_TYPES };
