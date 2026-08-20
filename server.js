process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION! Shutting down...");
  console.error(err.name, err.message);
  process.exit(1);
});

const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

const app = require("./app");
const {
  startProjectStatusScheduler,
  stopProjectStatusScheduler,
} = require("./services/projectStatusScheduler");
const {
  cleanupLegacyVoteIndexes,
} = require("./services/votingIndexService");

let databaseConnection;

if (process.env.NODE_ENV === "development") {
  databaseConnection = process.env.DATABASE_LOCAL;
  console.log("Using local MongoDB");
} else {
  databaseConnection = process.env.DATABASE.replace(
    "<db_password>",
    encodeURIComponent(process.env.DATABASE_PASSWORD),
  );

  console.log("Using MongoDB Atlas");
}

let server;

mongoose
  .connect(databaseConnection)
  .then(async () => {
    console.log("Database connection successful");
    const removedVoteIndexes = await cleanupLegacyVoteIndexes();
    if (removedVoteIndexes.length > 0) {
      console.log(
        `Removed legacy vote indexes: ${removedVoteIndexes.join(", ")}`,
      );
    }
    startProjectStatusScheduler();

    const port = process.env.PORT || 5000;

    server = app.listen(port, () => {
      console.log(
        `Server running on port ${port} in ${process.env.NODE_ENV} mode`,
      );
    });
  })
  .catch((err) => {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  });

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION! Shutting down...");
  console.error(err.name, err.message);

  if (server) {
    stopProjectStatusScheduler();
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});
