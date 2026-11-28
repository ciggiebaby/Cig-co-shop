// Server-side check of the browser's `attribution` object (checkout-attribution.js).
// Same slug rule as track-visit.js: trim, keep the first 80 characters, and
// accept only [A-Za-z0-9._~+-] and spaces. Anything else is dropped. Case is
// kept, so an order tag matches the visit row for the same link. Attribution
// must never block a sale.
const KEYS = ["src", "utm_source", "utm_medium", "utm_campaign", "utm_content"];
const CLICK_ID_KEYS = ["gclid", "gbraid", "wbraid"];
const CAMPAIGN_TAG_MAX = 80;
const CAMPAIGN_TAG = /^[A-Za-z0-9._~+\- ]+$/;
// Click ids stay out of the 80-character slug. A longer id is dropped whole,
// not shortened, so a stored id still matches the ad click.
const CLICK_ID_MAX = 200;
const CLICK_ID = /^[A-Za-z0-9._~-]+$/;

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

function clickId(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.length > CLICK_ID_MAX || !CLICK_ID.test(v)) return null;
  return v;
}

function clickIds(input) {
  const out = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const key of CLICK_ID_KEYS) {
    const v = clickId(input[key]);
    if (v) out[key] = v;
  }
  return out;
}

function hasClickParam(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  return CLICK_ID_KEYS.some((key) => typeof input[key] === "string" && input[key].trim());
}

// Columns written on public.orders. utm_content stays on the Stripe session
// only; PayPal's custom_id is too short to carry a fifth tag. Click ids are
// not order columns (no migration). They ride on Stripe metadata, and on
// PayPal custom_id only when the full id still fits.
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
  CLICK_ID_KEYS,
  ORDER_ATTRIBUTION_KEYS,
  CAMPAIGN_TAG,
  CAMPAIGN_TAG_MAX,
  CLICK_ID,
  CLICK_ID_MAX,
  campaignTag,
  clickId,
  clickIds,
  hasClickParam,
  normalizeAttribution,
  orderAttributionParams,
};
