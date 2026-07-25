const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { PRODUCTS } = require("../products.js");

function loadFrontendHelpers() {
  const context = vm.createContext({
    PRODUCTS,
    console,
    document: {
      getElementById: () => null,
      querySelectorAll: () => [],
    },
    localStorage: {
      getItem: () => null,
      setItem() {},
    },
    module: { exports: {} },
    window: {},
  });

  for (const filename of ["cart.js", "app.js"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
    vm.runInContext(source, context, { filename });
  }

  return context.module.exports;
}

const { buildCheckoutRequestBody } = loadFrontendHelpers();
const customer = {
  email: "customer@example.com",
  name: "Customer",
  address: "1 Test Street",
  city: "Test City",
};

test("Stripe receives identifier-only items with quantity and Bikini style", () => {
  const payload = buildCheckoutRequestBody(
    "stripe",
    [
      {
        productId: "0011",
        name: "CIG Paisley Bikini (Set)",
        price: 0.01,
        image: "malicious.jpg",
        color: "Red",
        size: "L",
        style: "Set",
        qty: 2,
        subtotal: 0.02,
        total: 0.01,
        discountAmount: 999,
      },
    ],
    [],
    customer,
    "CIG10",
  );

  assert.deepEqual(JSON.parse(JSON.stringify(payload)), {
    items: [
      {
        productId: "0011",
        color: "Red",
        size: "L",
        style: "Set",
        quantity: 2,
      },
    ],
    promoCode: "CIG10",
    customer,
  });
});

test("recovers a legacy Bikini style through the existing cart fallback", () => {
  const payload = buildCheckoutRequestBody(
    "stripe",
    [
      {
        productId: "0011",
        name: "CIG Paisley Bikini (Top)",
        color: "Pink",
        size: "M",
        qty: 1,
      },
    ],
    [],
    customer,
    null,
  );

  assert.equal(payload.items[0].style, "Top");
});

test("does not derive a style from a non-styled product name", () => {
  const payload = buildCheckoutRequestBody(
    "stripe",
    [
      {
        productId: "0004",
        name: "His and Hers Silky & Bonnet (Single)",
        color: "Red",
        size: null,
        qty: 1,
      },
    ],
    [],
    customer,
    null,
  );

  assert.equal(payload.items[0].style, null);
});

test("rejects a styled legacy item with no recoverable catalog style", () => {
  assert.throws(
    () =>
      buildCheckoutRequestBody(
        "stripe",
        [
          {
            productId: "0011",
            name: "CIG Paisley Bikini",
            color: "Red",
            size: "L",
            qty: 1,
          },
        ],
        [],
        customer,
        null,
      ),
    /remove it from your bag and re-add it/i,
  );
});

test("preserves PayPal and Coinbase request bodies", () => {
  const cart = [
    {
      productId: "0003",
      name: "CIG Pillow Case",
      price: 10,
      image: "pillow-red.jpg",
      color: "Red",
      size: null,
      style: null,
      qty: 2,
    },
  ];
  const cartToCharge = [{ ...cart[0], price: 9 }];
  const expected = {
    cart: cartToCharge,
    customer,
    promoCode: "CIG10",
  };

  for (const method of ["paypal", "coinbase"]) {
    const payload = buildCheckoutRequestBody(
      method,
      cart,
      cartToCharge,
      customer,
      "CIG10",
    );
    assert.deepEqual(JSON.parse(JSON.stringify(payload)), expected);
    assert.equal(payload.cart, cartToCharge);
  }
});
