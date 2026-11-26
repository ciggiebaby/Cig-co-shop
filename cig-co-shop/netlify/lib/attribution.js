// Server-side check of the browser's `attribution` object (checkout-attribution.js).
// Same slug rule as track-visit.js: trim, keep the first 80 characters, and
// accept only [A-Za-z0-9._~+-] and spaces. Anything else is dropped. Case is
// kept, so an order tag matches the visit row for the same link. Attribution
// must never block a sale.
const KEYS = ["src", "utm_source", "utm_medium", "utm_campaign", "utm_content"];
const CAMPAIGN_TAG_MAX = 80;
const CAMPAIGN_TAG = /^[A-Za-z0-9._~+\- ]+$/;

function campaignTag(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().slice(0, CAMPAIGN_TAG_MAX);
  if (!v || !CAMPAIGN_TAG.test(v)) return null;
  return v;
}

function normalizeAttribution(input) {
  const out = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const key of KEYS) {
    const v = campaignTag(input[key]);
    if (v) out[key] = v;
  }
  return out;
}

// Columns written on public.orders. utm_content stays on the Stripe session
// only; PayPal's custom_id is too short to carry a fifth tag.
const ORDER_ATTRIBUTION_KEYS = ["src", "utm_source", "utm_medium", "utm_campaign"];

function orderAttributionParams(attribution) {
  const tags = normalizeAttribution(attribution);
  const params = {};
  if (tags.src) params.p_src = tags.src;
  if (tags.utm_source) params.p_utm_source = tags.utm_source;
  if (tags.utm_medium) params.p_utm_medium = tags.utm_medium;
  if (tags.utm_campaign) params.p_utm_campaign = tags.utm_campaign;
  return params;
}

module.exports = {
  ATTRIBUTION_KEYS: KEYS,
  ORDER_ATTRIBUTION_KEYS,
  CAMPAIGN_TAG,
  CAMPAIGN_TAG_MAX,
  campaignTag,
  normalizeAttribution,
  orderAttributionParams,
};
