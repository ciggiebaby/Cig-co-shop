// Test-only: these files check the masks' regular prices with the real clock.
// If the suite runs while a timed sale (products.js saleStart/saleEnd) is on,
// move this process's clock to just before the earliest active sale started,
// so they still see full price. Outside a sale window this does nothing.
// tests/halloween-mask-sale.test.js covers the sale itself with a pinned `now`.
const { PRODUCTS, saleActive } = require("../products.js");

const realNow = Date.now.bind(Date);
const active = PRODUCTS.filter((p) => p.saleStart != null && saleActive(p, realNow()));
if (active.length) {
  const earliestStart = Math.min(...active.map((p) => Date.parse(p.saleStart)));
  const shift = realNow() - earliestStart + 60 * 60 * 1000; // 1 hour before the sale
  Date.now = () => realNow() - shift;
}
