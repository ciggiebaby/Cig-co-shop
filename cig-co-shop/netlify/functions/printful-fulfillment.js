// Stripe webhook endpoint that sends paid print-on-demand items to Printful.
// Runs alongside stripe-webhook.js as its own Stripe webhook endpoint, so the
// existing order/email flow is untouched and Printful failures retry on their own.
// Orders are created as Printful drafts unless PRINTFUL_AUTO_CONFIRM=true.
// Requires env vars: STRIPE_SECRET_KEY, STRIPE_PRINTFUL_WEBHOOK_SECRET, PRINTFUL_API_TOKEN
// Optional: PRINTFUL_STORE_ID, PRINTFUL_AUTO_CONFIRM
const { safeIdentifier } = require("../lib/customer-utils.js");
const {
  autoConfirmEnabled,
  createPrintfulClient,
  printfulItemForLine,
} = require("../lib/printful.js");

const SUPPORTED_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

function defaultStripeFactory(secretKey) {
  const Stripe = require("stripe");
  return Stripe(secretKey);
}

function rawEventBody(event) {
  return event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64")
    : event.body || "";
}

function json(statusCode, body) {
  return { statusCode, body: JSON.stringify(body) };
}

function printfulRecipient(session) {
  const shipping =
    (session.collected_information && session.collected_information.shipping_details)
    || session.shipping_details
    || null;
  const address = (shipping && shipping.address) || {};
  if (!shipping || !address.line1 || !address.city || !address.country) {
    throw new Error("Paid session has no shipping address.");
  }
  const details = session.customer_details || {};
  return {
    name: shipping.name || details.name || "",
    address1: address.line1,
    address2: address.line2 || undefined,
    city: address.city,
    state_code: address.state || undefined,
    country_code: address.country,
    zip: address.postal_code || undefined,
    email: details.email || session.customer_email || undefined,
    phone: details.phone || undefined,
  };
}

function podLines(lineItems) {
  return lineItems
    .filter((line) => {
      const product = line.price && line.price.product;
      return product && typeof product === "object"
        && product.metadata && product.metadata.pod === "true";
    })
    .map((line) => {
      const meta = line.price.product.metadata;
      const quantity = line.quantity || 1;
      return {
        productId: meta.product_id,
        style: meta.style || null,
        color: meta.color || null,
        size: meta.size || null,
        quantity,
        retailPrice: Number.isInteger(line.amount_total)
          ? (line.amount_total / quantity / 100).toFixed(2)
          : undefined,
      };
    });
}

function createHandler({
  stripeFactory = defaultStripeFactory,
  printfulFactory = createPrintfulClient,
  environment = process.env,
  logger = console,
} = {}) {
  return async (event) => {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    let stripeEvent;
    try {
      const stripe = stripeFactory(environment.STRIPE_SECRET_KEY);
      stripeEvent = stripe.webhooks.constructEvent(
        rawEventBody(event),
        event.headers["stripe-signature"] || event.headers["Stripe-Signature"],
        environment.STRIPE_PRINTFUL_WEBHOOK_SECRET,
      );

      if (!SUPPORTED_EVENTS.has(stripeEvent.type)) {
        return json(200, { received: true });
      }

      // Re-fetch from Stripe rather than trusting the event payload.
      const session = await stripe.checkout.sessions.retrieve(stripeEvent.data.object.id);
      if (
        session.mode !== "payment"
        || session.status !== "complete"
        || session.payment_status !== "paid"
      ) {
        return json(200, { received: true, processed: false });
      }

      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
        limit: 100,
        expand: ["data.price.product"],
      });
      const lines = podLines(lineItems.data || []);
      if (lines.length === 0) {
        return json(200, { received: true, processed: false });
      }

      const paymentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent && session.payment_intent.id) || session.id;
      const printful = printfulFactory({ environment });
      const result = await printful.createOrder({
        paymentId,
        recipient: printfulRecipient(session),
        items: lines.map(printfulItemForLine),
        confirm: autoConfirmEnabled(environment),
      });

      logger.log("Printful order ready.", {
        session: safeIdentifier(session.id),
        printfulOrder: result.order && result.order.id,
        status: result.order && result.order.status,
        created: result.created,
      });
      return json(200, { received: true, processed: true, created: result.created });
    } catch (error) {
      if (
        error
        && (
          error.type === "StripeSignatureVerificationError"
          || error.name === "StripeSignatureVerificationError"
        )
      ) {
        return json(400, { error: "Webhook signature is invalid." });
      }
      // 500 makes Stripe retry (for up to 3 days); the Printful external_id
      // keeps retries from creating duplicate orders.
      logger.error("Printful fulfillment failed.", {
        event: safeIdentifier(stripeEvent && stripeEvent.id),
        error: error && error.name,
        message: error && error.message,
      });
      return json(500, { error: "Printful fulfillment failed." });
    }
  };
}

const handler = createHandler();

module.exports = {
  SUPPORTED_EVENTS,
  createHandler,
  handler,
  podLines,
  printfulRecipient,
};
