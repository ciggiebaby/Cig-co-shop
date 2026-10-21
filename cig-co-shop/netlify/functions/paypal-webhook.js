// Signed PayPal webhook: captures approved US-shipping orders the buyer never returned from,
// and records captured payments (Supabase order, email, Kit) like stripe-webhook.js.
// Requires env vars: PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_WEBHOOK_ID
// Subscribe in PayPal to: CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED
const { createPayPalClient, payPalShippingCountry, recordPayPalOrder, shipsToUs } = require("../lib/paypal.js");
const { safeIdentifier } = require("../lib/customer-utils.js");

function rawEventBody(event) {
  return event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";
}

function json(statusCode, body) {
  return { statusCode, body: JSON.stringify(body) };
}

function createHandler({
  paypalFactory = createPayPalClient,
  recordOrder = recordPayPalOrder,
  environment = process.env,
  logger = console,
} = {}) {
  return async (event) => {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const rawBody = rawEventBody(event);
    let webhookEvent;
    try {
      webhookEvent = JSON.parse(rawBody);
    } catch {
      return json(400, { error: "Request body must be valid JSON." });
    }

    try {
      const paypal = paypalFactory({ environment });
      if (!(await paypal.verifyWebhookSignature(event.headers || {}, rawBody))) {
        return json(400, { error: "Webhook signature is invalid." });
      }

      const resource = webhookEvent.resource || {};
      let order;
      if (webhookEvent.event_type === "CHECKOUT.ORDER.APPROVED") {
        const approved = await paypal.getOrder(resource.id);
        if (approved && approved.status === "COMPLETED") {
          order = approved;
        } else if (!shipsToUs(approved)) {
          // We only ship to the US: leave the order uncaptured so nothing is charged.
          logger.error("PayPal order not captured: shipping address is outside the US.", {
            event: safeIdentifier(webhookEvent.id),
            country: payPalShippingCountry(approved) || "missing",
          });
          return json(200, { received: true, processed: false, reason: "us-only" });
        } else {
          order = await paypal.captureOrder(resource.id);
        }
      } else if (webhookEvent.event_type === "PAYMENT.CAPTURE.COMPLETED") {
        const orderId = resource.supplementary_data
          && resource.supplementary_data.related_ids
          && resource.supplementary_data.related_ids.order_id;
        // custom_id is only set on orders made by create-paypal-order.
        if (!orderId || !resource.custom_id) return json(200, { received: true, processed: false });
        order = await paypal.getOrder(orderId);
        if (!shipsToUs(order)) {
          // Money was captured outside this shop's US-only flow; record it but flag it.
          logger.error("Captured PayPal order ships outside the US; refund or handle manually.", {
            event: safeIdentifier(webhookEvent.id),
            country: payPalShippingCountry(order) || "missing",
          });
        }
      } else {
        return json(200, { received: true });
      }

      const processed = await recordOrder(
        order,
        { eventId: `paypal:${webhookEvent.id}`, eventType: webhookEvent.event_type },
        { environment, logger },
      );
      return json(200, { received: true, processed });
    } catch (error) {
      logger.error("PayPal webhook processing failed.", {
        event: safeIdentifier(webhookEvent && webhookEvent.id),
        error: error && error.name,
      });
      return json(500, { error: "Webhook processing failed." });
    }
  };
}

const handler = createHandler();

module.exports = { createHandler, handler, rawEventBody };
