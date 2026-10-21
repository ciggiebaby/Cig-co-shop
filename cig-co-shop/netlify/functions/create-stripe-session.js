// Creates a Stripe Checkout Session for the whole cart and returns its hosted URL.
// Requires env var: STRIPE_SECRET_KEY (from https://dashboard.stripe.com/apikeys)
const {
  PricingValidationError,
  priceCartForStripe,
} = require("../lib/stripe-pricing.js");
const {
  RequestValidationError,
  normalizeEmail,
} = require("../lib/customer-utils.js");
const { resolvePromo } = require("../lib/promo-codes.js");
const {
  countryName,
  requireKoreaCustomsCode,
  resolveCheckoutShipping,
} = require("../lib/checkout-shipping.js");

const CHECKOUT_FINGERPRINT_PATTERN = /^v1:[a-f0-9]{64}$/;

// Fixed canonical origin used only when SITE_URL isn't configured. A constant,
// never the client-controllable request Host — so checkout can't be broken by a
// missing env var, and a spoofed Host can't redirect the buyer off-site.
const DEFAULT_SITE_URL = "https://cigcompany.com";

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

function checkoutSiteUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("SITE_URL is not configured.");
  }
  const url = new URL(value);
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new Error("SITE_URL is invalid.");
  }
  return url.href.replace(/\/+$/, "");
}

function createHandler({
  stripeFactory = defaultStripeFactory,
  promoResolver = resolvePromo,
  siteUrl,
  environment = process.env,
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
      const stripe = stripeFactory(environment.STRIPE_SECRET_KEY);
      // Prefer SITE_URL; fall back to the fixed canonical domain (never the
      // client-controllable request Host) so a missing env var can't break
      // checkout while a spoofed Host still can't redirect the buyer off-site.
      const resolvedSiteUrl = checkoutSiteUrl(
        siteUrl || environment.SITE_URL || DEFAULT_SITE_URL,
      );
      const customerEmail =
        body.customer && body.customer.email
          ? normalizeEmail(body.customer.email)
          : undefined;
      // Arcade codes are checked in Supabase against the checkout email.
      const promo = await promoResolver({
        promoCode: body.promoCode,
        email: customerEmail || null,
      });
      const pricing = priceCartForStripe(trustedItems, body.promoCode, promo);
      // Ship-to country is picked on the site before checkout (US by default).
      // Stripe can't vary a rate by country within one session, so the session
      // is locked to that one country with a server-computed flat shipping fee.
      const shipping = resolveCheckoutShipping(pricing, body.shipCountry);
      // South Korea customs code; printful-fulfillment puts it on the Printful order.
      const pccc = requireKoreaCustomsCode(body.customer && body.customer.pccc, shipping.country);
      const marketingConsent =
        !!(body.customer && body.customer.marketingConsent === true);
      const checkoutFingerprint =
        typeof body.checkoutFingerprint === "string"
          && CHECKOUT_FINGERPRINT_PATTERN.test(body.checkoutFingerprint)
          ? body.checkoutFingerprint
          : null;
      if (body.checkoutFingerprint != null && !checkoutFingerprint) {
        throw new RequestValidationError("Checkout fingerprint is invalid.");
      }

      const sessionRequest = {
        mode: "payment",
        line_items: pricing.lineItems,
        customer_email: customerEmail,
        metadata: {
          cart_fingerprint: checkoutFingerprint || "",
          marketing_consent: marketingConsent ? "true" : "false",
          promo_code: pricing.promoCode || "",
        },
        shipping_address_collection: { allowed_countries: [shipping.country] },
        success_url: `${resolvedSiteUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${resolvedSiteUrl}/?checkout=cancelled`,
      };
      if (shipping.country !== "US") {
        // US shipping stays free (no shipping option, same as before).
        sessionRequest.metadata.ship_country = shipping.country;
        sessionRequest.metadata.shipping_cents = String(shipping.shippingCents);
        if (pccc) sessionRequest.metadata.pccc = pccc;
        sessionRequest.shipping_options = [{
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: shipping.shippingCents, currency: "usd" },
            display_name: `Standard shipping to ${countryName(shipping.country)}`,
          },
        }];
      }
      const session = await stripe.checkout.sessions.create(sessionRequest);

      return {
        statusCode: 200,
        body: JSON.stringify({ url: session.url }),
      };
    } catch (err) {
      if (
        err instanceof PricingValidationError
        || err instanceof RequestValidationError
      ) {
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
  checkoutSiteUrl,
  createHandler,
  handler,
};
