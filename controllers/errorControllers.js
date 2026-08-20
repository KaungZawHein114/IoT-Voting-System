// controllers/errorControllers.js
const AppError = require("../utils/appError");

const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}.`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const value = err.keyValue ? JSON.stringify(err.keyValue) : "";
  const message = `Duplicate field value: ${value}. Please use another value!`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Invalid input data. ${errors.join(". ")}`;
  return new AppError(message, 400);
};

const handleMulterError = (err) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return new AppError("File size too large. Maximum size is 5MB.", 400);
  }
  if (err.code === "LIMIT_FILE_COUNT") {
    return new AppError("Too many files uploaded.", 400);
  }
  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return new AppError("Unexpected file field.", 400);
  }
  return new AppError(err.message || "File upload error", 400);
};

// Error Format for Developers
const sendErrorDev = (err, req, res) => {
  res.status(err.statusCode || 500).json({
    status: err.status || "error",
    error: err,
    message: err.message,
    stack: err.stack,
  });
};

const sendErrorProd = (err, req, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  } else {
    // Programming or unknown error: don't leak details
    console.error("ERROR 💥", err);
    res.status(500).json({
      status: "error",
      message: "Something went wrong!",
    });
  }
};

const sendErrorPage = (err, req, res) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).render("errors/error", {
    pageTitle: statusCode === 404 ? "Page not found" : "Error",
    statusCode,
    message:
      err.isOperational || process.env.NODE_ENV === "development"
        ? err.message
        : "The request could not be completed. Please try again.",
  });
};

module.exports = (err, req, res, next) => {
  // default values
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  let error = err;

  // Normalize known database and upload errors before selecting the response format.
  if (error.name === "CastError") error = handleCastErrorDB(error);
  if (error.code === 11000) error = handleDuplicateFieldsDB(error);
  if (error.name === "ValidationError") error = handleValidationErrorDB(error);
  if (error.code && String(error.code).startsWith("LIMIT_")) {
    error = handleMulterError(error);
  }

  const isPageRequest =
    !req.originalUrl.startsWith("/api/") && req.accepts("html");
  if (isPageRequest) return sendErrorPage(error, req, res);

  if ((process.env.NODE_ENV || "development") === "development") {
    sendErrorDev(error, req, res);
  } else {
    // Helpful debug logs (will not be sent to the client)
    console.error("Prod error details:", {
      name: err.name,
      code: err.code,
      message: err.message,
      keyValue: err.keyValue,
      errors: err.errors && Object.keys(err.errors),
    });

    sendErrorProd(error, req, res);
  }
};
