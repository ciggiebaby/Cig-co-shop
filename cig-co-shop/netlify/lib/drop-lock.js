// Drop lock for the FW26/27 collection. Products with `dropAt` (products.js
// DROP_AT) can't be bought before that time, so merging the PR early doesn't
// open the drop. Stripe, PayPal and crypto checkouts all call this.
//
// Test bypass: if the Netlify env var DROP_TEST_CODE is set, a checkout that
// sends that exact code as `dropTestCode` may include locked items (for CIG's
// one real test order). If DROP_TEST_CODE is unset or empty, there is no bypass.
const { PRODUCTS } = require("../../products.js");
const { RequestValidationError, timingSafeTokenMatch } = require("./customer-utils.js");

const MIN_TEST_CODE_LENGTH = 8;

function dropTime(product) {
  if (!product || !product.dropAt) return null;
  const ms = Date.parse(product.dropAt);
  if (!Number.isFinite(ms)) throw new Error(`Invalid dropAt for product ${product.id}.`);
  return ms;
}

// "Oct 30 at 12:00 PM ET"
function dropLabel(ms) {
  const date = new Date(ms);
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  return `${day} at ${time} ET`;
}

function dropTestCodeValid(code, environment = process.env) {
  const expected = typeof environment.DROP_TEST_CODE === "string" ? environment.DROP_TEST_CODE.trim() : "";
  if (expected.length < MIN_TEST_CODE_LENGTH) return false;
  return typeof code === "string" && timingSafeTokenMatch(code.trim(), expected);
}

// items: trusted cart selection ({ productId, ... }). Throws a 400 error if any
// item hasn't dropped yet (and no valid test code was sent).
function assertDropOpen(items, { dropTestCode, environment = process.env, now = Date.now() } = {}) {
  if (!Array.isArray(items)) return;
  let earliestLocked = null;
  items.forEach((item) => {
    const product = item && PRODUCTS.find((entry) => entry.id === item.productId);
    const at = dropTime(product);
    if (at !== null && now < at && (earliestLocked === null || at < earliestLocked)) earliestLocked = at;
  });
  if (earliestLocked === null) return;
  if (dropTestCodeValid(dropTestCode, environment)) return;
  throw new RequestValidationError(
    `The FW26/27 collection drops ${dropLabel(earliestLocked)}. It can't be bought yet. Check back then!`,
  );
}

module.exports = { assertDropOpen, dropLabel, dropTestCodeValid, dropTime };
