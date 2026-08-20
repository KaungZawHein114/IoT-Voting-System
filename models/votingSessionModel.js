const mongoose = require("mongoose");

const votingSessionSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "A voting session must belong to a project"],
    },

    sessionTokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },

    votingGeneration: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: {
        values: ["ADMITTED", "VOTED"],
        message: "Voting session status must be ADMITTED or VOTED",
      },
      default: "ADMITTED",
      required: true,
    },

    admittedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },

    votedAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "votingSessions",
  },
);

votingSessionSchema.index({ project: 1, status: 1 });
votingSessionSchema.index({ project: 1, admittedAt: -1 });

const VotingSession = mongoose.model("VotingSession", votingSessionSchema);

module.exports = VotingSession;
