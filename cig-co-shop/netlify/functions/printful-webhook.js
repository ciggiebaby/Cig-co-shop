// Printful v2 webhook: shipment events -> thank-you email for Printful orders.
// Setup (post-merge, see README "Printful thank-you email"):
//   POST https://api.printful.com/v2/webhooks with default_url =
//   https://cigcompany.com/.netlify/functions/printful-webhook and events
//   shipment_sent + shipment_delivered; put the returned secret_key in
//   PRINTFUL_WEBHOOK_SECRET.
// Env: PRINTFUL_WEBHOOK_SECRET, THANKYOU_EMAIL_ENABLED (default off),
//      THANKYOU_DELAY_DAYS (default 5), RESEND_*, SUPABASE_*.
const { createCustomerStore } = require("../lib/customer-store.js");
const { safeIdentifier } = require("../lib/customer-utils.js");
const { createResendClient } = require("../lib/resend.js");
const {
  processThankYou,
  thankyouDelayDays,
  thankyouEnabled,
  verifyPrintfulSignature,
} = require("../lib/thankyou.js");

const SHIPMENT_EVENTS = Object.freeze({
  shipment_sent: "shipped",
  shipment_delivered: "delivered",
});

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function header(event, name) {
  const headers = event.headers || {};
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

function rawBody(event) {
  return event.isBase64Encoded ? Buffer.from(event.body || "", "base64") : Buffer.from(event.body || "", "utf8");
}

function validTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function createHandler({
  storeFactory = createCustomerStore,
  resendFactory = createResendClient,
  environment = process.env,
  logger = console,
} = {}) {
  return async (event) => {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: { Allow: "POST" }, body: "Method Not Allowed" };
    }
    if (!environment.PRINTFUL_WEBHOOK_SECRET) {
      logger.error("PRINTFUL_WEBHOOK_SECRET is not configured.");
      return json(500, { error: "Webhook is not configured." });
    }
    const body = rawBody(event);
    if (!verifyPrintfulSignature(body, header(event, "x-pf-webhook-signature"), environment.PRINTFUL_WEBHOOK_SECRET)) {
      // Printful: ignore events with an invalid or missing signature.
      return json(401, { error: "Webhook signature is invalid." });
    }

    let payload;
    try {
      payload = JSON.parse(body.toString("utf8"));
    } catch {
      return json(400, { error: "Invalid JSON." });
    }
    const kind = payload && SHIPMENT_EVENTS[payload.type];
    if (!kind) return json(200, { received: true, processed: false });
    if (!thankyouEnabled(environment)) {
      return json(200, { received: true, processed: false, reason: "thankyou_disabled" });
    }

    const data = payload.data || {};
    const order = data.order || {};
    const shipment = data.shipment || {};
    const printfulOrderId = order.id == null ? "" : String(order.id);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(printfulOrderId)) {
      return json(200, { received: true, processed: false, reason: "no_order_id" });
    }
    const occurredAt = kind === "delivered"
      ? validTime(shipment.delivered_at) || validTime(payload.occurred_at)
      : validTime(shipment.shipped_at) || validTime(payload.occurred_at);

    try {
      const store = storeFactory();
      await store.thankyouRecordEvent({
        printfulOrderId,
        externalId: typeof order.external_id === "string" ? order.external_id.slice(0, 64) : null,
        event: kind,
        occurredAt,
        delayDays: thankyouDelayDays(environment),
      });
      // Delivered (or a zero delay) is due now; otherwise the hourly sweep sends it.
      const result = await processThankYou({ store, printfulOrderId, resend: resendFactory, logger });
      return json(200, { received: true, processed: true, event: kind, thankyou: result.status });
    } catch (error) {
      // 500 makes Printful retry; the row + claim keep retries from double-sending.
      logger.error("Printful webhook failed.", {
        printfulOrder: safeIdentifier(printfulOrderId),
        error: error && (error.code || error.name),
      });
      return json(500, { error: "Webhook processing failed." });
    }
  };
}

const handler = createHandler();

module.exports = { SHIPMENT_EVENTS, createHandler, handler };
