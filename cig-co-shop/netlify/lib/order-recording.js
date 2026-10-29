// Records a confirmed PayPal or Coinbase payment exactly like stripe-webhook.js
// records a Stripe one: Supabase order + contact, order email, and Kit sync.
// Provider ids are prefixed ("paypal:…", "coinbase:…") and stored in the
// existing order id columns, so no database migration is needed and replays
// of the same payment are de-duplicated by the same unique constraints.
const { createCustomerStore } = require("./customer-store.js");
const { normalizeEmail, safeIdentifier, splitName } = require("./customer-utils.js");
const { sendOrderTransaction, syncContactToKit } = require("./integrations.js");
const { CONSENT_TEXT, SOURCES, recordSubscriber } = require("./subscribers.js");

async function recordPaidOrder(order, {
  storeFactory = createCustomerStore,
  syncKit = syncContactToKit,
  sendOrder = sendOrderTransaction,
  environment = process.env,
  logger = console,
} = {}) {
  const email = normalizeEmail(order.emailOriginal);
  const { firstName, lastName } = splitName(order.name);
  const store = storeFactory();
  const result = await store.processStripeOrder({
    eventId: order.eventId,
    eventType: order.eventType,
    sessionId: order.sessionId,
    paymentIntentId: order.paymentId,
    email,
    emailOriginal: order.emailOriginal,
    firstName,
    lastName,
    amountTotalCents: order.amountTotalCents,
    currency: order.currency || "usd",
    items: order.items,
    shippingDestination: order.shippingDestination,
    marketingConsent: !!order.marketingConsent,
    cartFingerprint: null,
    promoCode: order.promoCode || null,
    paidAt: order.paidAt || new Date().toISOString(),
  });

  const contact = result.contact;
  const savedOrder = result.order;
  // Email list: buyers who ticked the checkout opt-in (PayPal / crypto path).
  if (order.marketingConsent) {
    await recordSubscriber(store, {
      email,
      emailOriginal: order.emailOriginal,
      source: SOURCES.CHECKOUT,
      marketingConsent: true,
      consentText: CONSENT_TEXT.checkout,
    }, { logger });
  }
  try {
    await sendOrder({ store, contact, order: savedOrder, logger });
  } catch (error) {
    logger.error("Order email delivery could not be started.", {
      order: safeIdentifier(savedOrder.id),
    });
  }
  if (contact.marketing_consent) {
    try {
      await syncKit({ store, contact, environment, logger });
    } catch (error) {
      logger.error("Kit synchronization could not be started.", {
        contact: safeIdentifier(contact.id),
      });
    }
  }
  return result;
}

module.exports = { recordPaidOrder };
