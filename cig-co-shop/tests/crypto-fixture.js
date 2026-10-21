// Crypto checkout is switched off on the live site (CRYPTO_ENABLED=false in
// products.js, CIG 10/21). Tests that cover the crypto flow turn it on
// in-process (each test file runs in its own process) with a fake API key,
// so the code stays tested and ready to flip on later.
const catalog = require("../products.js");

catalog.CRYPTO_ENABLED = true;

const CRYPTO_ENV = { COINBASE_COMMERCE_API_KEY: "test-coinbase-key" };

module.exports = { CRYPTO_ENV };
