const mongoose = require("mongoose");

// Minimal audit trail for manual post-event vote deletions — no existing
// audit subsystem to hook into, so this stays intentionally small: who
// deleted what, when, and a snapshot of the removed vote (the vote document
// itself is gone once deleted, so the snapshot is the only remaining record).
const voteDeletionLogSchema = new mongoose.Schema(
  {
    vote: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "A deletion log must reference the deleted vote"],
    },

    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "A deletion log must reference the project"],
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "A deletion log must record who deleted the vote"],
    },

    deletedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },

    snapshot: {
      voterName: String,
      batchType: String,
      batchNumber: Number,
      selections: [
        {
          _id: false,
          votingCategory: mongoose.Schema.Types.ObjectId,
          group: mongoose.Schema.Types.ObjectId,
        },
      ],
    },
  },
  {
    collection: "voteDeletionLogs",
  },
);

const VoteDeletionLog = mongoose.model("VoteDeletionLog", voteDeletionLogSchema);

module.exports = VoteDeletionLog;
