const mongoose = require("mongoose");

const qrAccessTokenSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "A QR token must belong to a project"],
    },

    publicId: {
      type: String,
      required: true,
      unique: true,
    },

    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    claimedAt: {
      type: Date,
      default: null,
    },

    claimedSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VotingSession",
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "qrAccessTokens",
  },
);

qrAccessTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
qrAccessTokenSchema.index({ project: 1, claimedAt: 1, expiresAt: 1 });

const QrAccessToken = mongoose.model("QrAccessToken", qrAccessTokenSchema);

module.exports = QrAccessToken;
