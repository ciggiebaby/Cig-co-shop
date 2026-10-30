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
const {
  CONSENT_TEXT,
  SOURCES,
  arcadeSource,
  isKnownArcadeSrc,
  assertNotDisposable,
  honeypotTripped,
  recordSubscriber,
} = require("../lib/subscribers.js");
const { publicLastPlay } = require("../lib/arcade-public.js");

// New-email cap per network per hour, on top of the per-minute limit. Stops one
// person cycling through inboxes to farm first-play codes.
const NEW_SIGNUPS_PER_HOUR = 20;

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
      if (honeypotTripped(body)) {
        // Looks like success to a bot; nothing is stored.
        return jsonResponse(200, { email: null, eligible: false, serverNow: new Date().toISOString(), lastPlay: null });
      }
      const email = normalizeEmail(body.email);
      // "arcade", or the card's src slug (qr, shop, fani, ...) when the player
      // came in from a printed card. List + slug fallback: netlify/lib/subscribers.js.
      const source = arcadeSource(body.source);
      if (source !== SOURCES.ARCADE && !isKnownArcadeSrc(source)) {
        // Saved as-is by the slug fallback; add it to ARCADE_SRC_LIST.
        if (typeof logger.warn === "function") logger.warn("Arcade src not in ARCADE_SRC_LIST yet.", { source });
      }
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
      if (consentProvided) {
        // A typed-in email at the gate (not a returning-visitor refresh).
        assertNotDisposable(email);
        const hourlyAllowed = await store.checkArcadeRateLimit(
          rateLimitKey(event, "arcade-register-hourly", environment.SUPABASE_SECRET_KEY),
          NEW_SIGNUPS_PER_HOUR,
          3600,
        );
        if (!hourlyAllowed) {
          return jsonResponse(429, {
            error: "Too many sign-ups from this network. Please try again later.",
          });
        }
      }

      const registration = await store.registerArcade({
        email,
        emailOriginal: body.email.trim(),
        marketingConsent,
        consentSource: consentProvided ? "arcade_gate" : null,
      });

      // Email list: every typed-in Arcade email, plus a returning player who
      // just scanned a printed card (so BG can count card traffic per src).
      if (consentProvided || source !== SOURCES.ARCADE) {
        await recordSubscriber(store, {
          email,
          emailOriginal: body.email.trim(),
          source,
          marketingConsent: marketingConsent === true,
          consentText: marketingConsent === true ? CONSENT_TEXT.arcade : null,
        }, { logger });
      }

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
        lastPlay: publicLastPlay(registration.lastPlay, environment),
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

module.exports = { NEW_SIGNUPS_PER_HOUR, createHandler, handler };
