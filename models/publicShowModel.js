const mongoose = require("mongoose");

const publicShowSchema = new mongoose.Schema(
  {
    isOpen: {
      type: Boolean,
      default: false,
    },

    // Incrementing this invalidates every unsubmitted session from an older voting window.
    votingGeneration: {
      type: Number,
      min: 0,
      default: 0,
    },

    openedAt: {
      type: Date,
      default: null,
    },

    closedAt: {
      type: Date,
      default: null,
    },

    lastChangedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "publicShow",
  },
);

const PublicShow = mongoose.model("PublicShow", publicShowSchema);

module.exports = PublicShow;
