// PayPal sends the buyer here (?token=<order id>) after they approve payment.
// Checks PayPal's shipping address is in the country picked on the site
// (shipping was priced for it; we don't capture anything else), captures the
// payment, records the order, and sends the buyer back to the shop.
// Recording is retried by paypal-webhook if anything fails after capture.
const { createPayPalClient, payPalChosenCountry, payPalShippingCountry, recordPayPalOrder, shipsToChosenCountry } = require("../lib/paypal.js");
const { checkoutSiteUrl } = require("../lib/checkout-request.js");
const { safeIdentifier } = require("../lib/customer-utils.js");

const ORDER_ID_PATTERN = /^[A-Z0-9]{5,40}$/;

function createHandler({
  paypalFactory = createPayPalClient,
  recordOrder = recordPayPalOrder,
  environment = process.env,
  logger = console,
} = {}) {
  return async (event) => {
    const siteUrl = checkoutSiteUrl(environment.SITE_URL);
    const redirect = (result) => ({
      statusCode: 303,
      headers: { Location: `${siteUrl}/?checkout=${result}`, "Cache-Control": "no-store" },
      body: "",
    });
    if (event.httpMethod !== "GET") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const orderId = event.queryStringParameters && event.queryStringParameters.token;
    if (typeof orderId !== "string" || !ORDER_ID_PATTERN.test(orderId)) {
      return redirect("cancelled");
    }

    let order;
    try {
      const paypal = paypalFactory({ environment });
      const approved = await paypal.getOrder(orderId);
      if (approved && approved.status === "COMPLETED") {
        // Already captured (e.g. by paypal-webhook); just record and confirm.
        order = approved;
      } else if (!shipsToChosenCountry(approved)) {
        // Never capture money for an address we didn't price shipping for.
        const chosen = payPalChosenCountry(approved);
        logger.error("PayPal order not captured: shipping address is not in the chosen country.", {
          order: safeIdentifier(orderId),
          chosen,
          country: payPalShippingCountry(approved) || "missing",
        });
        return redirect(chosen === "US" ? "us-only" : "country-mismatch");
      } else {
        order = await paypal.captureOrder(orderId);
      }
    } catch (error) {
      logger.error("PayPal capture failed.", {
        order: safeIdentifier(orderId),
        error: error && error.name,
        issue: error && error.issue,
      });
      return redirect("failed");
    }

    try {
      await recordOrder(order, { eventId: `paypal-return:${orderId}`, eventType: "paypal.capture.return" }, {
        environment,
        logger,
      });
    } catch (error) {
      // The money is captured; paypal-webhook records it on PayPal's retry.
      logger.error("PayPal order recording failed after capture.", {
        order: safeIdentifier(orderId),
        error: error && error.name,
      });
    }
    return redirect(order && order.status === "COMPLETED" ? "success" : "failed");
  };
}

const handler = createHandler();

module.exports = { createHandler, handler };
