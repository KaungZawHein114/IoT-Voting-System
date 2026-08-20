const crypto = require("crypto");

const randomToken = () => crypto.randomBytes(32).toString("base64url");

const hashToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

const createCsrfToken = (sessionToken) =>
  crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`vote:${sessionToken}`)
    .digest("base64url");

const validCsrfToken = (sessionToken, candidate) => {
  if (!sessionToken || !candidate) return false;

  const expected = Buffer.from(createCsrfToken(sessionToken));
  const received = Buffer.from(String(candidate));
  return (
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received)
  );
};

module.exports = {
  createCsrfToken,
  hashToken,
  randomToken,
  validCsrfToken,
};
