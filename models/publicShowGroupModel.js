const mongoose = require("mongoose");

const publicShowGroupSchema = new mongoose.Schema(
  {
    groupNumber: {
      type: Number,
      required: [true, "A group must have a group number"],
      min: [1, "Group number must be at least 1"],
      unique: true,
    },

    title: {
      type: String,
      required: [true, "A group must have a title"],
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: [1200, "A group description cannot exceed 1200 characters"],
      default: "",
    },

    image: {
      type: String,
      required: [true, "A group must have an image"],
      trim: true,
    },

    // The source filename in the show image folder. Lets re-sync skip groups that already exist.
    sourceFile: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },

    status: {
      type: String,
      enum: {
        values: ["ACTIVE", "INACTIVE"],
        message: "Group status must be ACTIVE or INACTIVE",
      },
      default: "ACTIVE",
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "publicShowGroups",
  },
);

const PublicShowGroup = mongoose.model(
  "PublicShowGroup",
  publicShowGroupSchema,
);

module.exports = PublicShowGroup;
