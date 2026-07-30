// Compatibility endpoint for retrying a server-confirmed Arcade prize email.
// The browser cannot supply email copy, recipients, prize labels, or codes.
// Delivery uses RESEND_FROM_EMAIL through netlify/lib/resend.js.
const {
  RequestValidationError,
  jsonResponse,
  optionalTrimmedString,
  parseJsonBody,
  safeIdentifier,
} = require("../lib/customer-utils.js");
const { createCustomerStore } = require("../lib/customer-store.js");
const { sendPrizeTransaction } = require("../lib/integrations.js");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createHandler({
  storeFactory = createCustomerStore,
  sendPrize = sendPrizeTransaction,
  logger = console,
} = {}) {
  return async (event) => {
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { error: "Method not allowed." }, { Allow: "POST" });
    }

    try {
      const body = parseJsonBody(event);
      const playId = optionalTrimmedString(body.playId, 36);
      if (!playId || !UUID_PATTERN.test(playId)) {
        throw new RequestValidationError("Prize delivery request is invalid.");
      }
      const store = storeFactory();
      const claim = await store.getArcadePlayDelivery(playId);
      if (!claim) {
        return jsonResponse(404, { error: "Confirmed Arcade play was not found." });
      }
      const result = await sendPrize({ store, claim, logger });
      return jsonResponse(200, {
        sent: !!result.succeeded,
        alreadyHandled: !!result.skipped,
      });
    } catch (error) {
      if (error instanceof RequestValidationError) {
        return jsonResponse(400, { error: error.message });
      }
      logger.error("Prize email retry failed.", {
        request: safeIdentifier(event.body),
        error: error && error.name,
      });
      return jsonResponse(500, {
        error: "Prize email could not be processed.",
      });
    }
  };
}

const handler = createHandler();

module.exports = { createHandler, handler };
