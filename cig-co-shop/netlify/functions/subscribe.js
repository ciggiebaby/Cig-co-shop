// Public email-list sign-ups that aren't the Arcade or checkout:
//   source "notify_me":    "Notify me" on a sold-out product/variant
//                          (needs productId, optional variant).
//   source "early_access": early access to the next drop + the Black Friday code.
// Stored in Supabase `subscribers` (see netlify/lib/subscribers.js). The
// response is the same whether the email was new or already on the list.
const {
  RequestValidationError,
  jsonResponse,
  normalizeEmail,
  optionalTrimmedString,
  parseJsonBody,
  rateLimitKey,
} = require("../lib/customer-utils.js");
const { createCustomerStore } = require("../lib/customer-store.js");
const {
  CONSENT_TEXT,
  SOURCES,
  assertNotDisposable,
  honeypotTripped,
} = require("../lib/subscribers.js");
const { PRODUCTS } = require("../../products.js");

const PUBLIC_SOURCES = new Set([SOURCES.NOTIFY_ME, SOURCES.EARLY_ACCESS]);

function validProductVariant(productId, variant, products = PRODUCTS) {
  const product = products.find((p) => p.id === productId && !p.hidden);
  if (!product) return false;
  if (!variant) return true;
  // Variants are "Style / Color / Size" built from the product's own option
  // names, so every part must be one of them (no free text gets stored).
  if (variant.length > 120) return false;
  const allowed = new Set([
    ...(product.styles || []).map((s) => s.name),
    ...(product.colors || []),
    ...(product.sizes || []),
  ].map(String));
  return variant.split(" / ").every((part) => allowed.has(part));
}

function createHandler({
  storeFactory = createCustomerStore,
  environment = process.env,
  logger = console,
  products = PRODUCTS,
} = {}) {
  return async (event) => {
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { error: "Method not allowed." }, { Allow: "POST" });
    }
    try {
      const body = parseJsonBody(event);
      if (honeypotTripped(body)) return jsonResponse(200, { ok: true });

      const source = optionalTrimmedString(body.source, 20);
      if (!PUBLIC_SOURCES.has(source)) {
        throw new RequestValidationError("Sign-up type is invalid.");
      }
      const email = normalizeEmail(body.email);
      assertNotDisposable(email);

      let productId = null;
      let variant = null;
      if (source === SOURCES.NOTIFY_ME) {
        productId = optionalTrimmedString(body.productId, 80);
        variant = optionalTrimmedString(body.variant, 120);
        if (!productId || !validProductVariant(productId, variant, products)) {
          throw new RequestValidationError("That item couldn't be found.");
        }
      }

      const store = storeFactory();
      const allowed = await store.checkArcadeRateLimit(
        rateLimitKey(event, "subscribe", environment.SUPABASE_SECRET_KEY),
        6,
        60,
      );
      if (!allowed) {
        return jsonResponse(429, { error: "Too many attempts. Please wait a moment and try again." });
      }

      await store.subscribe({
        email,
        emailOriginal: body.email.trim(),
        source,
        productId,
        variant,
        // Notify-me is consent to the restock email for that item only;
        // early access is a list sign-up (drop + Black Friday emails).
        marketingConsent: source === SOURCES.EARLY_ACCESS,
        consentText: CONSENT_TEXT[source],
      });
      return jsonResponse(200, { ok: true });
    } catch (error) {
      if (error instanceof RequestValidationError) {
        return jsonResponse(400, { error: error.message });
      }
      logger.error("Email sign-up failed.", { error: error && (error.code || error.name) });
      return jsonResponse(500, { error: "Sign-up is unavailable right now. Please try again later." });
    }
  };
}

const handler = createHandler();

module.exports = { PUBLIC_SOURCES, createHandler, handler, validProductVariant };
