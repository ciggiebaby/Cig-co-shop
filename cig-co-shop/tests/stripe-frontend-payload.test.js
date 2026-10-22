require("./legacy-fixture.js");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { PRODUCTS } = require("../products.js");
const fingerprintUtility = require("../checkout-fingerprint.js");
const shippingRates = require("../shipping-rates.js");
require("./shipping-fixture.js");

function loadFrontend({
  fetchImpl,
  fingerprintApi,
  href,
  paymentMethods = [],
  promoCode = null,
  promoCodes = { CIG10: { discount: 0.1, label: "10% off" } },
  storedCart,
  fieldOverrides = {},
  shipCountry = "US",
  // The crypto flow is tested switched on; the live value is checked separately.
  cryptoEnabled = true,
} = {}) {
  const countrySelect = {
    value: shipCountry,
    options: Object.keys(shippingRates.SHIP_TO_COUNTRIES).map((value) => ({ value, disabled: false })),
    addEventListener() {},
  };
  const shippingNoteElement = { hidden: true, textContent: "" };
  const summaryElement = { innerHTML: "" };
  const promoMessageElement = {
    textContent: "",
    classes: new Set(),
    classList: {
      add(name) { promoMessageElement.classes.add(name); },
      remove(name) { promoMessageElement.classes.delete(name); },
    },
  };
  const statusElement = { hidden: true, textContent: "" };
  const errorElement = { textContent: "" };
  const loadingElement = { hidden: true };
  const optinElement = { checked: false };
  // Minimal stand-in for the product sheet: only the aria-hidden flag matters,
  // since that is what actually shows and hides it.
  const productModalElement = {
    attributes: { "aria-hidden": "true" },
    getAttribute(name) {
      return this.attributes[name];
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener() {},
  };
  const checkoutFields = {
    "checkout-email": { value: "customer@example.com" },
    "checkout-name": { value: "Customer" },
    "checkout-address": { value: "1 Test Street" },
    "checkout-city": { value: "Test City" },
    "checkout-state": { value: "tx" },
    "checkout-zip": { value: "78701" },
    "checkout-duties-note": { hidden: true },
    "checkout-pccc-row": { hidden: true },
    "checkout-mask-shipping-note": { hidden: true, textContent: "" },
    "product-grid": { innerHTML: "", querySelectorAll: () => [] },
  };
  for (const [id, value] of Object.entries(fieldOverrides)) {
    checkoutFields[id] = { value };
  }
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
  // Stand-ins for the crypto-only copy and its card/PayPal replacement.
  const cryptoToggles = {
    "[data-crypto-only]": [{ hidden: true }, { hidden: true }],
    "[data-crypto-off]": [{ hidden: true }],
  };
  const storage = new Map();
  if (storedCart) {
    storage.set("cig_co_cart_v1", JSON.stringify(storedCart));
  }
  let storageWrites = 0;
  const historyCalls = [];
  const historyStack = [];
  const history = {
    state: { existing: true },
    replaceState(state, title, url) {
      this.state = state;
      historyCalls.push({ state, title, url });
    },
    pushState(state, title, url) {
      historyStack.push(this.state);
      this.state = state;
    },
    // Stands in for the phone's Back gesture: unwind one entry and notify.
    back() {
      this.state = historyStack.pop() || null;
      const handler = windowListeners.get("popstate");
      if (handler) handler({ state: this.state });
    },
  };
  const windowListeners = new Map();
  const documentListeners = new Map();
  const windowObject = {
    history,
    location: { href: href || "https://shop.test/" },
    addEventListener(type, listener) {
      windowListeners.set(type, listener);
    },
  };
  if (fingerprintApi) {
    windowObject.CIGCheckoutFingerprint = fingerprintApi;
  }
  const context = vm.createContext({
    PRODUCTS,
    PROMO_CODES: promoCodes,
    CRYPTO_ENABLED: cryptoEnabled,
    SHIP_TO_COUNTRIES: shippingRates.SHIP_TO_COUNTRIES,
    quoteShipping: shippingRates.quoteShipping,
    MASK_SHIPPING_NOTE: shippingRates.MASK_SHIPPING_NOTE,
    slowDeliveryNote: shippingRates.slowDeliveryNote,
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
        if (id === "product-modal") return productModalElement;
        if (id === "promo-message") return promoMessageElement;
        if (id === "checkout-country") return countrySelect;
        if (id === "checkout-shipping-note") return shippingNoteElement;
        if (id === "checkout-summary") return summaryElement;
        return checkoutFields[id] || null;
      },
      querySelectorAll: (selector) =>
        selector === ".pay-btn" ? paymentButtons : (cryptoToggles[selector] || []),
      addEventListener(type, listener) {
        documentListeners.set(type, listener);
      },
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
    checkoutFields,
    cryptoToggles,
    context,
    countrySelect,
    shippingNoteElement,
    summaryElement,
    developerErrors,
    errorElement,
    helpers: context.module.exports,
    historyCalls,
    loadingElement,
    paymentButtons,
    productModalElement,
    promoMessageElement,
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

test("the phone Back gesture closes the product sheet instead of leaving the shop", () => {
  const { context, productModalElement, window: win } = loadFrontend();

  // Open the sheet the way openProductModal does.
  productModalElement.setAttribute("aria-hidden", "false");
  context.pushProductModalHistory();

  win.history.back();

  assert.equal(productModalElement.getAttribute("aria-hidden"), "true");
  // Back consumed only the sheet's own entry, so the shop page is still here.
  assert.deepEqual(win.history.state, { existing: true });
});

test("closing the sheet any other way unwinds its history entry too", () => {
  const { context, productModalElement, window: win } = loadFrontend();

  productModalElement.setAttribute("aria-hidden", "false");
  context.pushProductModalHistory();
  context.dismissProductModal();

  assert.equal(productModalElement.getAttribute("aria-hidden"), "true");
  // Without this the entry is orphaned and the next Back appears to do nothing.
  assert.deepEqual(win.history.state, { existing: true });
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
      productId: "TEST-PILLOW",
      name: "Test Pillow Case",
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
      productId: "TEST-PILLOW",
      name: "Test Pillow Case",
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
        productId: "TEST-PILLOW",
        name: "Test Pillow Case (Limited)",
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

test("PayPal and Coinbase send the same catalog-only payload as Stripe (no prices)", () => {
  const cart = [
    {
      productId: "TEST-PILLOW",
      name: "Test Pillow Case",
      price: 10,
      image: "pillow-red.jpg",
      color: "Red",
      size: null,
      style: null,
      qty: 2,
    },
  ];
  const cartToCharge = [{ ...cart[0], price: 0.01 }];
  const expected = {
    items: [
      { productId: "TEST-PILLOW", color: "Red", size: null, style: null, quantity: 2 },
    ],
    promoCode: "CIG10",
    customer,
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
        productId: "TEST-PILLOW",
        name: "Test Pillow Case",
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
        productId: "TEST-PILLOW",
        name: "Test Pillow Case",
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
      productId: "TEST-PILLOW",
      name: "Test Pillow Case",
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

test("PayPal and crypto buttons refuse print-on-demand items before calling the server", async () => {
  const podProduct = {
    id: "test-pod-frontend",
    sku: "TEST-POD",
    name: "Test POD Hoodie",
    price: 65,
    image: "",
    colors: [],
    sizes: ["M"],
    pod: { files: [{ url: "https://example.com/a.png" }], variants: { "M": 1 } },
  };
  PRODUCTS.push(podProduct);
  try {
    let fetchCalls = 0;
    const frontend = loadFrontend({
      fetchImpl: async () => {
        fetchCalls += 1;
        return { ok: true, async json() { return { url: "https://pay.test" }; } };
      },
      paymentMethods: ["paypal", "crypto"],
      storedCart: [
        { productId: podProduct.id, name: podProduct.name, price: 65, image: "", color: null, size: "M", style: null, qty: 1 },
      ],
    });
    for (const button of frontend.paymentButtons) {
      await button.click();
      assert.equal(frontend.errorElement.textContent, "Made-to-order items can only be paid by card for now.");
    }
    assert.equal(fetchCalls, 0);
  } finally {
    PRODUCTS.splice(PRODUCTS.indexOf(podProduct), 1);
  }
});

test("an entered code that isn't in promo.js shows 'invalid' and applies no discount", () => {
  const { context, promoMessageElement } = loadFrontend({ promoCodes: {} });
  context.applyPromoCode("cig10");
  assert.equal(promoMessageElement.textContent, "That code isn't valid.");
  assert.equal(promoMessageElement.classes.has("promo-error"), true);
  assert.equal(vm.runInContext("promoState", context), null);
});

test("crypto checkout never stacks a promo code with the 20% crypto discount", async () => {
  const requests = [];
  const frontend = loadFrontend({
    fetchImpl: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return { ok: true, async json() { return { url: "https://pay.test" }; } };
    },
    paymentMethods: ["crypto", "paypal"],
    promoCode: "CIG10",
    storedCart: [
      { productId: "TEST-PILLOW", name: "Test Pillow Case", price: 10, image: "", color: "Red", size: null, style: null, qty: 2 },
    ],
  });
  await frontend.paymentButtons[0].click();
  await frontend.paymentButtons[1].click();
  const [crypto, paypal] = requests;
  assert.match(crypto.url, /create-coinbase-charge/);
  assert.equal(crypto.body.promoCode, null);
  assert.equal(crypto.body.items[0].price, undefined);
  assert.match(paypal.url, /create-paypal-order/);
  assert.equal(paypal.body.promoCode, "CIG10");
});

test("Arcade codes are checked with the server before they're applied", async () => {
  const { isArcadeCode } = require("../promo.js");
  const requests = [];
  let reply = { valid: true, code: "CIG10-HXRN5K63", discount: 0.1, label: "10% off" };
  const { context, promoMessageElement } = loadFrontend({
    promoCodes: {},
    fetchImpl: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return { ok: true, async json() { return reply; } };
    },
  });
  context.isArcadeCode = isArcadeCode;
  context.savePromoWin = () => {};
  context.clearSavedPromo = () => {};

  await context.applyPromoCode("cig10-hxrn5k63");
  assert.deepEqual(requests, [{ url: "/.netlify/functions/validate-promo", body: { code: "CIG10-HXRN5K63" } }]);
  assert.equal(vm.runInContext("promoState", context), "CIG10-HXRN5K63");
  assert.equal(vm.runInContext("promoDetails('CIG10-HXRN5K63').discount", context), 0.1);
  assert.match(promoMessageElement.textContent, /Code applied — 10% off/);

  reply = { valid: false, error: "This code has already been used." };
  await context.applyPromoCode("CIG15-ABCDEFGH");
  assert.equal(vm.runInContext("promoState", context), null);
  assert.equal(promoMessageElement.textContent, "This code has already been used.");
  assert.equal(promoMessageElement.classes.has("promo-error"), true);
});

test("crypto checkout sends a US state, ZIP, and country", async () => {
  const requests = [];
  const frontend = loadFrontend({
    fetchImpl: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200, async json() { return { url: "https://pay.test" }; } };
    },
    paymentMethods: ["crypto"],
    storedCart: [
      { productId: "TEST-PILLOW", name: "Test Pillow Case", price: 10, image: "", color: "Red", size: null, style: null, qty: 1 },
    ],
  });
  await frontend.paymentButtons[0].click();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.customer.state, "TX");
  assert.equal(requests[0].body.customer.zip, "78701");
  assert.equal(requests[0].body.customer.country, "US");
});

test("crypto checkout needs a US state and ZIP before it calls the server", async () => {
  for (const fieldOverrides of [{ "checkout-state": "" }, { "checkout-zip": "SW1A 1AA" }]) {
    const requests = [];
    const frontend = loadFrontend({
      fetchImpl: async (url) => { requests.push(url); return { ok: true, async json() { return { url: "x" }; } }; },
      paymentMethods: ["crypto"],
      fieldOverrides,
      storedCart: [
        { productId: "TEST-PILLOW", name: "Test Pillow Case", price: 10, image: "", color: "Red", size: null, style: null, qty: 1 },
      ],
    });
    await frontend.paymentButtons[0].click();
    assert.deepEqual(requests, []);
    assert.match(frontend.errorElement.textContent, /US/);
  }
});

test("server checkout rejections (like US-only shipping) are shown to the shopper as-is", async () => {
  const frontend = loadFrontend({
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      async json() { return { error: "Sorry, we only ship to US addresses right now." }; },
    }),
    paymentMethods: ["crypto"],
    storedCart: [
      { productId: "TEST-PILLOW", name: "Test Pillow Case", price: 10, image: "", color: "Red", size: null, style: null, qty: 1 },
    ],
  });
  await frontend.paymentButtons[0].click();
  assert.equal(frontend.errorElement.textContent, "Sorry, we only ship to US addresses right now.");
});

test("a PayPal us-only return shows a friendly banner and cleans the URL", () => {
  const frontend = loadFrontend({ href: "https://shop.test/?checkout=us-only#shop" });
  assert.equal(frontend.statusElement.hidden, false);
  assert.match(frontend.statusElement.textContent, /isn’t in the US/);
  assert.match(frontend.statusElement.textContent, /wasn’t taken/);
  assert.equal(frontend.historyCalls[0].url, "/#shop");
});

const bagItem = { productId: "T-BAG", name: "Test Crossbody Bag", price: 45, image: "", color: null, size: null, style: null, qty: 2 };
const pillowItem = { productId: "TEST-PILLOW", name: "Test Pillow Case", price: 10, image: "", color: "Red", size: null, style: null, qty: 1 };

test("checkout summary shows the shipping cost for the chosen country before paying", () => {
  const frontend = loadFrontend({ shipCountry: "CA", storedCart: [bagItem] });
  frontend.context.renderCheckoutSummary();
  assert.match(frontend.summaryElement.innerHTML, /Shipping \(Canada\)<\/span><span>\$16\.00/);
  assert.match(frontend.summaryElement.innerHTML, /Total<\/span><span>\$106\.00/);
  frontend.countrySelect.value = "US";
  frontend.context.renderCheckoutSummary();
  assert.match(frontend.summaryElement.innerHTML, /Shipping \(United States\)<\/span><span>Free/);
  assert.match(frontend.summaryElement.innerHTML, /Total<\/span><span>\$90\.00/);
});

test("a pillow in the bag disables non-US countries and explains why", () => {
  const frontend = loadFrontend({ shipCountry: "GB", storedCart: [bagItem, pillowItem] });
  frontend.context.renderCheckoutSummary();
  assert.equal(frontend.countrySelect.value, "US");
  assert.deepEqual(
    frontend.countrySelect.options.map((option) => [option.value, option.disabled]),
    [["US", false], ["CA", true], ["GB", true], ["DE", true], ["AU", true], ["JP", true], ["KR", true]],
  );
  assert.equal(frontend.shippingNoteElement.hidden, false);
  assert.match(frontend.shippingNoteElement.textContent, /Test Pillow Case ships to the US only/);
});

test("Japan and South Korea are selectable for bags, cases and sleeves; cases warn about ~30 days", () => {
  const caseItem = { productId: "T-CASE", name: "Test MagSafe Case", price: 30, image: "", color: null, size: null, style: null, qty: 1 };
  const sleeveItem = { productId: "T-SLEEVE", name: "Test Laptop Sleeve", price: 35, image: "", color: null, size: null, style: null, qty: 1 };
  const frontend = loadFrontend({ shipCountry: "JP", storedCart: [bagItem, caseItem, sleeveItem] });
  frontend.context.renderCheckoutSummary();
  assert.equal(frontend.countrySelect.value, "JP");
  assert.ok(frontend.countrySelect.options.every((option) => option.disabled === false));
  // JP: bag $5 x2 + case $6 + sleeve $8
  assert.match(frontend.summaryElement.innerHTML, /Shipping \(Japan\)<\/span><span>\$24\.00/);
  assert.equal(frontend.shippingNoteElement.hidden, false);
  assert.match(frontend.shippingNoteElement.textContent, /Test MagSafe Case to Japan takes about 30 days/);
  frontend.countrySelect.value = "KR";
  frontend.context.renderCheckoutSummary();
  // KR: bag $13 x2 + case $9 + sleeve $18
  assert.match(frontend.summaryElement.innerHTML, /Shipping \(South Korea\)<\/span><span>\$53\.00/);
  assert.match(frontend.shippingNoteElement.textContent, /South Korea takes about 30 days/);
  frontend.countrySelect.value = "GB";
  frontend.context.renderCheckoutSummary();
  assert.equal(frontend.shippingNoteElement.hidden, true);
  const bagOnly = loadFrontend({ shipCountry: "KR", storedCart: [bagItem] });
  bagOnly.context.renderCheckoutSummary();
  assert.equal(bagOnly.shippingNoteElement.hidden, true);
});

test("card and PayPal send the chosen country; US payloads stay unchanged", async () => {
  const requests = [];
  const frontend = loadFrontend({
    fetchImpl: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200, async json() { return { url: "https://pay.test" }; } };
    },
    paymentMethods: ["paypal"],
    shipCountry: "AU",
    storedCart: [bagItem],
  });
  await frontend.paymentButtons[0].click();
  assert.equal(requests[0].body.shipCountry, "AU");
  assert.equal(requests[0].body.customer.country, undefined);
  frontend.countrySelect.value = "US";
  await frontend.paymentButtons[0].click();
  assert.equal(requests[1].body.shipCountry, undefined);
});

