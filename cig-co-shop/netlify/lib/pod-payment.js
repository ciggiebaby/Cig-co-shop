// Payment rule for print-on-demand (`pod`) items. Printful drafts are created
// from the signed Stripe webhook (printful-fulfillment) and, since CIG turned
// PayPal on for FW26 (10/22), from captured PayPal orders (paypal.js). While
// POD_CARD_ONLY in products.js is true, PayPal refuses made-to-order carts.
// Crypto has no Printful path, so it always refuses them (and is off anyway).
const catalog = require("../../products.js");
const { isPodProduct } = require("./printful.js");
const { RequestValidationError } = require("./customer-utils.js");

const POD_CARD_ONLY_MESSAGE = "Made-to-order items can only be paid by card for now.";
const POD_NO_CRYPTO_MESSAGE = "Made-to-order items can be paid by card or PayPal.";

// Read at call time so the switch (and tests) take effect without a reload.
function podCardOnlyEnabled() {
  return catalog.POD_CARD_ONLY !== false;
}

// items: the trusted cart selection ({ productId, ... }). Throws a 400 error.
function assertPodAllowedWithoutCard(items) {
  if (!podCardOnlyEnabled() || !Array.isArray(items)) return;
  if (items.some((item) => item && isPodProduct(item.productId))) {
    throw new RequestValidationError(POD_CARD_ONLY_MESSAGE);
  }
}

// Crypto (Coinbase): never for made-to-order items, whatever POD_CARD_ONLY says.
function assertPodAllowedForCrypto(items) {
  if (!Array.isArray(items)) return;
  if (items.some((item) => item && isPodProduct(item.productId))) {
    throw new RequestValidationError(POD_NO_CRYPTO_MESSAGE);
  }
}

module.exports = { POD_CARD_ONLY_MESSAGE, POD_NO_CRYPTO_MESSAGE, assertPodAllowedForCrypto, assertPodAllowedWithoutCard, podCardOnlyEnabled };
