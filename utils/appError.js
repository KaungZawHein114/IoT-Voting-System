// utils/appError.js
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;

    // Captures stack trace (the line of code where the error originated)
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