test("international carts show the duties notice and no crypto line; US carts don't", () => {
  const frontend = loadFrontend({ shipCountry: "CA", storedCart: [bagItem] });
  frontend.context.renderCheckoutSummary();
  assert.equal(frontend.checkoutFields["checkout-duties-note"].hidden, false);
  assert.doesNotMatch(frontend.summaryElement.innerHTML, /Crypto/);
  for (const country of ["GB", "DE", "AU", "JP", "KR"]) {
    frontend.countrySelect.value = country;
    frontend.context.renderCheckoutSummary();
    assert.equal(frontend.checkoutFields["checkout-duties-note"].hidden, false, country);
    assert.doesNotMatch(frontend.summaryElement.innerHTML, /Crypto/, country);
  }
  frontend.countrySelect.value = "US";
  frontend.context.renderCheckoutSummary();
  assert.equal(frontend.checkoutFields["checkout-duties-note"].hidden, true);
});

test("the PCCC field shows only for South Korea", () => {
  const frontend = loadFrontend({ shipCountry: "KR", storedCart: [bagItem] });
  frontend.context.renderCheckoutSummary();
  assert.equal(frontend.checkoutFields["checkout-pccc-row"].hidden, false);
  frontend.countrySelect.value = "JP";
  frontend.context.renderCheckoutSummary();
  assert.equal(frontend.checkoutFields["checkout-pccc-row"].hidden, true);
});

