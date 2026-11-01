// Server-side check of the browser's `attribution` object (checkout-attribution.js).
// Only known keys, lowercase [a-z0-9_.-], max 80 chars; anything else is dropped
// silently (attribution must never block a sale).
const KEYS = ["src", "utm_source", "utm_medium", "utm_campaign", "utm_content"];

function cleanValue(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase().slice(0, 80);
  return /^[a-z0-9][a-z0-9_.\-]*$/.test(v) ? v : null;
}

function normalizeAttribution(input) {
  const out = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const key of KEYS) {
    const v = cleanValue(input[key]);
    if (v) out[key] = v;
  }
  return out;
}

module.exports = { ATTRIBUTION_KEYS: KEYS, normalizeAttribution };
