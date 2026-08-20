const { syncAllPublishedProjects } = require("./votingService");

let statusTimer;
let syncRunning = false;

const runStatusSync = async () => {
  if (syncRunning) return;
  syncRunning = true;
  try {
    await syncAllPublishedProjects();
  } catch (error) {
    console.error("Project status synchronization failed:", error.message);
  } finally {
    syncRunning = false;
  }
};

const startProjectStatusScheduler = () => {
  if (statusTimer) return;
  runStatusSync();
  statusTimer = setInterval(runStatusSync, 5000);
  statusTimer.unref();
};

const stopProjectStatusScheduler = () => {
  if (!statusTimer) return;
  clearInterval(statusTimer);
  statusTimer = undefined;
};

module.exports = {
  startProjectStatusScheduler,
  stopProjectStatusScheduler,
};
