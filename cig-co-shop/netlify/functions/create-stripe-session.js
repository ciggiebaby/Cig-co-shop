// Creates a Stripe Checkout Session for the whole cart and returns its hosted URL.
// Requires env var: STRIPE_SECRET_KEY (from https://dashboard.stripe.com/apikeys)
const {
  PricingValidationError,
  priceCartForStripe,
} = require("../lib/stripe-pricing.js");

function defaultStripeFactory(secretKey) {
  const Stripe = require("stripe");
  return Stripe(secretKey);
}

function getTrustedItemFields(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return item;
  }

  return {
    productId: item.productId,
    color: item.color,
    size: item.size,
    style: item.style,
    quantity: item.quantity ?? item.qty,
  };
}

function createHandler({
  stripeFactory = defaultStripeFactory,
  siteUrl,
  logger = console,
} = {}) {
  return async (event) => {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Request body must be valid JSON." }),
      };
    }

    try {
      const submittedItems =
        body.items !== undefined ? body.items : body.cart;
      const trustedItems = Array.isArray(submittedItems)
        ? submittedItems.map(getTrustedItemFields)
        : submittedItems;
      const pricing = priceCartForStripe(trustedItems, body.promoCode);
      const stripe = stripeFactory(process.env.STRIPE_SECRET_KEY);
      const resolvedSiteUrl =
        siteUrl || process.env.SITE_URL || `https://${event.headers.host}`;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: pricing.lineItems,
        customer_email:
          body.customer && body.customer.email
            ? body.customer.email
            : undefined,
        shipping_address_collection: { allowed_countries: ["US"] },
        success_url: `${resolvedSiteUrl}/?checkout=success`,
        cancel_url: `${resolvedSiteUrl}/?checkout=cancelled`,
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ url: session.url }),
      };
    } catch (err) {
      if (err instanceof PricingValidationError) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: err.message }),
        };
      }

      logger.error("Stripe checkout session failed.", err);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Checkout could not be started." }),
      };
    }
  };
}

const handler = createHandler();

module.exports = {
  createHandler,
  handler,
};
