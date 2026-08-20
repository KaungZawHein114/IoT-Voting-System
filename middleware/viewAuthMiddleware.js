const jwt = require("jsonwebtoken");
const { promisify } = require("util");

const User = require("../models/userModel");

const clearAuthCookie = (res) => {
  res.clearCookie("jwt", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
};

exports.requireLogin = async (req, res, next) => {
  const token = req.cookies?.jwt;
  if (!token) return res.redirect("/login");

  try {
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (
      !user ||
      user.status !== "ACTIVE" ||
      user.changedPasswordAfter(decoded.iat)
    ) {
      clearAuthCookie(res);
      return res.redirect("/login?session=expired");
    }

    req.user = user;
    res.locals.currentUser = user;
    res.locals.currentPath = req.path;
    next();
  } catch (error) {
    clearAuthCookie(res);
    return res.redirect("/login?session=expired");
  }
};

exports.restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).render("errors/403", {
      pageTitle: "Access denied",
      currentUser: req.user,
      currentPath: req.path,
    });
  }
  next();
};
