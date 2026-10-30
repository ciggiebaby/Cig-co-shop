// Server-side ship-to country, shipping charge, and address checks shared by
// the Stripe, PayPal, and crypto checkouts. The rates live in shipping-rates.js
// (site root) so the checkout page shows exactly what the server charges.
//
// US: free shipping, except orders with a mask: $8.95 per order unless the
// items total after promo is over $75 (shipping-rates.js). International (CA, GB, DE, AU, JP, KR only):
// in-hand items (masks and other non-Printful stock) ship to all of them for one
// per-order charge by weight; Printful pieces need an international shipping
// class (pillows are US only; MagSafe cases can't go to JP/KR).
const { SHIP_TO_COUNTRIES, normalizePccc, quoteShipping } = require("../../shipping-rates.js");
const { RequestValidationError } = require("./customer-utils.js");

const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL",
  "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE",
  "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD",
  "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

const POSTAL_CODE_PATTERNS = {
  US: /^\d{5}(-\d{4})?$/,
  CA: /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/,
  GB: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/,
  DE: /^\d{5}$/,
  AU: /^\d{4}$/,
  JP: /^\d{3}-?\d{4}$/,
  KR: /^\d{5}$/,
};

const UNSUPPORTED_COUNTRY_MESSAGE =
  "Sorry, we only ship to the United States, Canada, the United Kingdom, Germany, Australia, Japan, and South Korea right now.";

function countryName(country) {
  return SHIP_TO_COUNTRIES[country] || country;
}

// "US" when missing (Stripe and PayPal default to US, as before); the crypto
// checkout passes requireCountry so it must be chosen explicitly.
function normalizeShipCountry(value, { requireCountry = false } = {}) {
  const country = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!country) {
    if (requireCountry) throw new RequestValidationError(UNSUPPORTED_COUNTRY_MESSAGE);
    return "US";
  }
  if (!Object.prototype.hasOwnProperty.call(SHIP_TO_COUNTRIES, country)) {
    throw new RequestValidationError(UNSUPPORTED_COUNTRY_MESSAGE);
  }
  return country;
}

// pricing comes from priceCartForStripe. Returns { country, shippingCents }.
function resolveCheckoutShipping(pricing, rawCountry, options = {}) {
  const country = normalizeShipCountry(rawCountry, options);
  const quote = quoteShipping(pricing.shippingLines || [], country, { merchandiseCents: pricing.totalCents });
  if (quote.unsupportedCountry) throw new RequestValidationError(UNSUPPORTED_COUNTRY_MESSAGE);
  if (quote.blocked.length) {
    // Pillows: "ships to the US only". A product that ships abroad but not
    // to this country (MagSafe cases to JP/KR, per Printful): "can't ship to X".
    const usOnly = quote.usOnly || [];
    const notHere = quote.blocked.filter((name) => !usOnly.includes(name));
    const parts = [];
    if (usOnly.length) parts.push(`${usOnly.join(", ")} ${usOnly.length === 1 ? "ships" : "ship"} to the US only.`);
    if (notHere.length) parts.push(`${notHere.join(", ")} can't ship to ${countryName(country)}.`);
    throw new RequestValidationError(
      `${parts.join(" ")} `
        + `Remove ${quote.blocked.length === 1 ? "it" : "them"} from your bag to ship to ${countryName(country)}.`,
    );
  }
  if (!Number.isSafeInteger(quote.shippingCents) || quote.shippingCents < 0) {
    throw new Error("Shipping rate configuration is invalid.");
  }
  return { country, shippingCents: quote.shippingCents };
}

// Address checks for the crypto checkout (it has no hosted address form).
// US: 2-letter state + ZIP required. Elsewhere: a valid postal code for that
// country; state/province is optional.
function requireShippingAddress(customer = {}, country) {
  const state = typeof customer.state === "string" ? customer.state.trim().toUpperCase().slice(0, 60) : "";
  const postal = typeof customer.zip === "string" ? customer.zip.trim().toUpperCase() : "";
  if (country === "US") {
    if (!US_STATES.has(state)) {
      throw new RequestValidationError("Please enter a valid US state (2-letter code, e.g. GA).");
    }
    if (!POSTAL_CODE_PATTERNS.US.test(postal)) {
      throw new RequestValidationError("Please enter a valid 5-digit US ZIP code.");
    }
  } else if (!POSTAL_CODE_PATTERNS[country] || !POSTAL_CODE_PATTERNS[country].test(postal)) {
    throw new RequestValidationError(`Please enter a valid postal code for ${countryName(country)}.`);
  }
  return { state: state || "", zip: postal, country };
}

const PCCC_REQUIRED_MESSAGE =
  "South Korea orders need your Personal Customs Clearance Code (PCCC): P followed by 12 digits.";

// South Korea: the buyer's PCCC is required for customs and must be P + 12
// digits. Returns the cleaned code for KR, or null for every other country
// (a code sent for another country is ignored, never stored).
function requireKoreaCustomsCode(value, country) {
  if (country !== "KR") return null;
  const code = normalizePccc(value);
  if (!code) throw new RequestValidationError(PCCC_REQUIRED_MESSAGE);
  return code;
}

module.exports = {
  PCCC_REQUIRED_MESSAGE,
  POSTAL_CODE_PATTERNS,
  UNSUPPORTED_COUNTRY_MESSAGE,
  US_STATES,
  countryName,
  normalizeShipCountry,
  requireKoreaCustomsCode,
  requireShippingAddress,
  resolveCheckoutShipping,
};
