// CIG & CO. ships to US addresses only (50 states + DC), matching the Stripe
// checkout's allowed_countries ["US"]. Printful's international shipping costs
// aren't charged at checkout, so an overseas order would lose money.
const { RequestValidationError } = require("./customer-utils.js");

const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL",
  "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE",
  "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD",
  "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);
const ZIP_PATTERN = /^\d{5}(-\d{4})?$/;
const US_ONLY_MESSAGE = "Sorry, we only ship to US addresses right now.";

// Validates the shipping state, ZIP, and country sent by the checkout form.
// Throws RequestValidationError (a 400) for anything outside the US.
function requireUsShipping(customer = {}) {
  const country = typeof customer.country === "string" ? customer.country.trim().toUpperCase() : "";
  if (country !== "US") throw new RequestValidationError(US_ONLY_MESSAGE);
  const state = typeof customer.state === "string" ? customer.state.trim().toUpperCase() : "";
  if (!US_STATES.has(state)) {
    throw new RequestValidationError("Please enter a valid US state (2-letter code, e.g. GA). We only ship to US addresses.");
  }
  const zip = typeof customer.zip === "string" ? customer.zip.trim() : "";
  if (!ZIP_PATTERN.test(zip)) throw new RequestValidationError("Please enter a valid 5-digit US ZIP code.");
  return { state, zip, country };
}

module.exports = { US_ONLY_MESSAGE, US_STATES, requireUsShipping };
