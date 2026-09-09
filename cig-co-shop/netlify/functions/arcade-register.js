const {
  RequestValidationError,
  jsonResponse,
  normalizeEmail,
  parseJsonBody,
  rateLimitKey,
  safeIdentifier,
} = require("../lib/customer-utils.js");
const { createCustomerStore } = require("../lib/customer-store.js");
const { syncContactToKit } = require("../lib/integrations.js");

function createHandler({
  storeFactory = createCustomerStore,
  syncKit = syncContactToKit,
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
      const consentProvided = body.consentProvided === true;
      if (consentProvided && typeof body.marketingConsent !== "boolean") {
        throw new RequestValidationError("Marketing preference is invalid.");
      }
      const marketingConsent = consentProvided ? body.marketingConsent : null;
      const store = storeFactory();
      const allowed = await store.checkArcadeRateLimit(
        rateLimitKey(event, "arcade-register", environment.SUPABASE_SECRET_KEY),
      );
      if (!allowed) {
        return jsonResponse(429, {
          error: "Too many attempts. Please wait a moment and try again.",
        });
      }

      const registration = await store.registerArcade({
        email,
        emailOriginal: body.email.trim(),
        marketingConsent,
        consentSource: consentProvided ? "arcade_gate" : null,
      });

      if (registration.marketingConsent) {
        try {
          await syncKit({
            store,
            contact: {
              id: registration.contactId,
              email,
              marketingConsent: true,
              sourceArcade: true,
              sourceCheckout: registration.sourceCheckout,
              orderCount: registration.orderCount,
            },
            environment,
            logger,
          });
        } catch (error) {
          logger.error("Kit synchronization could not be started.", {
            contact: safeIdentifier(registration.contactId),
          });
        }
      }

      return jsonResponse(200, {
        email,
        eligible: registration.eligible,
        serverNow: registration.serverNow,
        lastPlay: registration.lastPlay,
      });
    } catch (error) {
      if (error instanceof RequestValidationError) {
        return jsonResponse(400, { error: error.message });
      }
      logger.error("Arcade registration failed.", {
        error: error && error.name,
      });
      return jsonResponse(500, {
        error: "The Arcade could not be unlocked. Please try again.",
      });
    }
  };
}

const handler = createHandler();

module.exports = { createHandler, handler };
