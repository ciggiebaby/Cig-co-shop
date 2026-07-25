const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { PRODUCTS } = require("../products.js");

function loadFrontend({
  href,
  storedCart,
} = {}) {
  const statusElement = { hidden: true, textContent: "" };
  const storage = new Map();
  if (storedCart) {
    storage.set("cig_co_cart_v1", JSON.stringify(storedCart));
  }
  let storageWrites = 0;
  const historyCalls = [];
  const history = {
    state: { existing: true },
    replaceState(state, title, url) {
      this.state = state;
      historyCalls.push({ state, title, url });
    },
  };
  const context = vm.createContext({
    PRODUCTS,
    URL,
    console,
    document: {
      getElementById: (id) =>
        id === "checkout-status" ? statusElement : null,
      querySelectorAll: () => [],
    },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem(key, value) {
        storageWrites += 1;
        storage.set(key, value);
      },
    },
    module: { exports: {} },
    window: href ? { history, location: { href } } : {},
  });

  for (const filename of ["cart.js", "app.js"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
    vm.runInContext(source, context, { filename });
  }

  return {
    helpers: context.module.exports,
    historyCalls,
    statusElement,
    storage,
    storageWrites: () => storageWrites,
  };
}

const { buildCheckoutRequestBody } = loadFrontend().helpers;
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

test("shows cancelled wording, preserves the cart, and cleans only checkout", () => {
  const cart = [
    {
      productId: "0003",
      name: "CIG Pillow Case",
      price: 10,
      color: "Red",
      size: null,
      style: null,
      qty: 2,
    },
  ];
  const frontend = loadFrontend({
    href:
      "https://shop.test/?campaign=archive&checkout=cancelled&source=email#shop",
    storedCart: cart,
  });

  assert.equal(
    frontend.statusElement.textContent,
    "Checkout was cancelled. Your bag is still saved whenever you’re ready.",
  );
  assert.equal(frontend.statusElement.hidden, false);
  assert.deepEqual(frontend.historyCalls, [
    {
      state: { existing: true },
      title: "",
      url: "/?campaign=archive&source=email#shop",
    },
  ]);
  assert.equal(frontend.storageWrites(), 0);
  assert.deepEqual(
    JSON.parse(frontend.storage.get("cig_co_cart_v1")),
    cart,
  );
});

test("shows pending wording after an unverified success and keeps the cart", () => {
  const cart = [
    {
      productId: "0011",
      name: "CIG Paisley Bikini (Set)",
      price: 45,
      color: "Red",
      size: "L",
      style: "Set",
      qty: 1,
    },
  ];
  const frontend = loadFrontend({
    href: "https://shop.test/?checkout=success#top",
    storedCart: cart,
  });

  assert.equal(
    frontend.statusElement.textContent,
    "You returned from checkout. Payment confirmation is still pending, so your bag has been kept for now.",
  );
  assert.equal(frontend.statusElement.hidden, false);
  assert.equal(frontend.historyCalls[0].url, "/#top");
  assert.equal(frontend.storageWrites(), 0);
  assert.deepEqual(
    JSON.parse(frontend.storage.get("cig_co_cart_v1")),
    cart,
  );
});

test("unknown or missing checkout values leave the banner and URL untouched", () => {
  for (const href of [
    "https://shop.test/?checkout=unknown&campaign=archive#shop",
    "https://shop.test/?campaign=archive#shop",
  ]) {
    const frontend = loadFrontend({ href });

    assert.equal(frontend.statusElement.hidden, true);
    assert.equal(frontend.statusElement.textContent, "");
    assert.deepEqual(frontend.historyCalls, []);
    assert.equal(frontend.storageWrites(), 0);
  }
});