test("South Korea card checkout requires a valid PCCC and sends it; other countries never send it", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push(JSON.parse(init.body));
    return { ok: true, status: 200, async json() { return { url: "https://pay.test" }; } };
  };
  for (const bad of ["", "123456789012", "P12345678901", "P1234567890123", "Q123456789012"]) {
    const frontend = loadFrontend({
      fetchImpl, paymentMethods: ["paypal"], shipCountry: "KR", storedCart: [bagItem],
      fieldOverrides: { "checkout-pccc": bad },
    });
    await frontend.paymentButtons[0].click();
    assert.equal(requests.length, 0, bad);
    assert.match(frontend.errorElement.textContent, /Personal Customs Clearance Code/);
  }
  const ok = loadFrontend({
    fetchImpl, paymentMethods: ["paypal"], shipCountry: "KR", storedCart: [bagItem],
    fieldOverrides: { "checkout-pccc": " p1234-5678-9012 " },
  });
  await ok.paymentButtons[0].click();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].shipCountry, "KR");
  assert.equal(requests[0].customer.pccc, "P123456789012");

  const jp = loadFrontend({
    fetchImpl, paymentMethods: ["paypal"], shipCountry: "JP", storedCart: [bagItem],
    fieldOverrides: { "checkout-pccc": "P123456789012" },
  });
  await jp.paymentButtons[0].click();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].customer.pccc, undefined);
});

