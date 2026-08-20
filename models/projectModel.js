const mongoose = require("mongoose");

const votingCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "A voting category must have a name"],
      trim: true,
    },

    description: {
      type: String,
      required: [true, "A voting category must have a description"],
      trim: true,
    },
  },
  { _id: true },
);

const projectShowSchema = new mongoose.Schema(
  {
    startDate: {
      type: Date,
      default: null,
    },

    startTime: {
      type: String,
      trim: true,
      default: null,
    },

    endTime: {
      type: String,
      trim: true,
      default: null,
    },

    location: {
      campus: {
        type: String,
        trim: true,
        default: null,
      },

      floor: {
        type: String,
        trim: true,
        default: null,
      },

      room: {
        type: String,
        trim: true,
        default: null,
      },
    },

    votingCategories: {
      type: [votingCategorySchema],
      default: [],
    },

    isPublished: {
      type: Boolean,
      default: false,
    },

    publishedAt: {
      type: Date,
      default: null,
    },

    votingMode: {
      type: String,
      enum: {
        values: ["SCHEDULED", "FORCED_OPEN", "FORCED_CLOSED"],
        message:
          "Voting mode must be SCHEDULED, FORCED_OPEN, or FORCED_CLOSED",
      },
      default: "SCHEDULED",
    },

    // Incrementing this invalidates every unsubmitted session from an older voting window.
    votingGeneration: {
      type: Number,
      min: 0,
      default: 0,
    },

    votingModeChangedAt: {
      type: Date,
      default: null,
    },

    votingModeChangedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: false },
);

const projectSchema = new mongoose.Schema(
  {
    batch: {
      type: String,
      required: [true, "A project must have a batch"],
      trim: true,
      uppercase: true,
      match: [/^HND-\d+$/, "Batch must follow the format HND-57"],
      unique: true,
    },

    projectManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "A project must have a project manager"],
    },

    projectStartDate: {
      type: Date,
      required: [true, "A project must have a project start date"],
    },

    theme: {
      type: String,
      trim: true,
      default: null,
    },

    status: {
      type: String,
      enum: {
        values: ["DRAFT", "ACTIVE", "COMPLETED"],
        message: "Status must be DRAFT, ACTIVE, or COMPLETED",
      },
      default: "DRAFT",
      required: true,
    },

    // A project always has one show. Its details can be completed later by the manager.
    projectShow: {
      type: projectShowSchema,
      default: () => ({}),
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "projects",
  },
);

const Project = mongoose.model("Project", projectSchema);

module.exports = Project;
