const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const validator = require("validator");

const SALT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    /* SECTION-A: Account Identity */
    fullName: {
      type: String,
      required: [true, "Please enter the user's full name"],
      trim: true,
      maxlength: [100, "Full name cannot be more than 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Please enter an email address"],
      unique: true,
      lowercase: true,
      trim: true,
      validate: [validator.isEmail, "Please provide a valid email address"],
    },

    /* SECTION-B: Authentication */
    password: {
      type: String,
      required: [true, "Please enter a password"],
      minlength: [8, "Password must be at least 8 characters long"],
      select: false,
    },
    passwordChangedAt: Date,
    // Invalidates existing JWTs after an admin changes the account status.
    sessionInvalidatedAt: Date,
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },

    /* SECTION-C: Access Control */
    role: {
      type: String,
      enum: {
        values: ["ADMIN", "MANAGER"],
        message: "Role must be ADMIN or MANAGER",
      },
      default: "MANAGER",
      required: true,
    },
    status: {
      type: String,
      enum: {
        values: ["ACTIVE", "DISABLED"],
        message: "Status must be ACTIVE or DISABLED",
      },
      default: "ACTIVE",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

/* INDEXES */
userSchema.index({ role: 1, status: 1 });

/* PRE-SAVE HOOKS */
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  // Makes an already-issued JWT invalid after a password change.
  this.passwordChangedAt = new Date(Date.now() - 1000);
});

/* INSTANCE METHODS */
userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword,
) {
  return bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  const invalidationDates = [
    this.passwordChangedAt,
    this.sessionInvalidatedAt,
  ].filter(Boolean);
  if (invalidationDates.length === 0) return false;

  const latestInvalidation = new Date(
    Math.max(...invalidationDates.map((date) => date.getTime())),
  );
  const changedTimestamp = parseInt(latestInvalidation.getTime() / 1000, 10);
  return changedTimestamp > JWTTimestamp;
};

const User = mongoose.model("User", userSchema);

module.exports = User;
