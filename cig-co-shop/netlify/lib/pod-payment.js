// Card-only rule for print-on-demand (`pod`) items, shared by the PayPal and
// crypto checkouts. Printful orders are only created from the signed Stripe
// webhook (printful-fulfillment), so while POD_CARD_ONLY in products.js is true,
// PayPal and crypto refuse carts that contain a made-to-order item.
// Flip POD_CARD_ONLY to false in products.js to allow them (one switch for the
// checkout page and the server).
const catalog = require("../../products.js");
const { isPodProduct } = require("./printful.js");
const { RequestValidationError } = require("./customer-utils.js");

const POD_CARD_ONLY_MESSAGE = "Made-to-order items can only be paid by card for now.";

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

module.exports = { POD_CARD_ONLY_MESSAGE, assertPodAllowedWithoutCard, podCardOnlyEnabled };
