const mongoose = require("mongoose");

const publicVotingSessionSchema = new mongoose.Schema(
  {
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
    collection: "publicVotingSessions",
  },
);

publicVotingSessionSchema.index({ status: 1 });

const PublicVotingSession = mongoose.model(
  "PublicVotingSession",
  publicVotingSessionSchema,
);

module.exports = PublicVotingSession;
