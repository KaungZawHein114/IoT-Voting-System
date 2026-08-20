const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET ||= "voting-service-test-secret";

const {
  VOTING_MODES,
  VOTING_STATES,
  getDesiredProjectStatus,
  getShowSchedule,
  getVotingReadiness,
  resolveVotingState,
} = require("../services/votingService");
const {
  createCsrfToken,
  hashToken,
  randomToken,
  validCsrfToken,
} = require("../services/votingTokenService");

const completeProject = () => ({
  theme: "Sustainable IoT",
  status: "DRAFT",
  projectShow: {
    startDate: new Date("2030-05-20T00:00:00.000Z"),
    startTime: "09:00",
    endTime: "16:00",
    location: {
      campus: "209 Campus",
      floor: "Second Floor",
      room: "Room 9",
    },
    votingCategories: [
      { name: "Most Innovative", description: "Original solution" },
      { name: "Best Visual", description: "Clear presentation" },
    ],
    isPublished: true,
    votingMode: VOTING_MODES.SCHEDULED,
  },
});

const completeGroups = () => [
  {
    status: "ACTIVE",
    title: "Project One",
    description: "First complete project",
    members: ["Student One"],
  },
  {
    status: "ACTIVE",
    title: "Project Two",
    description: "Second complete project",
    members: ["Student Two"],
  },
];

test("publishing readiness requires two complete groups and categories", () => {
  const ready = getVotingReadiness(completeProject(), completeGroups());
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.missing, []);

  const incomplete = getVotingReadiness(completeProject(), [completeGroups()[0]]);
  assert.equal(incomplete.ready, false);
  assert.ok(incomplete.missing.includes("At least 2 active groups"));

  const missingDescription = completeGroups();
  missingDescription[0].description = "";
  const descriptionReadiness = getVotingReadiness(
    completeProject(),
    missingDescription,
  );
  assert.equal(descriptionReadiness.ready, false);
  assert.ok(
    descriptionReadiness.missing.includes(
      "Every active group needs a title, description, and members",
    ),
  );
});

test("publishing readiness rejects an invalid schedule and duplicate categories", () => {
  const project = completeProject();
  project.projectShow.endTime = "08:00";
  project.projectShow.votingCategories[1].name = "most innovative";

  const readiness = getVotingReadiness(project, completeGroups());
  assert.equal(readiness.ready, false);
  assert.ok(readiness.missing.includes("End time must be later than start time"));
  assert.ok(readiness.missing.includes("Voting category names must be unique"));
});

test("scheduled voting resolves upcoming, open, and closed states", () => {
  const project = completeProject();
  const schedule = getShowSchedule(project);
  assert.equal(schedule.valid, true);

  assert.equal(
    resolveVotingState(project, new Date(schedule.startAt.getTime() - 1)),
    VOTING_STATES.UPCOMING,
  );
  assert.equal(
    resolveVotingState(project, new Date(schedule.startAt.getTime() + 1)),
    VOTING_STATES.VOTING_OPEN,
  );
  assert.equal(
    resolveVotingState(project, new Date(schedule.endAt.getTime() + 1)),
    VOTING_STATES.VOTING_CLOSED,
  );
});

test("manual voting modes override the schedule", () => {
  const project = completeProject();
  project.projectShow.votingMode = VOTING_MODES.FORCED_OPEN;
  assert.equal(
    resolveVotingState(project, new Date("2040-01-01T00:00:00.000Z")),
    VOTING_STATES.VOTING_OPEN,
  );

  project.projectShow.votingMode = VOTING_MODES.FORCED_CLOSED;
  assert.equal(
    resolveVotingState(project, new Date("2030-05-20T03:00:00.000Z")),
    VOTING_STATES.VOTING_CLOSED,
  );

  const schedule = getShowSchedule(project);
  assert.equal(
    getDesiredProjectStatus(project, new Date(schedule.endAt.getTime() + 1)),
    "COMPLETED",
  );
});

test("session and CSRF tokens are random, hashed, and bound together", () => {
  const first = randomToken();
  const second = randomToken();
  assert.equal(first.length, 43);
  assert.notEqual(first, second);
  assert.notEqual(hashToken(first), first);

  const csrf = createCsrfToken(first);
  assert.equal(validCsrfToken(first, csrf), true);
  assert.equal(validCsrfToken(second, csrf), false);
});
