const crypto = require("node:crypto");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class RequestValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "RequestValidationError";
  }
}

function normalizeEmail(value) {
  if (typeof value !== "string") {
    throw new RequestValidationError("Enter a valid email address.");
  }
  const email = value.trim().toLowerCase();
  if (!email || email.length > 320 || !EMAIL_PATTERN.test(email)) {
    throw new RequestValidationError("Enter a valid email address.");
  }
  return email;
}

function optionalTrimmedString(value, maximumLength = 200) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new RequestValidationError("A submitted field has an invalid value.");
  }
  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw new RequestValidationError("A submitted field is too long.");
  }
  return normalized || null;
}

function splitName(value) {
  const name = optionalTrimmedString(value, 200);
  if (!name) return { firstName: null, lastName: null };
  const parts = name.split(/\s+/);
  return {
    firstName: parts.shift() || null,
    lastName: parts.join(" ") || null,
  };
}

function parseJsonBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    throw new RequestValidationError("Request body must be valid JSON.");
  }
}

function jsonResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

function clientIp(event) {
  const forwarded = event.headers && (
    event.headers["x-nf-client-connection-ip"] ||
    event.headers["x-forwarded-for"]
  );
  return typeof forwarded === "string"
    ? forwarded.split(",")[0].trim()
    : "unknown";
}

function rateLimitKey(event, scope, secret) {
  return crypto
    .createHash("sha256")
    .update(`${scope}:${secret}:${clientIp(event)}`)
    .digest("hex");
}

function safeIdentifier(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || "unknown"))
    .digest("hex")
    .slice(0, 12);
}

function timingSafeTokenMatch(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string" || !expected) {
    return false;
  }
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function csvCell(value) {
  if (value == null) return "";
  const rawValue = String(value);
  const stringValue = /^[=+\-@]/.test(rawValue) ? `'${rawValue}` : rawValue;
  return /[",\r\n]/.test(stringValue)
    ? `"${stringValue.replaceAll('"', '""')}"`
    : stringValue;
}

module.exports = {
  RequestValidationError,
  csvCell,
  jsonResponse,
  normalizeEmail,
  optionalTrimmedString,
  parseJsonBody,
  rateLimitKey,
  safeIdentifier,
  splitName,
  timingSafeTokenMatch,
};
