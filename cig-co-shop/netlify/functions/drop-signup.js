// "Get notified" signup on the FW26/27 drop hero.
// Adds the email to Kit with the existing Marketing opt-in tag
// (KIT_MARKETING_OPT_IN_TAG_ID) and nothing else. Uses the same Kit client and
// rate limiter as the Arcade/checkout flows. A Kit subscriber who previously
// unsubscribed (any state other than active) is left alone.
const {
  RequestValidationError,
  jsonResponse,
  normalizeEmail,
  parseJsonBody,
  rateLimitKey,
} = require("../lib/customer-utils.js");
const { createCustomerStore } = require("../lib/customer-store.js");
const { createKitClient } = require("../lib/kit.js");

function createHandler({
  storeFactory = createCustomerStore,
  kitFactory = createKitClient,
  environment = process.env,
  logger = console,
} = {}) {
  return async (event) => {
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { error: "Method not allowed." }, { Allow: "POST" });
    }
    try {
      const body = parseJsonBody(event);
      const email = normalizeEmail(body.email);
      if (body.marketingConsent !== true) {
        throw new RequestValidationError("Please confirm you want drop emails.");
      }
      const tagId = environment.KIT_MARKETING_OPT_IN_TAG_ID;
      if (!tagId) {
        logger.error("Drop signup is not configured (KIT_MARKETING_OPT_IN_TAG_ID).");
        return jsonResponse(503, { error: "Signup is unavailable right now. Please try again later." });
      }

      const store = storeFactory();
      const allowed = await store.checkArcadeRateLimit(
        rateLimitKey(event, "drop-signup", environment.SUPABASE_SECRET_KEY),
        5,
        60,
      );
      if (!allowed) {
        return jsonResponse(429, { error: "Too many attempts. Please wait a moment and try again." });
      }

      const kit = kitFactory({ apiKey: environment.KIT_API_KEY });
      const { subscriber, suppressed } = await kit.upsertSubscriber({ email, firstName: null });
      if (!suppressed) await kit.addTags(subscriber.id, [tagId]);
      // Same response either way, so the form never reveals list status.
      return jsonResponse(200, { ok: true });
    } catch (error) {
      if (error instanceof RequestValidationError) {
        return jsonResponse(400, { error: error.message });
      }
      logger.error("Drop signup failed.", { error: error && (error.code || error.name) });
      return jsonResponse(500, { error: "Signup is unavailable right now. Please try again later." });
    }
  };
}

const handler = createHandler();

module.exports = { createHandler, handler };
