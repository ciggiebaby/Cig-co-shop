const { createCustomerStore } = require("../lib/customer-store.js");
const { CONSENT_TEXT, SOURCES, recordSubscriber } = require("../lib/subscribers.js");
const {
  normalizeEmail,
  safeIdentifier,
  splitName,
} = require("../lib/customer-utils.js");
const {
  sendOrderTransaction,
  syncContactToKit,
} = require("../lib/integrations.js");
const { commitOrderStock, createStockStore, decodeStockMetadata } = require("../lib/live-stock.js");

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

function shippingDestination(session) {
  const shipping =
    (session.collected_information && session.collected_information.shipping_details)
    || session.shipping_details
    || null;
  if (!shipping) return null;
  const address = shipping.address || {};
  const summary = [
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ].filter(Boolean).join(", ");
  return {
    name: shipping.name || null,
    line1: address.line1 || null,
    line2: address.line2 || null,
    city: address.city || null,
    state: address.state || null,
    postalCode: address.postal_code || null,
    country: address.country || null,
    summary: summary || null,
  };
}

function orderItems(session) {
  const data = session.line_items && Array.isArray(session.line_items.data)
    ? session.line_items.data
    : [];
  return data.map((line) => ({
    description: line.description || "CIG & CO. item",
    quantity: line.quantity || 1,
    amountTotalCents: Number.isInteger(line.amount_total) ? line.amount_total : null,
    currency: line.currency || session.currency || "usd",
  }));
}

function createHandler({
  stripeFactory = defaultStripeFactory,
  storeFactory = createCustomerStore,
  syncKit = syncContactToKit,
  sendOrder = sendOrderTransaction,
  stockStoreFactory = createStockStore,
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
        environment.STRIPE_WEBHOOK_SECRET,
      );

      if (!SUPPORTED_EVENTS.has(stripeEvent.type)) {
        return { statusCode: 200, body: JSON.stringify({ received: true }) };
      }

      const suppliedSession = stripeEvent.data.object;
      const session = await stripe.checkout.sessions.retrieve(
        suppliedSession.id,
        { expand: ["line_items"] },
      );
      if (
        session.mode !== "payment"
        || session.status !== "complete"
        || session.payment_status !== "paid"
      ) {
        return {
          statusCode: 200,
          body: JSON.stringify({ received: true, processed: false }),
        };
      }

      const emailOriginal =
        (session.customer_details && session.customer_details.email)
        || session.customer_email;
      const email = normalizeEmail(emailOriginal);
      const { firstName, lastName } = splitName(
        session.customer_details && session.customer_details.name,
      );
      const marketingConsent = session.metadata
        && session.metadata.marketing_consent === "true";
      const store = storeFactory();
      const result = await store.processStripeOrder({
        eventId: stripeEvent.id,
        eventType: stripeEvent.type,
        sessionId: session.id,
        paymentIntentId:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent && session.payment_intent.id,
        email,
        emailOriginal,
        firstName,
        lastName,
        amountTotalCents: session.amount_total,
        currency: session.currency || "usd",
        items: orderItems(session),
        shippingDestination: shippingDestination(session),
        marketingConsent,
        cartFingerprint: session.metadata && session.metadata.cart_fingerprint,
        promoCode: session.metadata && session.metadata.promo_code,
        paidAt: new Date(stripeEvent.created * 1000).toISOString(),
      });

      // Decrement live backstock once per Checkout Session (replays are a
      // no-op in Supabase). A failure here returns 500 so Stripe retries;
      // the order above is already de-duplicated.
      await commitOrderStock(`stripe:${session.id}`, decodeStockMetadata(session.metadata), { stockStoreFactory, logger });

      const contact = result.contact;
      const order = result.order;
      // Email list: buyers who ticked the checkout opt-in (card path).
      if (marketingConsent) {
        await recordSubscriber(store, {
          email,
          emailOriginal,
          source: SOURCES.CHECKOUT,
          marketingConsent: true,
          consentText: CONSENT_TEXT.checkout,
        }, { logger });
      }
      try {
        await sendOrder({ store, contact, order, logger });
      } catch (error) {
        logger.error("Order email delivery could not be started.", {
          order: safeIdentifier(order.id),
        });
      }
      if (contact.marketing_consent) {
        try {
          await syncKit({
            store,
            contact,
            environment,
            logger,
          });
        } catch (error) {
          logger.error("Kit synchronization could not be started.", {
            contact: safeIdentifier(contact.id),
          });
        }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          received: true,
          processed: true,
          created: result.created,
        }),
      };
    } catch (error) {
      if (
        error
        && (
          error.type === "StripeSignatureVerificationError"
          || error.name === "StripeSignatureVerificationError"
        )
      ) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Webhook signature is invalid." }),
        };
      }
      logger.error("Stripe webhook processing failed.", {
        event: safeIdentifier(stripeEvent && stripeEvent.id),
        error: error && error.name,
      });
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Webhook processing failed." }),
      };
    }
  };
}

const handler = createHandler();

module.exports = {
  SUPPORTED_EVENTS,
  createHandler,
  handler,
  orderItems,
  rawEventBody,
  shippingDestination,
};
