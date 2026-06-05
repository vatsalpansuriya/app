// Minimal stateless auth using Node's built-in crypto (no dependency).
// A token is base64url(payload) + "." + base64url(HMAC-SHA256(payload)).
const crypto = require("crypto");

// Falls back to a dev-only password/secret so local dev works out of the box.
// MUST be overridden via env vars in production.
const DEALER_PASSWORD = process.env.DEALER_PASSWORD || "serviceflow-dev";
const AUTH_SECRET = process.env.AUTH_SECRET || "dev-insecure-secret-change-me";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(payloadStr) {
  return crypto.createHmac("sha256", AUTH_SECRET).update(payloadStr).digest("base64url");
}

function checkPassword(password) {
  if (typeof password !== "string" || password.length === 0) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(DEALER_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signToken(role = "dealer") {
  const payload = JSON.stringify({ role, exp: Date.now() + TOKEN_TTL_MS });
  const payloadB64 = b64url(payload);
  return `${payloadB64}.${sign(payloadB64)}`;
}

function verifyToken(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;
  const expected = sign(payloadB64);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// Reads a Bearer token from a request and returns its payload, or null.
function getAuth(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  return verifyToken(match[1]);
}

module.exports = { checkPassword, signToken, verifyToken, getAuth };
