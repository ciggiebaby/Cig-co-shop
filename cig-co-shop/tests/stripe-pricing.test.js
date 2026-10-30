require("./full-price-clock-fixture.js");
require("./soldout-fixture.js");
require("./legacy-fixture.js");
const test = require("node:test");
const assert = require("node:assert/strict");
require("./promo-fixture.js");

const {
  MAX_CART_LINES,
  MAX_QUANTITY_PER_VARIANT,
  MAX_TOTAL_QUANTITY,
  PricingValidationError,
  normalizePromoCode,
  priceCartForStripe,
} = require("../netlify/lib/stripe-pricing.js");

function item(productId, color, size = null, style = null, quantity = 1, extra = {}) {
  return { productId, color, size, style, quantity, ...extra };
}

function assertValidationError(fn, pattern) {
  assert.throws(fn, (error) => error instanceof PricingValidationError && pattern.test(error.message));
}

test("uses sale price before regular price", () => {
  const priced = priceCartForStripe([item("TEST-PILLOW", "Red", null, null, 2)]);
  assert.equal(priced.lineItems[0].price_data.unit_amount, 1000);
  assert.equal(priced.subtotalCents, 2000);
  assert.equal(priced.totalCents, 2000);
});

test("uses style, regular, and sized-product prices", () => {
  const priced = priceCartForStripe([
    item("0004", "Gold", null, "Durag"),
    item("0005", "Blue"),
    item("0008", "Blue", "1-Hole"),
    item("0010", "Blue"),
  ]);
  assert.deepEqual(
    priced.lineItems.map((line) => line.price_data.unit_amount),
    [1200, 2500, 3000, 3500]
  );
});

test("prices Bonnet, Durag, and Set options independently", () => {
  const priced = priceCartForStripe([
    item("0004", "Pink", null, "Set"),
    item("0004", "Pink", null, "Bonnet"),
    item("0004", "Pink", null, "Durag"),
  ]);
  assert.deepEqual(
    priced.lineItems.map((line) => line.price_data.unit_amount),
    [2000, 1200, 1200],
  );
  assert.deepEqual(
    priced.lineItems.map((line) => line.price_data.product_data.name),
    [
      "Silky Bonnet & Durag (Set) — Pink",
      "Silky Bonnet & Durag (Bonnet) — Pink",
      "Silky Bonnet & Durag (Durag) — Pink",
    ],
  );
});

test("uses the selected Bikini style price and keeps styles distinct", () => {
  const priced = priceCartForStripe([
    item("0011", "Red", "L", "Set"),
    item("0011", "Red", "L", "Top"),
    item("0011", "Red", "L", "Bottom"),
  ]);
  assert.equal(priced.lineItems.length, 3);
  assert.deepEqual(
    priced.lineItems.map((line) => line.price_data.unit_amount),
    [4500, 3000, 2000]
  );
  assert.deepEqual(
    priced.lineItems.map((line) => line.price_data.product_data.name),
    [
      "Paisley Bikini (Set) — Red — L",
      "Paisley Bikini (Top) — Red — L",
      "Paisley Bikini (Bottom) — Red — L",
    ]
  );
});

test("normalizes and applies promo codes in integer cents", () => {
  const priced = priceCartForStripe([item("0011", "Red", "L", "Set", 2)], "  cig10 ");
  assert.equal(priced.promoCode, "CIG10");
  assert.equal(priced.lineItems[0].price_data.unit_amount, 4050);
  assert.equal(priced.subtotalCents, 9000);
  assert.equal(priced.discountCents, 900);
  assert.equal(priced.totalCents, 8100);
});

test("ignores client display and monetary fields", () => {
  const priced = priceCartForStripe([
    item("TEST-PILLOW", "Red", null, null, 1, {
      name: "Attacker Product",
      price: 0.01,
      subtotal: 1,
      discount: 0.99,
      discountAmount: 999999,
      total: 1,
    }),
  ]);
  const line = priced.lineItems[0];
  assert.equal(line.price_data.product_data.name, "Test Pillow Case — Red");
  assert.equal(line.price_data.unit_amount, 1000);
  assert.equal(priced.totalCents, 1000);
});

test("does not infer Bikini style from an untrusted product name", () => {
  assertValidationError(
    () => priceCartForStripe([item("0011", "Red", "L", null, 1, { name: "Paisley Bikini (Set)" })]),
    /style is required/
  );
});

test("rejects unknown and malformed product IDs", () => {
  assertValidationError(() => priceCartForStripe([item("9999", "Red")]), /Unknown product ID/);
  assertValidationError(() => priceCartForStripe([item(11, "Red", "L", "Set")]), /Product ID must be/);
  assertValidationError(() => priceCartForStripe([item("", "Red")]), /Product ID must be/);
});

