const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { PRODUCTS } = require("../products.js");
const fingerprintUtility = require("../checkout-fingerprint.js");

function loadFrontend({
  fetchImpl,
  fingerprintApi,
  href,
  paymentMethods = [],
  promoCode = null,
  storedCart,
} = {}) {
  const statusElement = { hidden: true, textContent: "" };
  const errorElement = { textContent: "" };
  const loadingElement = { hidden: true };
  const optinElement = { checked: false };
  const checkoutFields = {
    "checkout-email": { value: "customer@example.com" },
    "checkout-name": { value: "Customer" },
    "checkout-address": { value: "1 Test Street" },
    "checkout-city": { value: "Test City" },
  };
  const developerErrors = [];
  const paymentButtons = paymentMethods.map((method) => {
    const listeners = new Map();
    return {
      dataset: { method },
      disabled: false,
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      click() {
        const listener = listeners.get("click");
        return listener ? listener() : undefined;
      },
    };
  });
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
  const windowObject = {
    history,
    location: { href: href || "https://shop.test/" },
  };
  if (fingerprintApi) {
    windowObject.CIGCheckoutFingerprint = fingerprintApi;
  }
  const context = vm.createContext({
    PRODUCTS,
    PROMO_CODES: {
      CIG10: { discount: 0.1, label: "10% off" },
    },
    URL,
    console: {
      error(...args) {
        developerErrors.push(args);
      },
    },
    document: {
      getElementById(id) {
        if (id === "checkout-status") return statusElement;
        if (id === "checkout-error") return errorElement;
        if (id === "checkout-loading") return loadingElement;
        if (id === "checkout-optin") return optinElement;
        return checkoutFields[id] || null;
      },
      querySelectorAll: (selector) =>
        selector === ".pay-btn" ? paymentButtons : [],
    },
    fetch: fetchImpl,
    getSavedPromo: () => promoCode,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem(key, value) {
        storageWrites += 1;
        storage.set(key, value);
      },
    },
    module: { exports: {} },
    window: windowObject,
  });

  for (const filename of ["cart.js", "app.js"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
    vm.runInContext(source, context, { filename });
  }

  return {
    developerErrors,
    errorElement,
    helpers: context.module.exports,
    historyCalls,
    loadingElement,
    paymentButtons,
    statusElement,
    storage,
    storageWrites: () => storageWrites,
    window: windowObject,
  };
}

const {
  addCheckoutFingerprint,
  buildCheckoutRequestBody,
  productTotalStock,
  variantStock,
} = loadFrontend().helpers;
const customer = {
  email: "customer@example.com",
  name: "Customer",
  address: "1 Test Street",
  city: "Test City",
};

test("frontend availability derives Set stock from shared Bonnet and Durag counts", () => {
  const product = PRODUCTS.find((entry) => entry.id === "0004");
  assert.equal(variantStock(product, "Set", "Pink", null), 2);
  assert.equal(variantStock(product, "Bonnet", "Pink", null), 3);
  assert.equal(variantStock(product, "Durag", "Pink", null), 2);
  assert.equal(variantStock(product, "Set", "Blue", null), 1);
  assert.equal(variantStock(product, "Set", "Gold", null), 0);
  assert.equal(variantStock(product, "Bonnet", "Gold", null), 0);
  assert.equal(variantStock(product, "Durag", "Gold", null), 1);
  assert.equal(variantStock(product, "Durag", "Red", null), 2);
  assert.equal(variantStock(product, "Set", "Red", null), 0); // 2 durags, but no bonnet to pair
  assert.equal(productTotalStock(product), 10);
});

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

test("adds a fingerprint generated only from Stripe identity items and promo", async () => {
  const fingerprintCalls = [];
  const fingerprintApi = {
    async createCheckoutFingerprint(items, promoCode) {
      fingerprintCalls.push({ items, promoCode });
      return "v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    },
  };
  const cart = [
    {
      productId: "0011",
      name: "Untrusted display name",
      price: 0.01,
      image: "untrusted.jpg",
      color: "Red",
      size: "L",
      style: "Set",
      qty: 2,
      subtotal: 0.02,
      total: 0.01,
      discountAmount: 999,
    },
  ];
  const basePayload = buildCheckoutRequestBody(
    "stripe",
    cart,
    cart,
    customer,
    "CIG10",
  );
  const payload = await addCheckoutFingerprint(
    basePayload,
    "CIG10",
    fingerprintApi,
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(fingerprintCalls)),
    [
      {
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
      },
    ],
  );
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), {
    ...JSON.parse(JSON.stringify(basePayload)),
    checkoutFingerprint:
      "v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
});

