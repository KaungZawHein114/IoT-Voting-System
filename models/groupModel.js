const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "A group must belong to a project"],
    },

    groupNumber: {
      type: Number,
      required: [true, "A group must have a group number"],
      min: [1, "Group number must be at least 1"],
    },

    members: {
      type: [{ type: String, trim: true }],
      required: [true, "A group must have members"],
      validate: {
        validator: (members) => members.length > 0,
        message: "A group must have at least 1 member",
      },
    },

    title: {
      type: String,
      required: [true, "A group must have a project title"],
      trim: true,
    },

    description: {
      type: String,
      required: [true, "A group must have a project description"],
      trim: true,
      maxlength: [1200, "A group description cannot exceed 1200 characters"],
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

    images: {
      type: [
        {
          type: String,
          trim: true,
        },
      ],
      default: [],
      validate: {
        validator: (images) => images.length <= 3,
        message: "A group can have at most 3 images",
      },
    },
  },
  {
    timestamps: true,
    collection: "groups",
  },
);

groupSchema.index({ project: 1, groupNumber: 1 }, { unique: true });

const Group = mongoose.model("Group", groupSchema);

module.exports = Group;
