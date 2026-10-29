// Masks-only promos (CIG, Thu Oct 29, 2026): promo codes, including Arcade
// codes, take money off the ski mask, balaclava and moto mask only. FW26/27
// pieces stay full price; mask prices are capped and never go below wholesale.
// Free prize masks always pay the $8.95 mask shipping (they ship separately).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const promo = require("../promo.js");
const { PRODUCTS } = require("../products.js");
const { MASK_US_SHIPPING_CENTS } = require("../shipping-rates.js");
const { priceCartForStripe, PricingValidationError } = require("../netlify/lib/stripe-pricing.js");

const P = (bp) => ({ code: "CIG10-ABCDEFGH", discountBasisPoints: bp });
const ski = (quantity = 1) => ({ productId: "0008", color: "Red", size: "3-Hole", quantity });
const balaclava = (quantity = 1) => ({ productId: "0005", color: "Red", quantity });
const moto = (quantity = 1) => ({ productId: "0013", color: "Purple", quantity });
const tote = (quantity = 1) => ({ productId: "FW26-TOTE", color: "Hunter", quantity });
const bag = (quantity = 1) => ({ productId: "FW26-BAG", color: "Multi", quantity });

test("eligible products are exactly the three masks, and they exist in products.js", () => {
  assert.deepEqual([...promo.PROMO_ELIGIBLE_PRODUCT_IDS].sort(), ["0005", "0008", "0013"]);
  const names = promo.PROMO_ELIGIBLE_PRODUCT_IDS.map((id) => PRODUCTS.find((p) => p.id === id).name);
  assert.deepEqual(names.sort(), ["CIG Balaclava", "CIG Ski Mask", "Moto Mask"]);
  for (const product of PRODUCTS.filter((p) => p.id.startsWith("FW26-"))) {
    assert.equal(promo.isPromoEligibleProduct(product.id), false, product.id);
  }
});

test("price floors are the wholesale prices and every eligible mask has one", () => {
  assert.deepEqual(promo.MASK_PROMO_PRICE_FLOOR_USD, { "0008": 15.00, "0005": 12.50, "0013": 7.50 });
  assert.ok(promo.MASK_PROMO_MAX_DISCOUNT > 0 && promo.MASK_PROMO_MAX_DISCOUNT < 0.5);
});

test("promo takes money off mask lines only; FW26 lines keep full price", () => {
  const priced = priceCartForStripe([ski(), tote(), bag()], null, P(1000));
  assert.deepEqual(priced.lineItems.map((l) => l.price_data.unit_amount), [2700, 3500, 7500]);
  assert.equal(priced.discountCents, 300);
});

test("a code on a cart with no mask is refused (the Arcade code isn't burned)", () => {
  assert.throws(() => priceCartForStripe([tote(), bag()], null, P(1000)), PricingValidationError);
  assert.throws(() => priceCartForStripe([tote()], null, P(1000)), /only work on masks/);
  // No code: FW26-only carts price as before.
  assert.equal(priceCartForStripe([tote()], null).totalCents, 3500);
});

test("discount is capped at MASK_PROMO_MAX_DISCOUNT", () => {
  const capBp = Math.round(promo.MASK_PROMO_MAX_DISCOUNT * 10000);
  const expected = Math.round((3000 * (10000 - capBp)) / 10000);
  assert.equal(priceCartForStripe([ski()], null, P(5000)).lineItems[0].price_data.unit_amount, expected);
});

test("a discounted mask never goes below its wholesale floor", () => {
  assert.equal(promo.promoUnitCents("0008", 3000, 9900), Math.max(1500, promo.promoUnitCents("0008", 3000, 9900)));
  for (const [id, retail, floor] of [["0008", 3000, 1500], ["0005", 2500, 1250], ["0013", 1500, 750]]) {
    for (const bp of [1000, 1500, 2000, 5000, 9999]) {
      assert.ok(promo.promoUnitCents(id, retail, bp) >= floor, `${id} at ${bp}bp`);
    }
  }
  // Non-mask: untouched at any discount.
  assert.equal(promo.promoUnitCents("FW26-TOTE", 3500, 5000), 3500);
  // Mask with no floor configured: fail safe, no discount.
  assert.equal(promo.promoUnitCents("NOT-LISTED", 3000, 1000), 3000);
});

test("free prize masks always pay standard mask shipping", () => {
  assert.equal(promo.GIFT_MASK_SHIPPING_CENTS, MASK_US_SHIPPING_CENTS);
  for (const prize of [{ type: "merch" }, { type: "gift" }, { id: "giveaway", type: "perk" }]) {
    const note = promo.prizeTermsNote(prize);
    assert.match(note, /one mask only/);
    assert.match(note, /\$8\.95 shipping/);
    assert.match(note, /even if your order ships free/);
  }
  assert.match(promo.prizeTermsNote({ type: "discount", code: "CIG10-ABCDEFGH" }), /masks .* only/);
  assert.equal(promo.prizeTermsNote({ id: "early", type: "perk" }), "");
  assert.equal(promo.prizeTermsNote(null), "");
});

test("the arcade banner and prize email show the masks-only terms", () => {
  const arcade = fs.readFileSync(path.join(__dirname, "..", "arcade.js"), "utf8");
  assert.match(arcade, /prizeTermsNote\(prize\)/);
  const resend = fs.readFileSync(path.join(__dirname, "..", "netlify", "lib", "resend.js"), "utf8");
  assert.match(resend, /prizeTermsNote\(prize\)/);
  const html = fs.readFileSync(path.join(__dirname, "..", "arcade.html"), "utf8");
  assert.match(html, /10% off masks/);
});

test("the drop-test bypass is untouched by this change", () => {
  const dropLock = fs.readFileSync(path.join(__dirname, "..", "netlify", "lib", "drop-lock.js"), "utf8");
  assert.doesNotMatch(dropLock, /promo/i);
});
