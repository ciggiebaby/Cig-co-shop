// Test-only: CIG marked the bonnet & durag (0004), umbrella (0010) and bikini
// (0011) sold out as whole products on 10/22 (soldOut: true). Many checkout
// tests use them as the catalog's only examples of component stock, styles and
// color-only stock, so this clears the flag inside the test process only (each
// test file runs in its own process). The real sold-out behavior is tested in
// tests/sold-out-products.test.js, which does not load this fixture.
const catalog = require("../products.js");
const SOLD_OUT_IDS = ["0004", "0010", "0011"];
for (const p of catalog.PRODUCTS) if (SOLD_OUT_IDS.includes(p.id)) delete p.soldOut;
// CIG also HID the umbrella (0010) on 10/22 4:59 PM. It's the catalog's only
// color-only-stock example, so the same tests un-hide it here (test process
// only). The real hidden behavior is tested in tests/hidden-umbrella.test.js,
// which does not load this fixture.
const HIDDEN_IDS = ["0010"];
for (const p of catalog.PRODUCTS) if (HIDDEN_IDS.includes(p.id)) delete p.hidden;
module.exports = { SOLD_OUT_IDS, HIDDEN_IDS };