test("integrated fingerprints remain stable across line order and duplicates", async () => {
  const duplicateCart = [
    {
      productId: "0003",
      name: "CIG Pillow Case",
      price: 10,
      color: "Red",
      size: null,
      style: null,
      qty: 1,
    },
    {
      productId: "0004",
      name: "CIG Silky Bonnet & Durag (Durag)",
      price: 12,
      color: "Gold",
      size: null,
      style: "Durag",
      qty: 1,
    },
    {
      productId: "0003",
      name: "CIG Pillow Case",
      price: 10,
      color: "Red",
      size: null,
      style: null,
      qty: 1,
    },
  ];
  const aggregatedReorderedCart = [
    { ...duplicateCart[1] },
    { ...duplicateCart[0], qty: 2 },
  ];
  const firstBase = buildCheckoutRequestBody(
    "stripe",
    duplicateCart,
    duplicateCart,
    customer,
    null,
  );
  const secondBase = buildCheckoutRequestBody(
    "stripe",
    aggregatedReorderedCart,
    aggregatedReorderedCart,
    customer,
    null,
  );
  const [first, second] = await Promise.all([
    addCheckoutFingerprint(firstBase, null, fingerprintUtility),
    addCheckoutFingerprint(secondBase, null, fingerprintUtility),
  ]);

  assert.equal(first.checkoutFingerprint, second.checkoutFingerprint);
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

test("does not derive a style from parentheses on a non-styled product", () => {
  const payload = buildCheckoutRequestBody(
    "stripe",
    [
      {
        productId: "0003",
        name: "CIG Pillow Case (Limited)",
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

test("requires legacy Bonnet and Durag carts to be re-added when style is ambiguous", () => {
  assert.throws(
    () => buildCheckoutRequestBody(
      "stripe",
      [
        {
          productId: "0004",
          name: "His and Hers Silky & Bonnet (Single)",
          color: "Gold",
          size: null,
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

test("the Stripe click flow sends the fingerprinted existing payload", async () => {
  const requests = [];
  const fingerprintApi = {
    async createCheckoutFingerprint() {
      return "v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    },
  };
  const frontend = loadFrontend({
    fetchImpl: async (endpoint, options) => {
      requests.push({ endpoint, options });
      return {
        ok: true,
        async json() {
          return { url: "https://checkout.stripe.test/session" };
        },
      };
    },
    fingerprintApi,
    paymentMethods: ["stripe"],
    promoCode: "CIG10",
    storedCart: [
      {
        productId: "0011",
        name: "CIG Paisley Bikini (Set)",
        price: 45,
        image: "bikini.jpg",
        color: "Red",
        size: "L",
        style: "Set",
        qty: 2,
      },
    ],
  });

  await frontend.paymentButtons[0].click();

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].endpoint,
    "/.netlify/functions/create-stripe-session",
  );
  assert.deepEqual(JSON.parse(requests[0].options.body), {
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
    customer: {
      ...customer,
      marketingConsent: false,
    },
    checkoutFingerprint:
      "v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  });
  assert.equal(
    frontend.window.location.href,
    "https://checkout.stripe.test/session",
  );
  assert.equal(frontend.loadingElement.hidden, false);
  assert.equal(frontend.paymentButtons[0].disabled, false);
});

test("does not send checkout when fingerprint generation fails", async () => {
  let fetchCalls = 0;
  const fingerprintFailure = new Error("Web Crypto internal detail");
  const frontend = loadFrontend({
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("Fetch must not run.");
    },
    fingerprintApi: {
      async createCheckoutFingerprint() {
        throw fingerprintFailure;
      },
    },
    paymentMethods: ["stripe"],
    storedCart: [
      {
        productId: "0003",
        name: "CIG Pillow Case",
        price: 10,
        image: "pillow.jpg",
        color: "Red",
        size: null,
        style: null,
        qty: 1,
      },
    ],
  });

  await frontend.paymentButtons[0].click();

  assert.equal(fetchCalls, 0);
  assert.equal(frontend.loadingElement.hidden, true);
  assert.equal(frontend.paymentButtons[0].disabled, false);
  assert.equal(
    frontend.errorElement.textContent,
    "Checkout could not be prepared. Please refresh and try again.",
  );
  assert.doesNotMatch(
    frontend.errorElement.textContent,
    /Web Crypto internal detail/,
  );
  assert.equal(frontend.developerErrors.length, 1);
  assert.equal(frontend.developerErrors[0][1], fingerprintFailure);
});

test("blocks rapid duplicate submissions while fingerprinting is pending", async () => {
  let resolveFingerprint;
  let fingerprintCalls = 0;
  let fetchCalls = 0;
  const fingerprintPending = new Promise((resolve) => {
    resolveFingerprint = resolve;
  });
  const frontend = loadFrontend({
    fetchImpl: async () => {
      fetchCalls += 1;
      return {
        ok: true,
        async json() {
          return { url: "https://checkout.stripe.test/session" };
        },
      };
    },
    fingerprintApi: {
      createCheckoutFingerprint() {
        fingerprintCalls += 1;
        return fingerprintPending;
      },
    },
    paymentMethods: ["stripe", "paypal"],
    storedCart: [
      {
        productId: "0003",
        name: "CIG Pillow Case",
        price: 10,
        image: "pillow.jpg",
        color: "Red",
        size: null,
        style: null,
        qty: 1,
      },
    ],
  });

  const firstSubmission = frontend.paymentButtons[0].click();
  await frontend.paymentButtons[1].click();

  assert.equal(fingerprintCalls, 1);
  assert.equal(fetchCalls, 0);
  assert.equal(frontend.paymentButtons[0].disabled, true);
  assert.equal(frontend.paymentButtons[1].disabled, true);

  resolveFingerprint(
    "v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  );
  await firstSubmission;

  assert.equal(fetchCalls, 1);
  assert.equal(frontend.paymentButtons[0].disabled, false);
  assert.equal(frontend.paymentButtons[1].disabled, false);
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

test("shows pending wording, keeps the cart, and removes the returned session ID", () => {
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
    href:
      "https://shop.test/?campaign=archive&checkout=success&session_id=cs_test_123#top",
    storedCart: cart,
  });

  assert.equal(
    frontend.statusElement.textContent,
    "You returned from checkout. Payment confirmation is still pending, so your bag has been kept for now.",
  );
  assert.equal(frontend.statusElement.hidden, false);
  assert.equal(frontend.historyCalls[0].url, "/?campaign=archive#top");
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
