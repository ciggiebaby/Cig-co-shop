const {
  RequestValidationError,
  jsonResponse,
  normalizeEmail,
  optionalTrimmedString,
  parseJsonBody,
  rateLimitKey,
  safeIdentifier,
} = require("../lib/customer-utils.js");
const { createCustomerStore } = require("../lib/customer-store.js");
const { sendPrizeTransaction } = require("../lib/integrations.js");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GAMES = new Set(["wheel", "scratch", "boxes"]);

function createHandler({
  storeFactory = createCustomerStore,
  sendPrize = sendPrizeTransaction,
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
      const game = optionalTrimmedString(body.game, 20);
      const requestId = optionalTrimmedString(body.requestId, 36);
      if (!GAMES.has(game) || !requestId || !UUID_PATTERN.test(requestId)) {
        throw new RequestValidationError("Arcade play request is invalid.");
      }

      const store = storeFactory();
      const allowed = await store.checkArcadeRateLimit(
        rateLimitKey(event, "arcade-claim", environment.SUPABASE_SECRET_KEY),
        8,
        60,
      );
      if (!allowed) {
        return jsonResponse(429, {
          error: "Too many attempts. Please wait a moment and try again.",
        });
      }

      const claim = await store.claimArcade({ email, game, requestId });
      if (claim.claimed) {
        try {
          await sendPrize({ store, claim, logger });
        } catch (error) {
          logger.error("Prize email delivery could not be started.", {
            play: safeIdentifier(claim.playId),
          });
        }
      }

      return jsonResponse(200, {
        claimed: claim.claimed,
        reason: claim.reason || null,
        firstPlay: claim.firstPlay || false,
        playedAt: claim.playedAt,
        nextEligibleAt: claim.nextEligibleAt,
        prize: claim.prize,
      });
    } catch (error) {
      if (error instanceof RequestValidationError) {
        return jsonResponse(400, { error: error.message });
      }
      logger.error("Arcade claim failed.", { error: error && error.name });
      return jsonResponse(500, {
        error: "Your play could not be confirmed. Please try again.",
      });
    }
  };
}

const handler = createHandler();

module.exports = { createHandler, handler };