test("checkout won't start abroad when the bag has a pillow", async () => {
  const requests = [];
  const frontend = loadFrontend({
    fetchImpl: async (url) => { requests.push(url); return { ok: true, async json() { return { url: "x" }; } }; },
    paymentMethods: ["stripe"],
    shipCountry: "DE",
    storedCart: [pillowItem],
  });
  await frontend.paymentButtons[0].click();
  assert.deepEqual(requests, []);
  assert.match(frontend.errorElement.textContent, /ships to the US only/);
});

test("international crypto orders need a postal code, not a US state", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push(JSON.parse(init.body));
    return { ok: true, status: 200, async json() { return { url: "https://pay.test" }; } };
  };
  const missing = loadFrontend({
    fetchImpl, paymentMethods: ["crypto"], shipCountry: "CA", storedCart: [bagItem],
    fieldOverrides: { "checkout-state": "", "checkout-zip": "" },
  });
  await missing.paymentButtons[0].click();
  assert.equal(requests.length, 0);
  assert.match(missing.errorElement.textContent, /postal code/);

  const ok = loadFrontend({
    fetchImpl, paymentMethods: ["crypto"], shipCountry: "CA", storedCart: [bagItem],
    fieldOverrides: { "checkout-state": "", "checkout-zip": "m5v 2t6" },
  });
  await ok.paymentButtons[0].click();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].shipCountry, "CA");
  assert.equal(requests[0].customer.country, "CA");
  assert.equal(requests[0].customer.zip, "M5V 2T6");
});

