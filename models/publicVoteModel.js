const mongoose = require("mongoose");

const publicVoteSchema = new mongoose.Schema(
  {
    votingSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PublicVotingSession",
      required: [true, "A vote must belong to a voting session"],
      unique: true,
    },

    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PublicShowGroup",
      required: [true, "A vote must have a group"],
    },
  },
  {
    timestamps: true,
    collection: "publicVotes",
  },
);

const PublicVote = mongoose.model("PublicVote", publicVoteSchema);

module.exports = PublicVote;