test("rejects missing, unknown, and unexpected options", () => {
  assertValidationError(() => priceCartForStripe([item("0011", "Red", "L")]), /style is required/);
  assertValidationError(() => priceCartForStripe([item("0011", "Red", "L", "Dress")]), /Invalid style/);
  assertValidationError(() => priceCartForStripe([item("0011", "Blue", "L", "Set")]), /Invalid color/);
  assertValidationError(() => priceCartForStripe([item("0011", "Red", "XXL", "Set")]), /Invalid size/);
  assertValidationError(() => priceCartForStripe([item("TEST-PILLOW", "Red", "L")]), /does not support size/);
  assertValidationError(() => priceCartForStripe([item("TEST-PILLOW", "Red", null, "Set")]), /does not support style/);
});

test("rejects unavailable products and variants", () => {
  assertValidationError(() => priceCartForStripe([item("TEST-COMING-SOON", "Blue")]), /not available for purchase/);
  // 0012 is off-site backstock: in the catalog, in stock, but never purchasable.
  assertValidationError(() => priceCartForStripe([item("0012", "Red")]), /not available for purchase/);
  assertValidationError(() => priceCartForStripe([item("TEST-PILLOW", "Black")]), /quantity is unavailable/);
  assertValidationError(() => priceCartForStripe([item("0004", "Gold", null, "Bonnet")]), /quantity is unavailable/);
  assertValidationError(() => priceCartForStripe([item("0004", "Gold", null, "Set")]), /quantity is unavailable/);
  assertValidationError(() => priceCartForStripe([item("0004", "Red", null, "Bonnet")]), /quantity is unavailable/);
  assertValidationError(() => priceCartForStripe([item("0008", "Blue", "Skully")]), /quantity is unavailable/);
  assertValidationError(() => priceCartForStripe([item("0011", "Red", "M", "Set")]), /quantity is unavailable/);
});

test("shares Bonnet and Durag component stock across Set and single lines", () => {
  const valid = priceCartForStripe([
    item("0004", "Pink", null, "Set", 2),
    item("0004", "Pink", null, "Bonnet", 1),
  ]);
  assert.equal(valid.lineItems.length, 2);

  assertValidationError(
    () => priceCartForStripe([
      item("0004", "Pink", null, "Set", 2),
      item("0004", "Pink", null, "Bonnet", 2),
    ]),
    /quantity is unavailable/,
  );
  assertValidationError(
    () => priceCartForStripe([
      item("0004", "Blue", null, "Set"),
      item("0004", "Blue", null, "Durag"),
    ]),
    /quantity is unavailable/,
  );
});

test("rejects malformed and excessive quantities", () => {
  for (const quantity of [0, -1, 1.5, "1", null, NaN]) {
    assertValidationError(
      () => priceCartForStripe([item("0004", "Pink", null, "Bonnet", quantity)]),
      /Quantity must be a positive integer/
    );
  }
  assertValidationError(
    () => priceCartForStripe([item("0004", "Pink", null, "Bonnet", MAX_QUANTITY_PER_VARIANT + 1)]),
    /cannot exceed/
  );
});

test("aggregates duplicate variants before checking stock", () => {
  const priced = priceCartForStripe([
    item("0010", "Blue"),
    item("0010", "Blue"),
  ]);
  assert.equal(priced.lineItems.length, 1);
  assert.equal(priced.lineItems[0].quantity, 2);

  assertValidationError(
    () =>
      priceCartForStripe([
        item("0010", "Blue", null, null, 2),
        item("0010", "Blue"),
      ]),
    /quantity is unavailable/
  );
});

test("keeps different variants separate during aggregation", () => {
  const priced = priceCartForStripe([
    item("0011", "Red", "L", "Top"),
    item("0011", "Pink", "L", "Top"),
    item("0011", "Red", "XL", "Top"),
  ]);
  assert.equal(priced.lineItems.length, 3);
});

test("enforces cart line and aggregate quantity limits", () => {
  assertValidationError(
    () => priceCartForStripe(Array.from({ length: MAX_CART_LINES + 1 }, () => item("0004", "Pink", null, "Bonnet"))),
    /more than/
  );
  assertValidationError(
    () =>
      priceCartForStripe([
        item("0004", "Pink", null, "Bonnet", 99),
        item("0004", "Gold", null, "Durag", 99),
        item("0004", "Blue", null, "Set", MAX_TOTAL_QUANTITY - 197),
      ]),
    /Cart quantity cannot exceed/
  );
});

test("validates empty carts and item shapes", () => {
  assertValidationError(() => priceCartForStripe([]), /at least one item/);
  assertValidationError(() => priceCartForStripe(null), /at least one item/);
  assertValidationError(() => priceCartForStripe([null]), /must be an object/);
  assertValidationError(() => priceCartForStripe([[]]), /must be an object/);
});

test("validates promo codes without relying on secrecy", () => {
  assert.equal(normalizePromoCode(null), null);
  assert.equal(normalizePromoCode("   "), null);
  assert.deepEqual(normalizePromoCode(" cig20 "), { code: "CIG20", discountBasisPoints: 2000 });
  assertValidationError(() => normalizePromoCode("FREE100"), /not valid/);
  assertValidationError(() => normalizePromoCode(20), /must be a string/);
});