test("a PayPal country-mismatch return explains nothing was charged", () => {
  const frontend = loadFrontend({ href: "https://shop.test/?checkout=country-mismatch" });
  assert.equal(frontend.statusElement.hidden, false);
  assert.match(frontend.statusElement.textContent, /didn’t match the country you picked/);
  assert.match(frontend.statusElement.textContent, /wasn’t taken/);
});

test("the storefront card-only check follows POD_CARD_ONLY", async () => {
  const podProduct = {
    id: "test-pod-toggle", sku: "TEST-POD-T", name: "Test POD Tee", price: 30, image: "",
    colors: [], sizes: ["M"], pod: { files: [{ url: "https://example.com/a.png" }], variants: { "M": 1 } },
  };
  PRODUCTS.push(podProduct);
  try {
    let fetchCalls = 0;
    const frontend = loadFrontend({
      fetchImpl: async () => { fetchCalls += 1; return { ok: true, status: 200, async json() { return { url: "https://pay.test" }; } }; },
      paymentMethods: ["paypal"],
      storedCart: [{ productId: podProduct.id, name: podProduct.name, price: 30, image: "", color: null, size: "M", style: null, qty: 1 }],
    });
    frontend.context.POD_CARD_ONLY = true;
    await frontend.paymentButtons[0].click();
    assert.equal(fetchCalls, 0);
    frontend.context.POD_CARD_ONLY = false;
    await frontend.paymentButtons[0].click();
    assert.equal(fetchCalls, 1);
  } finally {
    PRODUCTS.splice(PRODUCTS.indexOf(podProduct), 1);
  }
});

