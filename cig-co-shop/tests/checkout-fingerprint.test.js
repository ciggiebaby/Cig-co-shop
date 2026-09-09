const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const {
  canonicalizeCheckoutCart,
  createCheckoutFingerprint,
  serializeCheckoutCart,
} = require("../checkout-fingerprint.js");

const FINGERPRINT_SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "checkout-fingerprint.js"),
  "utf8",
);

const FIXED_ITEMS = [
  {
    productId: " 0011 ",
    color: " Red ",
    size: " L ",
    style: " Set ",
    quantity: 1,
  },
  {
    productId: "0003",
    color: "Red",
    size: null,
    style: null,
    quantity: 2,
  },
];

function loadBrowserUtility({
  cryptoImpl = webcrypto,
  textEncoderImpl = TextEncoder,
} = {}) {
  const context = vm.createContext({
    crypto: cryptoImpl,
    TextEncoder: textEncoderImpl,
  });
  vm.runInContext(FINGERPRINT_SOURCE, context, {
    filename: "checkout-fingerprint.js",
  });
  return context.CIGCheckoutFingerprint;
}

function item(overrides = {}) {
  return {
    productId: "0011",
    color: "Red",
    size: "L",
    style: "Set",
    quantity: 1,
    ...overrides,
  };
}

test("matches the fixed canonical serialization and SHA-256 vector", async () => {
  assert.equal(
    serializeCheckoutCart(FIXED_ITEMS, " cig10 "),
    '["cigco-stripe-cart-v1","CIG10",[["0003","Red",null,null,2],["0011","Red","L","Set",1]]]',
  );
  assert.equal(
    await createCheckoutFingerprint(FIXED_ITEMS, " cig10 "),
    "v1:0ce0886004c90c994e699346d1f00616c289fb5de51bf1886922bd23ac422538",
  );
});

test("browser Web Crypto and Node produce the same fingerprint", async () => {
  const browserUtility = loadBrowserUtility();
  const [browserFingerprint, nodeFingerprint] = await Promise.all([
    browserUtility.createCheckoutFingerprint(FIXED_ITEMS, "CIG10"),
    createCheckoutFingerprint(FIXED_ITEMS, "CIG10"),
  ]);

  assert.equal(browserFingerprint, nodeFingerprint);
});

test("is independent of cart line order", async () => {
  const forward = await createCheckoutFingerprint(FIXED_ITEMS, "CIG10");
  const reversed = await createCheckoutFingerprint(
    [...FIXED_ITEMS].reverse(),
    "CIG10",
  );

  assert.equal(forward, reversed);
});

test("aggregates duplicate variants before hashing", async () => {
  const duplicates = [
    item({ quantity: 1 }),
    item({ quantity: 2 }),
    item({ color: "Pink", quantity: 1 }),
  ];
  const aggregated = [
    item({ quantity: 3 }),
    item({ color: "Pink", quantity: 1 }),
  ];

  assert.deepEqual(canonicalizeCheckoutCart(duplicates, null), [
    "cigco-stripe-cart-v1",
    null,
    [
      ["0011", "Pink", "L", "Set", 1],
      ["0011", "Red", "L", "Set", 3],
    ],
  ]);
  assert.equal(
    await createCheckoutFingerprint(duplicates, null),
    await createCheckoutFingerprint(aggregated, null),
  );
});

test("changes when any identifier or quantity changes", async () => {
  const baseline = await createCheckoutFingerprint([item()], null);
  const variations = [
    item({ productId: "0012" }),
    item({ color: "Pink" }),
    item({ size: "XL" }),
    item({ style: "Top" }),
    item({ quantity: 2 }),
  ];

  for (const variation of variations) {
    assert.notEqual(
      await createCheckoutFingerprint([variation], null),
      baseline,
    );
  }
});

test("normalizes promo code whitespace and casing", async () => {
  const normalized = await createCheckoutFingerprint([item()], "CIG10");

  assert.equal(
    await createCheckoutFingerprint([item()], "  cig10  "),
    normalized,
  );
  assert.equal(
    await createCheckoutFingerprint([item()], "   "),
    await createCheckoutFingerprint([item()], null),
  );
  assert.notEqual(
    await createCheckoutFingerprint([item()], "CIG20"),
    normalized,
  );
});

test("ignores untrusted display, price, customer, and total fields", async () => {
  const baseline = await createCheckoutFingerprint([item()], "CIG10");
  const malicious = item({
    name: "Attacker Product",
    price: 0.01,
    image: "attacker.jpg",
    customer: { email: "attacker@example.com" },
    subtotal: 0.01,
    total: 0.01,
    discount: 0.99,
    discountAmount: 999999,
  });

  assert.equal(
    await createCheckoutFingerprint([malicious], "CIG10"),
    baseline,
  );
});

test("rejects malformed item collections and product IDs", () => {
  for (const malformed of [null, undefined, {}, [], [null], [[]], [{}]]) {
    assert.throws(
      () => canonicalizeCheckoutCart(malformed, null),
      /checkout item|Product ID/i,
    );
  }

  assert.throws(
    () => canonicalizeCheckoutCart([item({ productId: 11 })], null),
    /Product ID/,
  );
  assert.throws(
    () => canonicalizeCheckoutCart([item({ productId: "   " })], null),
    /Product ID/,
  );
});

test("rejects malformed optional fields, promo codes, and quantities", () => {
  for (const fieldName of ["color", "size", "style"]) {
    assert.throws(
      () => canonicalizeCheckoutCart([item({ [fieldName]: 12 })], null),
      new RegExp(fieldName, "i"),
    );
  }

  assert.throws(
    () => canonicalizeCheckoutCart([item()], 10),
    /Promo code/,
  );

  for (const quantity of [
    undefined,
    null,
    0,
    -1,
    1.5,
    "1",
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.throws(
      () => canonicalizeCheckoutCart([item({ quantity })], null),
      /Quantity/,
    );
  }

  assert.throws(
    () =>
      canonicalizeCheckoutCart(
        [
          item({ quantity: Number.MAX_SAFE_INTEGER }),
          item({ quantity: 1 }),
        ],
        null,
      ),
    /Aggregated quantity/,
  );
});

test("returns the exact versioned lowercase hexadecimal format", async () => {
  const fingerprint = await createCheckoutFingerprint([item()], null);

  assert.match(fingerprint, /^v1:[a-f0-9]{64}$/);
});

test("rejects clearly when browser Web Crypto is unavailable", async () => {
  const browserUtility = loadBrowserUtility({
    cryptoImpl: null,
    textEncoderImpl: null,
  });

  await assert.rejects(
    browserUtility.createCheckoutFingerprint([item()], null),
    /requires browser Web Crypto support/,
  );
});
