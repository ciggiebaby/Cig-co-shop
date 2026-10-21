// Stripe webhook endpoint that sends paid print-on-demand items to Printful.
// Runs alongside stripe-webhook.js as its own Stripe webhook endpoint, so the
// existing order/email flow is untouched and Printful failures retry on their own.
// Orders are created as Printful drafts unless PRINTFUL_AUTO_CONFIRM=true.
// Requires env vars: STRIPE_SECRET_KEY, STRIPE_PRINTFUL_WEBHOOK_SECRET, PRINTFUL_API_TOKEN
// Optional: PRINTFUL_STORE_ID, PRINTFUL_AUTO_CONFIRM
const { safeIdentifier } = require("../lib/customer-utils.js");
const { normalizePccc } = require("../../shipping-rates.js");

// Printful's address limits (Latin characters only).
const ADDRESS1_MAX = 35;
const ADDRESS2_MAX = 30;

// South Korea: Printful asks for the buyer's Personal Customs Clearance Code
// (PCCC) in the shipping address, on Address 2 where possible. We put
// "PCCC P123456789012" on address2 (keeping the buyer's own line 2 when it
// fits, otherwise moving it onto address1), and also send it as the
// recipient tax_number (the order's customs/tax ID field).
function addKoreaCustomsCode(recipient, pccc) {
  const label = `PCCC ${pccc}`;
  const line2 = recipient.address2;
  const out = { ...recipient, tax_number: pccc };
  if (!line2) {
    out.address2 = label;
  } else if (`${line2} ${label}`.length <= ADDRESS2_MAX) {
    out.address2 = `${line2} ${label}`;
  } else if (`${recipient.address1}, ${line2}`.length <= ADDRESS1_MAX) {
    out.address1 = `${recipient.address1}, ${line2}`;
    out.address2 = label;
  } else {
    // Too long for Printful's limits either way: keep the code first so it
    // survives any truncation; the draft is reviewed before it's confirmed.
    out.address2 = `${label} ${line2}`;
  }
  return out;
}
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
  const recipient = {
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
  if (address.country === "KR") {
    const pccc = normalizePccc(session.metadata && session.metadata.pccc);
    if (!pccc) {
      // create-stripe-session requires it, so this only happens for sessions
      // made before the field existed. Fail loudly rather than ship without it.
      throw new Error("South Korea order is missing a valid PCCC.");
    }
    return addKoreaCustomsCode(recipient, pccc);
  }
  return recipient;
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

    if (!environment.STRIPE_PRINTFUL_WEBHOOK_SECRET) {
      logger.error("STRIPE_PRINTFUL_WEBHOOK_SECRET is not configured.");
      return json(500, { error: "Webhook is not configured." });
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
  addKoreaCustomsCode,
  createHandler,
  handler,
  podLines,
  printfulRecipient,
};
