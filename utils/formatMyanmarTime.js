// Admin-facing timestamps (e.g. the vote review table) must read in
// Myanmar Time regardless of the server's own OS/locale timezone (Render
// runs in UTC), since that's the timezone the event and its reviewers are
// actually in.
const MYANMAR_TIME_ZONE = "Asia/Yangon";

const formatMyanmarTime = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const formatted = date.toLocaleString("en-GB", {
    timeZone: MYANMAR_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${formatted} MMT`;
};

module.exports = { MYANMAR_TIME_ZONE, formatMyanmarTime };
