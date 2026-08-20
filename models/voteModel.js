const mongoose = require("mongoose");

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
  },
  {
    timestamps: true,
    collection: "votes",
  },
);

voteSchema.index({ project: 1, votingSession: 1 }, { unique: true });

const Vote = mongoose.model("Vote", voteSchema);

module.exports = Vote;
