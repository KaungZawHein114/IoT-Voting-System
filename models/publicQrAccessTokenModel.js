const mongoose = require("mongoose");

const publicQrAccessTokenSchema = new mongoose.Schema(
  {
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
      ref: "PublicVotingSession",
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "publicQrAccessTokens",
  },
);

publicQrAccessTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
publicQrAccessTokenSchema.index({ claimedAt: 1, expiresAt: 1 });

const PublicQrAccessToken = mongoose.model(
  "PublicQrAccessToken",
  publicQrAccessTokenSchema,
);

module.exports = PublicQrAccessToken;