// ---------- Crypto switch (CRYPTO_ENABLED in products.js; off per CIG 10/21) ----------

test("crypto is switched off on the live site", () => {
  const catalog = require("../products.js");
  assert.equal(catalog.CRYPTO_ENABLED, false);
});

test("with crypto off, the crypto button and 20%-off copy are hidden and the button never calls the server", async () => {
  const requests = [];
  const frontend = loadFrontend({
    cryptoEnabled: false,
    fetchImpl: async (url) => { requests.push(url); return { ok: true, async json() { return { url: "x" }; } }; },
    paymentMethods: ["stripe", "paypal", "crypto"],
    storedCart: [{ productId: "TEST-PILLOW", name: "Test Pillow Case", price: 10, image: "", color: "Red", size: null, style: null, qty: 1 }],
  });
  const [card, paypal, crypto] = frontend.paymentButtons;
  assert.equal(crypto.hidden, true);
  assert.equal(crypto.disabled, true);
  assert.notEqual(card.hidden, true);
  assert.notEqual(paypal.hidden, true);
  assert.ok(frontend.cryptoToggles["[data-crypto-only]"].every((el) => el.hidden === true));
  assert.ok(frontend.cryptoToggles["[data-crypto-off]"].every((el) => el.hidden === false));
  await crypto.click();
  assert.deepEqual(requests, []);
  assert.match(frontend.errorElement.textContent, /pay by card or PayPal/);

  frontend.context.applyPromoCode("cig10");
  assert.doesNotMatch(frontend.promoMessageElement.textContent, /[Cc]rypto/);
});

test("with crypto on, the button and crypto copy show and the promo note mentions it", () => {
  const frontend = loadFrontend({ cryptoEnabled: true, paymentMethods: ["crypto"] });
  assert.equal(frontend.paymentButtons[0].hidden, false);
  assert.equal(frontend.paymentButtons[0].disabled, false);
  assert.ok(frontend.cryptoToggles["[data-crypto-only]"].every((el) => el.hidden === false));
  assert.ok(frontend.cryptoToggles["[data-crypto-off]"].every((el) => el.hidden === true));
  frontend.context.applyPromoCode("cig10");
  assert.match(frontend.promoMessageElement.textContent, /Crypto checkout gets its 20% off instead/);
});

test("every crypto button and 20%-off line starts hidden in the HTML (no flash while off)", () => {
  for (const page of ["index.html", "gallery.html", "arcade.html"]) {
    const html = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
    const buttons = html.match(/<button[^>]*data-method="crypto"[^>]*>/g) || [];
    assert.equal(buttons.length, 1, page);
    assert.match(buttons[0], /data-crypto-only hidden/, page);
    // Any visible text mentioning crypto or 20% off must be inside a hidden crypto-only element.
    const visible = html
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<(\w+)[^>]*data-crypto-only hidden[^>]*>[\s\S]*?<\/\1>/g, "");
    assert.doesNotMatch(visible.replace(/<[^>]+>/g, " "), /crypto|20% off/i, page);
  }
});

// ---------- FW26/27 collection: one product per item type, priced per option ----------

test("the shop grid lists each FW26 item once with its approved price", () => {
  const frontend = loadFrontend();
  frontend.context.renderProductGrid();
  const html = frontend.checkoutFields["product-grid"].innerHTML;
  assert.equal((html.match(/data-id="FW26-BAG"/g) || []).length, 1);
  assert.match(html, /Crossbody Bag<\/div>\s*<div class="product-card-price">From \$65\.00</);
  assert.match(html, /MagSafe Case<\/div>\s*<div class="product-card-price">\$40\.00</);
  assert.match(html, /Laptop Sleeve<\/div>\s*<div class="product-card-price">From \$50\.00</);
  assert.match(html, /Throw Pillow<\/div>\s*<div class="product-card-price">From \$45\.00</);
  assert.doesNotMatch(html, /CIG (Utility Crossbody|MagSafe|Laptop Sleeve|Throw Pillow)/);
});

