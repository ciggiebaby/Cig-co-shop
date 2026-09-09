const { createCustomerStore } = require("../lib/customer-store.js");
const {
  RequestValidationError,
  jsonResponse,
  optionalTrimmedString,
  parseJsonBody,
  timingSafeTokenMatch,
} = require("../lib/customer-utils.js");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["redeemed", "void"]);

function bearerToken(event) {
  const authorization = event.headers.authorization || event.headers.Authorization || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function createHandler({
  storeFactory = createCustomerStore,
  environment = process.env,
  logger = console,
} = {}) {
  return async (event) => {
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { error: "Method not allowed." }, { Allow: "POST" });
    }
    if (!timingSafeTokenMatch(bearerToken(event), environment.ADMIN_EXPORT_TOKEN)) {
      return jsonResponse(401, { error: "Unauthorized." }, {
        "WWW-Authenticate": "Bearer",
      });
    }

    try {
      const body = parseJsonBody(event);
      const playId = optionalTrimmedString(body.playId, 36);
      const status = optionalTrimmedString(body.status, 20);
      const notes = optionalTrimmedString(body.notes, 500);
      if (!playId || !UUID_PATTERN.test(playId) || !STATUSES.has(status)) {
        throw new RequestValidationError("Prize redemption request is invalid.");
      }
      await storeFactory().recordPrizeRedemption(playId, status, notes);
      return jsonResponse(200, { recorded: true });
    } catch (error) {
      if (error instanceof RequestValidationError) {
        return jsonResponse(400, { error: error.message });
      }
      logger.error("Prize redemption update failed.", {
        error: error && error.name,
      });
      return jsonResponse(500, {
        error: "Prize redemption could not be recorded.",
      });
    }
  };
}

const handler = createHandler();

module.exports = { createHandler, handler };
