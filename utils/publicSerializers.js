const { resolveVotingState } = require("../services/votingService");

// Shapes shared between the public project-browsing API and the voting
// ballot API — kept in one place so both stay in sync with the schema.

const serializeProjectSummary = (project) => {
  const show = project.projectShow || {};
  const location = show.location || {};
  return {
    batch: project.batch,
    theme: project.theme,
    status: project.status,
    state: resolveVotingState(project),
    show: {
      startDate: show.startDate,
      startTime: show.startTime,
      endTime: show.endTime,
      location: {
        campus: location.campus || null,
        floor: location.floor || null,
        room: location.room || null,
      },
    },
  };
};

const serializeGroup = (group) => ({
  id: group._id.toString(),
  groupNumber: group.groupNumber,
  title: group.title,
  description: group.description,
  members: group.members,
  status: group.status,
  images: group.images,
});

const serializeCategory = (category) => ({
  id: category._id.toString(),
  name: category.name,
  description: category.description,
});

module.exports = { serializeProjectSummary, serializeGroup, serializeCategory };
