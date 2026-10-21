// Creates a PayPal order for the whole cart and returns the approval URL.
// Prices come from products.js on the server (browser prices are ignored).
// After approval PayPal returns the buyer to paypal-capture, which captures the
// payment; paypal-webhook is the signed backup if the buyer never comes back.
// Requires env vars: PAYPAL_CLIENT_ID, PAYPAL_SECRET
// (from https://developer.paypal.com/dashboard/applications — use Live keys once you're ready to go live, Sandbox keys to test)
// Optional: PAYPAL_API_BASE — defaults to live API. Set to https://api-m.sandbox.paypal.com while testing.
const {
  PricingValidationError,
  priceCartForStripe,
} = require("../lib/stripe-pricing.js");
const { buildPayPalOrder, createPayPalClient } = require("../lib/paypal.js");
const { checkoutSiteUrl, trustedCartItems } = require("../lib/checkout-request.js");
const { RequestValidationError, normalizeEmail } = require("../lib/customer-utils.js");
const { resolvePromo } = require("../lib/promo-codes.js");
const { resolveCheckoutShipping } = require("../lib/checkout-shipping.js");
const { assertPodAllowedWithoutCard } = require("../lib/pod-payment.js");

function createHandler({
  paypalFactory = createPayPalClient,
  promoResolver = resolvePromo,
  environment = process.env,
  logger = console,
} = {}) {
  return async (event) => {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }
    try {
      const body = JSON.parse(event.body || "{}");
      // Print-on-demand items are card-only while POD_CARD_ONLY (products.js) is true.
      assertPodAllowedWithoutCard(trustedCartItems(body));
      // Arcade codes must belong to the email entered on the site.
      const email = body.customer && body.customer.email ? normalizeEmail(body.customer.email) : null;
      const promo = await promoResolver({ promoCode: body.promoCode, email });
      const pricing = priceCartForStripe(trustedCartItems(body), body.promoCode, promo);
      // Shipping is priced for the country picked on the site (US = free);
      // paypal-capture refuses to capture if PayPal's address is elsewhere.
      const shipping = resolveCheckoutShipping(pricing, body.shipCountry);
      const siteUrl = checkoutSiteUrl(environment.SITE_URL);
      const order = await paypalFactory({ environment }).createOrder(
        buildPayPalOrder(pricing, {
          siteUrl,
          marketingConsent: !!(body.customer && body.customer.marketingConsent === true),
          shipping,
        }),
      );

      const approveLink = (order.links || []).find((l) => l.rel === "approve" || l.rel === "payer-action");
      if (!approveLink) throw new Error("PayPal did not return an approval link");
      return { statusCode: 200, body: JSON.stringify({ url: approveLink.href }) };
    } catch (err) {
      if (
        err instanceof PricingValidationError
        || err instanceof RequestValidationError
        || err instanceof SyntaxError
      ) {
        return { statusCode: 400, body: JSON.stringify({ error: err.message }) };
      }
      logger.error("PayPal order creation failed.", { error: err && err.name });
      return { statusCode: 500, body: JSON.stringify({ error: "PayPal checkout could not be started." }) };
    }
  };
}

const handler = createHandler();

module.exports = { createHandler, handler };
