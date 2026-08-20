const jwt = require("jsonwebtoken");
const { promisify } = require("util");
const User = require("../models/userModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

/* ==========================================
   HELPER FUNCTIONS
========================================== */

// Generate a JWT containing only the user's database ID.
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

// Return a token without ever returning password-related fields.
const createAndSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };

  res.cookie("jwt", token, cookieOptions);
  user.password = undefined;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  res.status(statusCode).json({
    status: "success",
    token,
    data: { user },
  });
};

/* ==========================================
   ROUTE HANDLERS
========================================== */

// LOGIN — Authenticates an active ADMIN or MANAGER account.
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError("Please provide email and password", 400));
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
    "+password",
  );

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError("Incorrect email or password", 401));
  }

  if (user.status !== "ACTIVE") {
    return next(new AppError("This account is not active. Contact an administrator.", 403));
  }

  createAndSendToken(user, 200, res);
});

// PROTECT — Requires a valid JWT and an active account.
exports.protect = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies?.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) return next(new AppError("You are not logged in. Please log in first.", 401));

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  const currentUser = await User.findById(decoded.id).select("+password");

  if (!currentUser) return next(new AppError("The user no longer exists", 401));
  if (currentUser.status !== "ACTIVE") {
    return next(new AppError("This account is not active. Contact an administrator.", 403));
  }
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(new AppError("Password recently changed. Please log in again.", 401));
  }

  currentUser.password = undefined;
  req.user = currentUser;
  next();
});

exports.logout = (req, res) => {
  res.clearCookie("jwt", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  res.status(200).json({ status: "success" });
};

// RESTRICT TO — Limits a protected route to specified roles.
exports.restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError("You do not have permission to perform this action", 403));
  }
  next();
};
