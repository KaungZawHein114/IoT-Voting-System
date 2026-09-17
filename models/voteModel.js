const mongoose = require("mongoose");

const { BATCH_TYPES } = require("../utils/batchTypes");
const { MAX_VOTER_NAME_LENGTH } = require("../services/voterInfoService");

const voteSelectionSchema = new mongoose.Schema(
  {
    votingCategory: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "A selection must have a voting category"],
    },

    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: [true, "A selection must have a group"],
    },
  },
  { _id: false },
);

const voteSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "A vote must belong to a project"],
    },

    votingSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VotingSession",
      required: [true, "A vote must belong to a voting session"],
    },

    selections: {
      type: [voteSelectionSchema],
      required: [true, "A vote must have selections"],
      validate: {
        validator: (selections) => selections.length > 0,
        message: "A vote must have at least one selection",
      },
    },

    // Self-reported by the voter after admission, for manual post-event
    // review only — not a technical identity/anti-fraud mechanism.
    voterName: {
      type: String,
      required: [true, "A vote must include the voter's name"],
      trim: true,
      maxlength: [
        MAX_VOTER_NAME_LENGTH,
        `Voter name must be ${MAX_VOTER_NAME_LENGTH} characters or fewer`,
      ],
    },

    batchType: {
      type: String,
      required: [true, "A vote must include the voter's batch type"],
      enum: {
        values: BATCH_TYPES,
        message: "Invalid batch type",
      },
    },

    batchNumber: {
      type: Number,
      required: [true, "A vote must include the voter's batch number"],
      min: [1, "Batch number must be a positive whole number"],
      validate: {
        validator: Number.isInteger,
        message: "Batch number must be a whole number",
      },
    },
  },
  {
    timestamps: true,
    collection: "votes",
  },
);

voteSchema.index({ project: 1, votingSession: 1 }, { unique: true });

const Vote = mongoose.model("Vote", voteSchema);

module.exports = Vote;
