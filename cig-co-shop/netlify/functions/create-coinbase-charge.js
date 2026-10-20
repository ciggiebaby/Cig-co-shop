// Creates a Coinbase Commerce charge for the cart, with your standing 20% crypto discount
// applied automatically, and returns the hosted checkout URL.
// Prices come from products.js on the server (browser prices are ignored); the
// crypto discount stacks on top of any promo code, exactly as before.
// Payment is confirmed by the signed coinbase-webhook function.
// Requires env var: COINBASE_COMMERCE_API_KEY (from https://beta.commerce.coinbase.com/settings/security)
const {
  PricingValidationError,
  priceCartForStripe,
} = require("../lib/stripe-pricing.js");
const { checkoutSiteUrl, trustedCartItems } = require("../lib/checkout-request.js");
const {
  RequestValidationError,
  normalizeEmail,
} = require("../lib/customer-utils.js");

const CRYPTO_DISCOUNT = 0.20; // 20% off for crypto payments, always

function cryptoChargeCents(totalCents) {
  return Math.round(totalCents * (1 - CRYPTO_DISCOUNT));
}

function text(value, maximumLength = 200) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function createHandler({
  fetchImpl = fetch,
  environment = process.env,
  logger = console,
} = {}) {
  return async (event) => {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
      const body = JSON.parse(event.body || "{}");
      const customer = body.customer || {};
      // The order record and receipt email go to this address, so require it.
      const email = normalizeEmail(customer.email);
      const pricing = priceCartForStripe(trustedCartItems(body), body.promoCode);
      const discounted = (cryptoChargeCents(pricing.totalCents) / 100).toFixed(2);
      const lines = pricing.lineItems.map((line) => [line.price_data.product_data.name, line.quantity]);

      const description = lines
        .map(([name, quantity]) => `${name} x${quantity}`)
        .join(", ");

      const siteUrl = checkoutSiteUrl(environment.SITE_URL);

      const res = await fetchImpl("https://api.commerce.coinbase.com/charges", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CC-Api-Key": environment.COINBASE_COMMERCE_API_KEY,
          "X-CC-Version": "2018-03-22",
        },
        body: JSON.stringify({
          name: "CIG & CO. order (20% crypto discount applied)",
          description: description.slice(0, 200),
          pricing_type: "fixed_price",
          local_price: { amount: discounted, currency: "USD" },
          metadata: {
            customer_email: email,
            customer_name: text(customer.name),
            shipping_address: text(customer.address),
            shipping_city: text(customer.city),
            marketing_consent: customer.marketingConsent === true ? "true" : "false",
            promo_code: pricing.promoCode || "",
            items: JSON.stringify(lines),
          },
          redirect_url: `${siteUrl}/?checkout=success`,
          cancel_url: `${siteUrl}/?checkout=cancelled`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error((data.error && data.error.message) || "Coinbase Commerce charge failed");

      return { statusCode: 200, body: JSON.stringify({ url: data.data.hosted_url }) };
    } catch (err) {
      if (
        err instanceof PricingValidationError
        || err instanceof RequestValidationError
        || err instanceof SyntaxError
      ) {
        return { statusCode: 400, body: JSON.stringify({ error: err.message }) };
      }
      logger.error("Coinbase Commerce charge failed.", { error: err && err.name });
      return { statusCode: 500, body: JSON.stringify({ error: "Crypto checkout could not be started." }) };
    }
  };
}

const handler = createHandler();

module.exports = { CRYPTO_DISCOUNT, createHandler, cryptoChargeCents, handler };
