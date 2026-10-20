// PayPal sends the buyer here (?token=<order id>) after they approve payment.
// Captures the payment, records the order, and sends the buyer back to the shop.
// Recording is retried by paypal-webhook if anything fails after capture.
const { createPayPalClient, recordPayPalOrder } = require("../lib/paypal.js");
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
      order = await paypalFactory({ environment }).captureOrder(orderId);
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
