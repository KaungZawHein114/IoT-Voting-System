const readline = require("readline/promises");

const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config.env" });

const PublicQrAccessToken = require("../models/publicQrAccessTokenModel");
const PublicVote = require("../models/publicVoteModel");
const PublicVotingSession = require("../models/publicVotingSessionModel");

const CONFIRMATION_TEXT = "RESET PUBLIC VOTES";

const getDatabaseConnection = () => {
  if (process.env.NODE_ENV === "development") {
    if (!process.env.DATABASE_LOCAL) {
      throw new Error("DATABASE_LOCAL is missing from config.env");
    }
    return { connectionString: process.env.DATABASE_LOCAL, target: "local" };
  }

  if (!process.env.DATABASE || !process.env.DATABASE_PASSWORD) {
    throw new Error(
      "DATABASE or DATABASE_PASSWORD is missing from config.env",
    );
  }

  return {
    connectionString: process.env.DATABASE.replace(
      "<db_password>",
      encodeURIComponent(process.env.DATABASE_PASSWORD),
    ),
    target: "MongoDB Atlas",
  };
};

const run = async () => {
  const { connectionString, target } = getDatabaseConnection();
  await mongoose.connect(connectionString);

  const databaseName = mongoose.connection.name;
  const [voteCount, sessionCount, qrTokenCount] = await Promise.all([
    PublicVote.countDocuments(),
    PublicVotingSession.countDocuments(),
    PublicQrAccessToken.countDocuments(),
  ]);

  console.log(`\nTarget: ${target} database "${databaseName}"`);
  console.log("The following Public Show test activity will be removed:");
  console.log(`  Votes: ${voteCount}`);
  console.log(`  Admitted visitor sessions: ${sessionCount}`);
  console.log(`  QR access tokens: ${qrTokenCount}`);
  console.log("\nPublic Show groups, show settings, projects, and users are preserved.");

  if (voteCount + sessionCount + qrTokenCount === 0) {
    console.log("\nNothing to reset.");
    return;
  }

  const prompt = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await prompt.question(
    `\nType ${CONFIRMATION_TEXT} to continue: `,
  );
  prompt.close();

  if (answer.trim() !== CONFIRMATION_TEXT) {
    console.log("\nReset cancelled. No data was deleted.");
    return;
  }

  // Delete dependants before the sessions they reference.
  const votes = await PublicVote.deleteMany({});
  const qrTokens = await PublicQrAccessToken.deleteMany({});
  const sessions = await PublicVotingSession.deleteMany({});

  console.log("\nPublic Show voting activity reset successfully:");
  console.log(`  Votes removed: ${votes.deletedCount}`);
  console.log(`  Admitted visitor sessions removed: ${sessions.deletedCount}`);
  console.log(`  QR access tokens removed: ${qrTokens.deletedCount}`);
};

run()
  .catch((error) => {
    console.error(`\nReset failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
