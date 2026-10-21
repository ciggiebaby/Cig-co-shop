const assert = require("node:assert/strict");
const test = require("node:test");

const { PROMO_CODES } = require("../promo.js");
const {
  PricingValidationError,
  normalizePromoCode,
  priceCartForStripe,
} = require("../netlify/lib/stripe-pricing.js");

test("no promo codes are active", () => {
  assert.deepEqual(Object.keys(PROMO_CODES), []);
});

test("retired codes are rejected by the server", () => {
  for (const code of ["CIG5", "cig10", " CIG20 "]) {
    assert.throws(() => normalizePromoCode(code), PricingValidationError);
    assert.throws(
      () => priceCartForStripe([{ productId: "0003", color: "Red", quantity: 1 }], code),
      /Promo code is not valid/,
    );
  }
  assert.equal(
    priceCartForStripe([{ productId: "0003", color: "Red", quantity: 1 }], null).totalCents,
    1000,
  );
});
