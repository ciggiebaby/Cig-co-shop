// On/off switch for crypto checkout (Coinbase Commerce), shared by
// create-coinbase-charge and coinbase-webhook. Crypto runs only when
// CRYPTO_ENABLED in products.js is true AND its Netlify env vars are set, so
// a missing key can never crash a checkout: it's refused with a clear message.
const catalog = require("../../products.js");

const CRYPTO_DISABLED_MESSAGE =
  "Crypto checkout isn't available right now. Please pay by card or PayPal.";

// Read at call time so the switch (and tests) take effect without a reload.
function cryptoSwitchOn() {
  return catalog.CRYPTO_ENABLED === true;
}

// Charge creation needs the API key.
function cryptoCheckoutEnabled(environment = process.env) {
  return cryptoSwitchOn() && !!environment.COINBASE_COMMERCE_API_KEY;
}

// The webhook re-reads charges from Coinbase, so it needs both secrets.
function cryptoWebhookEnabled(environment = process.env) {
  return cryptoCheckoutEnabled(environment) && !!environment.COINBASE_COMMERCE_WEBHOOK_SECRET;
}

module.exports = {
  CRYPTO_DISABLED_MESSAGE,
  cryptoCheckoutEnabled,
  cryptoSwitchOn,
  cryptoWebhookEnabled,
};
