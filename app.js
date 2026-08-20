const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

const authRouter = require("./routes/authRoutes");
const userRouter = require("./routes/userRoutes");
const projectRouter = require("./routes/projectRoutes");
const groupRouter = require("./routes/groupRoutes");
const votingApiRouter = require("./routes/votingApiRoutes");
const votingViewRouter = require("./routes/votingViewRoutes");
const viewRouter = require("./routes/viewRoutes");
const AppError = require("./utils/appError");
const globalErrorHandler = require("./controllers/errorControllers");

const app = express();

app.disable("x-powered-by");
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.locals.formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "Not set";
app.locals.dateInputValue = (value) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";
app.locals.statusClass = (status) =>
  `status-${String(status || "inactive").toLowerCase()}`;

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);

// Parse JSON request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/assets", express.static(path.join(__dirname, "public")));
app.use(
  "/icons",
  express.static(path.join(__dirname, "node_modules", "lucide-static", "icons")),
);

// Development logging
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// API health check
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "GUSTO IoT Show Management API is running",
    environment: process.env.NODE_ENV,
  });
});

// Authentication and Academic Head user-management routes
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/projects", projectRouter);
app.use("/api/v1/groups", groupRouter);
app.use("/api/v1/voting", votingApiRouter);

app.use(
  "/uploads/groups",
  express.static(path.join(__dirname, "uploads", "groups")),
);

app.use("/vote", votingViewRouter);
app.use("/", viewRouter);

// Handle unknown routes
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global error handler
app.use(globalErrorHandler);

module.exports = app;
