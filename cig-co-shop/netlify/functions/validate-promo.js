// Lets the storefront's Apply button check a promo code (static or Arcade)
// before checkout. Checkout re-checks it, including that an Arcade code
// belongs to the checkout email.
const {
  RequestValidationError,
  jsonResponse,
  parseJsonBody,
  rateLimitKey,
} = require("../lib/customer-utils.js");
const { createCustomerStore } = require("../lib/customer-store.js");
const { PricingValidationError } = require("../lib/stripe-pricing.js");
const { resolvePromo } = require("../lib/promo-codes.js");

function createHandler({
  storeFactory = createCustomerStore,
  promoResolver = resolvePromo,
  environment = process.env,
  logger = console,
} = {}) {
  return async (event) => {
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { error: "Method not allowed." }, { Allow: "POST" });
    }

    try {
      const body = parseJsonBody(event);
      const store = storeFactory();
      const allowed = await store.checkArcadeRateLimit(
        rateLimitKey(event, "promo-check", environment.SUPABASE_SECRET_KEY),
        10,
        60,
      );
      if (!allowed) {
        return jsonResponse(429, { error: "Too many attempts. Please wait a moment and try again." });
      }

      const promo = await promoResolver({
        promoCode: body.code,
        requireOwner: false,
        storeFactory: () => store,
      });
      if (!promo) {
        return jsonResponse(200, { valid: false, error: "Promo code is not valid." });
      }
      return jsonResponse(200, {
        valid: true,
        code: promo.code,
        discount: promo.discountBasisPoints / 10000,
        label: `${promo.discountBasisPoints / 100}% off`,
      });
    } catch (error) {
      if (error instanceof PricingValidationError || error instanceof RequestValidationError) {
        return jsonResponse(200, { valid: false, error: error.message });
      }
      logger.error("Promo check failed.", { error: error && error.name });
      return jsonResponse(500, { error: "That code couldn't be checked. Please try again." });
    }
  };
}

const handler = createHandler();

module.exports = { createHandler, handler };
