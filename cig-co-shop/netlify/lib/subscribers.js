// Email list helpers shared by the Arcade, checkout, notify-me and
// early-access sign-ups. Every sign-up lands in the Supabase `subscribers`
// table (supabase/migrations/202610310001_email_list_subscribers.sql) tagged
// with one SOURCE so BG can report sign-ups by source.
const crypto = require("node:crypto");
const { RequestValidationError, safeIdentifier } = require("./customer-utils.js");

// ---------- arcade.html?src= values: THE ONE PLACE TO ADD A NEW CARD ----------
// Printed cards link to cigcompany.com/arcade.html?src=<slug> and the sign-up
// is stored with source = <slug>. To add a store, add one line here.
const ARCADE_SRC_LIST = Object.freeze({
  qr: "Mask-mailer QR card",
  shop: "Cards in wholesale boxes that stores hand out",
  fani: "Fani's store (Closette) cards",
  thankyou: "Thank-you email for Printful orders (no card in the box)",
});
// Fallback: a src that is not on the list yet but looks like a slug is still
// saved as-is, so a new store's cards are not lumped into "arcade" before
// someone updates ARCADE_SRC_LIST. Anything else (or no src) is "arcade".
const SOURCE_SLUG_PATTERN = /^[a-z0-9_-]{2,24}$/;

const SOURCES = Object.freeze({
  ARCADE: "arcade",
  QR: "qr", // Arcade reached from the mask-mailer QR card: arcade.html?src=qr
  SHOP: "shop", // Arcade reached from cards in wholesale boxes stores hand out: arcade.html?src=shop
  CHECKOUT: "checkout",
  NOTIFY_ME: "notify_me",
  EARLY_ACCESS: "early_access",
});
// Sources the site sets itself; a card src can never claim one of these.
const RESERVED_SOURCES = new Set([SOURCES.CHECKOUT, SOURCES.NOTIFY_ME, SOURCES.EARLY_ACCESS]);
const ALL_SOURCES = new Set([...Object.values(SOURCES), ...Object.keys(ARCADE_SRC_LIST)]);

// Any source value the subscribers table accepts (same rule as the SQL check).
function isValidSource(value) {
  return typeof value === "string" && SOURCE_SLUG_PATTERN.test(value);
}

function isKnownArcadeSrc(value) {
  return Object.prototype.hasOwnProperty.call(ARCADE_SRC_LIST, value);
}

// arcade.html?src= -> stored source. Listed slugs and slug-shaped values are
// saved as-is (trimmed, lowercased); reserved, malformed or missing -> "arcade".
function arcadeSource(value) {
  if (typeof value !== "string") return SOURCES.ARCADE;
  const key = value.trim().toLowerCase();
  if (isKnownArcadeSrc(key)) return key;
  if (SOURCE_SLUG_PATTERN.test(key) && !RESERVED_SOURCES.has(key)) return key;
  return SOURCES.ARCADE;
}

// Throwaway inbox domains. Not exhaustive, just the common ones people use to
// farm first-play codes. Prize codes are emailed, so a fake inbox gets nothing
// anyway; this keeps the list clean.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com",
  "10minutemail.com", "10minutemail.net", "tempmail.com", "temp-mail.org",
  "yopmail.com", "yopmail.net", "trashmail.com", "getnada.com", "nada.email",
  "dispostable.com", "throwawaymail.com", "maildrop.cc", "fakeinbox.com",
  "mailnesia.com", "mintemail.com", "tempinbox.com", "emailondeck.com",
  "moakt.com", "tempr.email", "discard.email", "spamgourmet.com",
  "mohmal.com", "burnermail.io", "inboxkitten.com", "tempmailo.com",
]);

function isDisposableEmail(email) {
  const domain = String(email || "").split("@").pop().toLowerCase();
  return DISPOSABLE_DOMAINS.has(domain);
}

function assertNotDisposable(email) {
  if (isDisposableEmail(email)) {
    throw new RequestValidationError("Please use a real email address so we can send your prize.");
  }
}

// Hidden "website" field on every public form. People never see it; bots fill
// it in. A filled honeypot gets a normal-looking success and nothing is stored.
function honeypotTripped(body) {
  return !!(body && typeof body.website === "string" && body.website.trim());
}

// ---------- Unsubscribe links ----------
// Signed with UNSUBSCRIBE_SECRET (server-side only). Without it, emails fall
// back to "reply UNSUBSCRIBE" and the unsubscribe endpoint is disabled.
function unsubscribeToken(email, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(`unsubscribe:${String(email).trim().toLowerCase()}`)
    .digest("base64url")
    .slice(0, 32);
}

function verifyUnsubscribeToken(email, token, secret) {
  if (!secret || typeof token !== "string" || typeof email !== "string") return false;
  const expected = Buffer.from(unsubscribeToken(email, secret));
  const provided = Buffer.from(token);
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

function unsubscribeUrl(email, environment = process.env) {
  const secret = environment.UNSUBSCRIBE_SECRET;
  if (!secret) return null;
  const site = (environment.SITE_URL || "https://cigcompany.com").replace(/\/+$/, "");
  const params = new URLSearchParams({ e: String(email).trim().toLowerCase(), t: unsubscribeToken(email, secret) });
  return `${site}/.netlify/functions/unsubscribe?${params.toString()}`;
}

// Records one sign-up. Never throws: list capture must not break the Arcade,
// checkout, or an order. Returns null when it could not be stored.
async function recordSubscriber(store, {
  email,
  emailOriginal = null,
  source,
  productId = null,
  variant = null,
  marketingConsent = false,
  consentText = null,
}, { logger = console } = {}) {
  if (!isValidSource(source)) {
    logger.error("Unknown subscriber source.", { source: safeIdentifier(source) });
    return null;
  }
  try {
    return await store.subscribe({
      email,
      emailOriginal: emailOriginal || email,
      source,
      productId,
      variant,
      marketingConsent: !!marketingConsent,
      consentText,
    });
  } catch (error) {
    logger.error("Subscriber could not be recorded.", {
      source,
      error: error && (error.code || error.name),
    });
    return null;
  }
}

const CONSENT_TEXT = Object.freeze({
  arcade: "Arcade: email me about future CIG & CO. drops and promotions (optional checkbox).",
  checkout: "Checkout: Keep me posted on drops & discounts (optional checkbox).",
  notify_me: "Notify me when this item is back in stock.",
  early_access: "Early access: email me early access to the next drop and the Black Friday code.",
});

module.exports = {
  ALL_SOURCES,
  ARCADE_SRC_LIST,
  RESERVED_SOURCES,
  SOURCE_SLUG_PATTERN,
  CONSENT_TEXT,
  DISPOSABLE_DOMAINS,
  SOURCES,
  arcadeSource,
  isKnownArcadeSrc,
  isValidSource,
  assertNotDisposable,
  honeypotTripped,
  isDisposableEmail,
  recordSubscriber,
  unsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
};