test("picking a color swaps the photo and the price (solid $65, Multi $75)", () => {
  const { context } = loadFrontend();
  const bag = PRODUCTS.find((p) => p.id === "FW26-BAG");
  assert.equal(context.currentPrice(bag, null, "Black", null), 65);
  assert.equal(context.currentPrice(bag, null, "Multi", null), 75);
  assert.equal(context.productImageForColor(bag, "Multi", null, null), bag.colorImages.Multi);
  assert.equal(context.productImageForColor(bag, "Gold", null, null), bag.colorImages.Gold);
  assert.notEqual(bag.colorImages.Multi, bag.colorImages.Gold);
  const phoneCase = PRODUCTS.find((p) => p.id === "FW26-CASE");
  assert.equal(context.productImageForColor(phoneCase, "Navy", "iPhone 16 Pro", null), phoneCase.colorImages.Navy);
  assert.equal(context.productImageForColor(phoneCase, "Navy", "iPhone 14", null), phoneCase.colorImages.Navy);
  assert.deepEqual(Array.from(context.productGalleryImages(bag, "Hunter", null, null)), [
    "assets/products/fw26/crossbody_hunter_front.webp",
    "assets/products/fw26/crossbody_hunter_right.webp",
    "assets/products/fw26/crossbody_hunter_left.webp",
    "assets/products/fw26/crossbody_hunter_back.webp",
  ]);
});

test("per-size prices win over per-color and base prices, matching the server", () => {
  const { context } = loadFrontend();
  const { catalogUnitPrice } = require("../netlify/lib/stripe-pricing.js");
  const product = { price: 50, salePrice: null, colorPrices: { Multi: 60 }, sizePrices: { L: 70 }, sizes: ["S", "L"], colors: ["Black", "Multi"] };
  const cases = [["Black", "S", 50], ["Multi", "S", 60], ["Black", "L", 70], ["Multi", "L", 70]];
  for (const [color, size, expected] of cases) {
    assert.equal(context.currentPrice(product, null, color, size), expected);
    assert.equal(catalogUnitPrice(product, null, color, size), expected);
  }
  assert.equal(context.minPrice(product), 50);
  assert.equal(context.minPrice({ ...product, sizePrices: { S: 45, L: 55 } }), 45);
});

test("adding the Multi crossbody to the bag sends only ids; the server prices it", () => {
  const frontend = loadFrontend();
  const body = frontend.helpers.buildCheckoutRequestBody(
    "stripe",
    [{ productId: "FW26-BAG", name: "Crossbody Bag", price: 75, color: "Multi", size: null, style: null, qty: 1 }],
    [],
    {},
    null,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(body.items)), [{ productId: "FW26-BAG", color: "Multi", size: null, style: null, quantity: 1 }]);
});

test("sleeve and pillow prices follow the picked size; the case picker is labelled Model", () => {
  const { context } = loadFrontend();
  const sleeve = PRODUCTS.find((p) => p.id === "FW26-SLEEVE");
  const pillow = PRODUCTS.find((p) => p.id === "FW26-PILLOW");
  assert.equal(context.currentPrice(sleeve, null, "Gold", "15″"), 55);
  assert.equal(context.currentPrice(pillow, null, "Gold", "22″×22″"), 58);
  assert.equal(context.minPrice(pillow), 45);
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.match(source, /<label>\$\{p\.sizeLabel \|\| "Size"\}<\/label>/);
});

