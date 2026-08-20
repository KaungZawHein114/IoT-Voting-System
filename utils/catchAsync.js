const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch((err) => next(err));
  };
};

module.exports = catchAsync;

/*
==========================
Sources of Errors
==========================

1. Operational errors
   - Created intentionally using:
       throw new AppError(...)
   - Examples:
       • Resource not found
       • Invalid request
       • Unauthorized access

2. Unexpected errors
   - Generated automatically by Node.js, Mongoose, or other libraries
   - Examples:
       • Database connection failure
       • Validation error
       • Programming error
       • TypeError

catchAsync catches any rejected Promise and forwards the error
to Express's global error handler using next(err).
*/