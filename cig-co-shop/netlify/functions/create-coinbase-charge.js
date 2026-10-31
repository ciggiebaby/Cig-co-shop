// Creates a Coinbase Commerce charge for the cart, with your standing 20% crypto discount
// applied automatically, and returns the hosted checkout URL.
// Prices come from products.js on the server (browser prices are ignored).
// Promo codes never stack with the crypto discount: any promo code is ignored.
// Ships to the country picked on the site: US (state + ZIP required; free
// shipping except the mask rule) or CA/GB/DE/AU/JP/KR (postal code required;
// Printful per-item shipping plus the in-hand per-order rate from
// shipping-rates.js; pillows are US only).
// The 20% crypto discount applies to the items only, never to shipping, so
// international shipping always covers Printful's cost.
// Payment is confirmed by the signed coinbase-webhook function.
// Requires env var: COINBASE_COMMERCE_API_KEY (from https://beta.commerce.coinbase.com/settings/security)
// Off unless CRYPTO_ENABLED in products.js is true and the key is set; while
// off it answers 503 with a friendly message and never calls Coinbase.
const {
  PricingValidationError,
  priceCartForStripe,
} = require("../lib/stripe-pricing.js");
const { checkoutSiteUrl, trustedCartItems } = require("../lib/checkout-request.js");
const {
  RequestValidationError,
  normalizeEmail,
} = require("../lib/customer-utils.js");
const { assertDropOpen } = require("../lib/drop-lock.js");
const {
  normalizeShipCountry,
  requireKoreaCustomsCode,
  requireShippingAddress,
  resolveCheckoutShipping,
} = require("../lib/checkout-shipping.js");

const { assertPodAllowedForCrypto } = require("../lib/pod-payment.js");
const { CRYPTO_DISABLED_MESSAGE, cryptoCheckoutEnabled } = require("../lib/crypto-payment.js");

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
  now = () => Date.now(),
} = {}) {
  return async (event) => {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }
    if (!cryptoCheckoutEnabled(environment)) {
      return { statusCode: 503, body: JSON.stringify({ error: CRYPTO_DISABLED_MESSAGE }) };
    }
    try {
      const body = JSON.parse(event.body || "{}");
      // FW26/27 items can't be bought before DROP_AT (products.js) unless the
      // DROP_TEST_CODE env var is set and sent as dropTestCode.
      assertDropOpen(trustedCartItems(body), { dropTestCode: body.dropTestCode, environment, now: now() });
      // Print-on-demand items have no Printful path from crypto: card or PayPal only.
      assertPodAllowedForCrypto(trustedCartItems(body));
      const customer = body.customer || {};
      // The order record and receipt email go to this address, so require it.
      const email = normalizeEmail(customer.email);
      // The ship-to country must be chosen explicitly for crypto.
      const country = normalizeShipCountry(
        body.shipCountry !== undefined ? body.shipCountry : customer.country,
        { requireCountry: true },
      );
      const address = requireShippingAddress(customer, country);
      // No promo code here — crypto always gets its 20% instead.
      const pricing = priceCartForStripe(trustedCartItems(body), null, undefined, { now: now() });
      // Live-stock backstock isn't decremented by the Coinbase webhook, so keep
      // it to card/PayPal (crypto is off anyway; see CRYPTO_ENABLED).
      if (pricing.stockLines.length) {
        throw new RequestValidationError("Masks can be paid by card or PayPal.");
      }
      const shipping = resolveCheckoutShipping(pricing, country);
      const pccc = requireKoreaCustomsCode(customer.pccc, country);
      // 20% off the items only; shipping is added at full price.
      const chargeCents = cryptoChargeCents(pricing.totalCents) + shipping.shippingCents;
      const discounted = (chargeCents / 100).toFixed(2);
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
          name: shipping.shippingCents > 0
            ? "CIG & CO. order (20% crypto discount on items, plus shipping)"
            : "CIG & CO. order (20% crypto discount applied)",
          description: description.slice(0, 200),
          pricing_type: "fixed_price",
          local_price: { amount: discounted, currency: "USD" },
          metadata: {
            customer_email: email,
            customer_name: text(customer.name),
            shipping_address: text(customer.address),
            shipping_city: text(customer.city),
            shipping_state: address.state,
            shipping_zip: address.zip,
            shipping_country: address.country,
            shipping_cents: String(shipping.shippingCents),
            ...(pccc ? { pccc } : {}),
            marketing_consent: customer.marketingConsent === true ? "true" : "false",
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