test("before the drop, FW26 cards show a 'Drops Oct 30' badge; no SKUs anywhere; heading reads FW26/27 COLLECTION", () => {
  const frontend = loadFrontend();
  frontend.context.renderProductGrid();
  const html = frontend.checkoutFields["product-grid"].innerHTML;
  const now = Date.now();
  const dropOpen = now >= Date.parse(require("../products.js").DROP_AT);
  if (!dropOpen) assert.equal((html.match(/drop-badge">Drops Oct 30</g) || []).length, 4);
  assert.doesNotMatch(html, /SKU/);
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.doesNotMatch(app, /SKU: \$\{p\.sku\}/);
  const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(index, /<h2 class="section-title reveal">FW26\/27 COLLECTION<\/h2>/);
  assert.doesNotMatch(index, /Shop the Archive/);
  assert.match(index, /id="drop-test-row"[^>]*hidden/);
});

test("dropLocked follows the product's dropAt", () => {
  const { context } = loadFrontend();
  const p = { dropAt: "2026-10-30T12:00:00-04:00" };
  assert.equal(context.dropLocked(p, Date.parse("2026-10-30T11:59:59-04:00")), true);
  assert.equal(context.dropLocked(p, Date.parse("2026-10-30T12:00:00-04:00")), false);
  assert.equal(context.dropLocked({}, 0), false);
});

test("the drop test code is only sent in ?droptest mode", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push(JSON.parse(init.body));
    return { ok: true, status: 200, async json() { return { url: "https://pay.test" }; } };
  };
  const cart = [{ productId: "TEST-PILLOW", name: "Test Pillow Case", price: 10, image: "", color: "Red", size: null, style: null, qty: 1 }];
  const normal = loadFrontend({ fetchImpl, paymentMethods: ["paypal"], storedCart: cart, fieldOverrides: { "drop-test-code": "abc12345" } });
  await normal.paymentButtons[0].click();
  assert.equal(requests[0].dropTestCode, undefined);
  const testMode = loadFrontend({ href: "https://shop.test/?droptest", fetchImpl, paymentMethods: ["paypal"], storedCart: cart, fieldOverrides: { "drop-test-code": " abc12345 " } });
  await testMode.paymentButtons[0].click();
  assert.equal(requests[1].dropTestCode, "abc12345");
});

// Masks (liveStock backstock): $8.95 per US order unless the items total after
// promo is over $75 — the same shipping-rates.js rule the server charges.
const maskItem = (qty) => ({ productId: "0005", name: "CIG Paisley Balaclava", price: 25, image: "", color: "Red", size: null, style: null, qty });

test("checkout summary shows mask shipping: $8.95 at or under $75, free over $75, back after a promo", () => {
  const under = loadFrontend({ storedCart: [maskItem(3)] });
  under.context.renderCheckoutSummary();
  const maskNote = under.context.document.getElementById("checkout-mask-shipping-note");
  assert.match(under.summaryElement.innerHTML, /Shipping \(United States\)<\/span><span>\$8\.95/);
  assert.match(under.summaryElement.innerHTML, /Total<\/span><span>\$83\.95/);
  assert.equal(maskNote.hidden, false);
  assert.match(maskNote.textContent, /\$8\.95.*free over \$75/);

  const over = loadFrontend({ storedCart: [maskItem(4)] });
  over.context.renderCheckoutSummary();
  assert.match(over.summaryElement.innerHTML, /Shipping \(United States\)<\/span><span>Free/);
  assert.match(over.summaryElement.innerHTML, /Total<\/span><span>\$100\.00/);

  // $100 with CIG10 = $90 → still free; $80 with CIG10 = $72 → $8.95.
  const promoOver = loadFrontend({ storedCart: [maskItem(4)], promoCode: "CIG10" });
  promoOver.context.renderCheckoutSummary();
  assert.match(promoOver.summaryElement.innerHTML, /Shipping \(United States\)<\/span><span>Free/);
  const promoUnder = loadFrontend({ storedCart: [maskItem(2), { ...maskItem(1), productId: "0008", name: "CIG Acrylic Ski Mask", price: 30, size: "3-Hole" }], promoCode: "CIG10" });
  promoUnder.context.renderCheckoutSummary();
  assert.match(promoUnder.summaryElement.innerHTML, /Shipping \(United States\)<\/span><span>\$8\.95/);
  assert.match(promoUnder.summaryElement.innerHTML, /Total<\/span><span>\$80\.95/);
});

test("a mask in the bag disables non-US countries; FW26-only US stays free with no mask note", () => {
  const frontend = loadFrontend({ storedCart: [maskItem(1), bagItem] });
  frontend.context.renderCheckoutSummary();
  assert.ok(frontend.countrySelect.options.filter((o) => o.value !== "US").every((o) => o.disabled));
  assert.match(frontend.shippingNoteElement.textContent, /CIG Paisley Balaclava ships to the US only/);
  const fw = loadFrontend({ storedCart: [bagItem] });
  fw.context.renderCheckoutSummary();
  const maskNote = fw.context.document.getElementById("checkout-mask-shipping-note");
  assert.match(fw.summaryElement.innerHTML, /Shipping \(United States\)<\/span><span>Free/);
  assert.equal(maskNote.hidden, true);
});
