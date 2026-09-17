const test = require("node:test");
const assert = require("node:assert/strict");

const { formatMyanmarTime } = require("../utils/formatMyanmarTime");

test("formats a UTC timestamp shifted into Myanmar Time (UTC+6:30)", () => {
  // 2026-01-01T00:00:00Z is 2026-01-01T06:30 in Myanmar Time.
  const result = formatMyanmarTime("2026-01-01T00:00:00.000Z");
  assert.match(result, /01 Jan 2026/);
  assert.match(result, /06:30/);
  assert.match(result, /MMT$/);
});

test("a timestamp just before UTC midnight rolls over to the next Myanmar day", () => {
  // 2025-12-31T18:00:00Z is 2026-01-01T00:30 in Myanmar Time — a case that
  // would silently show the wrong calendar day under server-local (UTC)
  // formatting instead of Myanmar Time.
  const result = formatMyanmarTime("2025-12-31T18:00:00.000Z");
  assert.match(result, /01 Jan 2026/);
  assert.match(result, /12:30/);
});

test("returns null for missing or invalid input", () => {
  assert.equal(formatMyanmarTime(null), null);
  assert.equal(formatMyanmarTime(undefined), null);
  assert.equal(formatMyanmarTime("not-a-date"), null);
});

test("accepts a Date instance as well as a string", () => {
  const result = formatMyanmarTime(new Date("2026-06-15T12:00:00.000Z"));
  assert.match(result, /15 Jun 2026/);
});
