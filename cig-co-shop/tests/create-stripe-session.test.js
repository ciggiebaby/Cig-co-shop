const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHandler,
} = require("../netlify/functions/create-stripe-session.js");

function checkoutEvent(body) {
  return {
    httpMethod: "POST",
    headers: { host: "shop.test" },
    body: JSON.stringify(body),
  };
}

function createStripeStub({
  error,
  url = "https://checkout.stripe.test/session",
} = {}) {
  let sessionRequest;

  return {
    getSessionRequest: () => sessionRequest,
    stripeFactory: () => ({
      checkout: {
        sessions: {
          create: async (request) => {
            sessionRequest = request;
            if (error) {
              throw error;
            }
            return { url };
          },
        },
      },
    }),
  };
}

function testHandler(stripeFactory) {
  return createHandler({
    stripeFactory,
    siteUrl: "https://shop.test",
    logger: { error() {} },
  });
}

test("ignores malicious display and monetary fields in a legacy cart", async () => {
  const stripe = createStripeStub();
  const response = await testHandler(stripe.stripeFactory)(
    checkoutEvent({
      cart: [
        {
          productId: "0003",
          color: "Red",
          size: null,
          style: null,
          qty: 1,
          name: "Attacker-controlled name",
          price: 0.01,
          subtotal: 0.01,
          discountAmount: 99999,
          total: 0.01,
        },
      ],
    }),
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(stripe.getSessionRequest().line_items, [
    {
      price_data: {
        currency: "usd",
        product_data: {
          name: "CIG Pillow Case — Red",
        },
        unit_amount: 1000,
      },
      quantity: 1,
    },
  ]);
});

test("creates expected Stripe line items from valid identifiers", async () => {
  const stripe = createStripeStub();
  const response = await testHandler(stripe.stripeFactory)(
    checkoutEvent({
      items: [
        {
          productId: "0011",
          color: "Red",
          size: "L",
          style: "Set",
          quantity: 1,
        },
      ],
      promoCode: " cig10 ",
      customer: {
        email: "customer@example.com",
        marketingConsent: true,
      },
      checkoutFingerprint: `v1:${"a".repeat(64)}`,
    }),
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    url: "https://checkout.stripe.test/session",
  });
  assert.deepEqual(stripe.getSessionRequest(), {
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "CIG Paisley Bikini (Set) — Red — L",
          },
          unit_amount: 4050,
        },
        quantity: 1,
      },
    ],
    customer_email: "customer@example.com",
    metadata: {
      cart_fingerprint: `v1:${"a".repeat(64)}`,
      marketing_consent: "true",
      promo_code: "CIG10",
    },
    shipping_address_collection: {
      allowed_countries: ["US"],
    },
    success_url: "https://shop.test/?checkout=success&session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "https://shop.test/?checkout=cancelled",
  });
});

test("returns 400 for an invalid product variant without calling Stripe", async () => {
  const stripe = createStripeStub();
  const response = await testHandler(stripe.stripeFactory)(
    checkoutEvent({
      items: [
        {
          productId: "0011",
          color: "Red",
          size: "L",
          style: "Dress",
          quantity: 1,
        },
      ],
    }),
  );

  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /Invalid style/);
  assert.equal(stripe.getSessionRequest(), undefined);
});

test("rejects malformed checkout correlation metadata", async () => {
  const stripe = createStripeStub();
  const response = await testHandler(stripe.stripeFactory)(
    checkoutEvent({
      items: [{
        productId: "0003",
        color: "Red",
        size: null,
        style: null,
        quantity: 1,
      }],
      checkoutFingerprint: "attacker-controlled",
    }),
  );

  assert.equal(response.statusCode, 400);
  assert.equal(stripe.getSessionRequest(), undefined);
  assert.doesNotMatch(response.body, /attacker-controlled/);
});

test("returns a generic 500 when Stripe fails", async () => {
  const stripe = createStripeStub({
    error: new Error("Stripe rejected sk_test_do_not_expose"),
  });
  const response = await testHandler(stripe.stripeFactory)(
    checkoutEvent({
      items: [
        {
          productId: "0003",
          color: "Red",
          size: null,
          style: null,
          quantity: 1,
        },
      ],
    }),
  );

  assert.equal(response.statusCode, 500);
  assert.deepEqual(JSON.parse(response.body), {
    error: "Checkout could not be started.",
  });
  assert.doesNotMatch(response.body, /sk_test_do_not_expose/);
});

test("requires the configured site URL instead of trusting the request host", async () => {
  let stripeCalls = 0;
  const handler = createHandler({
    environment: { STRIPE_SECRET_KEY: "sk_test_example" },
    stripeFactory: () => ({
      checkout: {
        sessions: {
          create: async () => {
            stripeCalls += 1;
            return { url: "https://checkout.stripe.test/session" };
          },
        },
      },
    }),
    logger: { error() {} },
  });

  const response = await handler({
    httpMethod: "POST",
    headers: { host: "attacker.example" },
    body: JSON.stringify({
      items: [{
        productId: "0005",
        color: "Red",
        size: null,
        style: null,
        quantity: 1,
      }],
    }),
  });

  assert.equal(response.statusCode, 500);
  assert.equal(stripeCalls, 0);
  assert.equal(response.body.includes("attacker.example"), false);
});
