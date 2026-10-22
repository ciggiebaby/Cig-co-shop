require("./legacy-fixture.js");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
require("./promo-fixture.js");

const { PRIZES, isArcadeCode } = require("../promo.js");
const { PricingValidationError } = require("../netlify/lib/stripe-pricing.js");
const { resolvePromo } = require("../netlify/lib/promo-codes.js");
const { createHandler: createSessionHandler } = require("../netlify/functions/create-stripe-session.js");
const { createHandler: createValidateHandler } = require("../netlify/functions/validate-promo.js");
const { renderPrizeBanner } = require("../arcade.js");

const CODE = "CIG10-HXRN5K63";

function arcadeStore(results = {}) {
  const calls = [];
  return {
    calls,
    factory: () => ({
      checkArcadeRateLimit: async () => results.allowed !== false,
      checkArcadeCode: async (code, email) => {
        calls.push({ code, email });
        if (results.reason) return { valid: false, reason: results.reason };
        return { valid: true, code, discountBasisPoints: results.bp || 1000, expiresAt: "2026-10-27T00:00:00Z" };
      },
    }),
  };
}

test("Arcade code format", () => {
  assert.equal(isArcadeCode(CODE), true);
  assert.equal(isArcadeCode("CIG15-ABCDEFGH"), true);
  for (const code of ["CIG10", "cig10-hxrn5k63", "CIG10-HXRN5K6O", "CIG10-HXRN5K6", "SUMMER15"]) {
    assert.equal(isArcadeCode(code), false, code);
  }
});

test("static codes still resolve from promo.js without touching Supabase", async () => {
  const store = arcadeStore();
  assert.deepEqual(await resolvePromo({ promoCode: " cig10 ", storeFactory: store.factory }), {
    code: "CIG10",
    discountBasisPoints: 1000,
  });
  assert.equal(await resolvePromo({ promoCode: "", storeFactory: store.factory }), null);
  await assert.rejects(resolvePromo({ promoCode: "NOPE", storeFactory: store.factory }), PricingValidationError);
  assert.equal(store.calls.length, 0);
});

test("Arcade codes are checked in Supabase against the checkout email", async () => {
  const store = arcadeStore({ bp: 1500 });
  assert.deepEqual(
    await resolvePromo({ promoCode: CODE.toLowerCase(), email: "buyer@example.com", storeFactory: store.factory }),
    { code: CODE, discountBasisPoints: 1500 },
  );
  assert.deepEqual(store.calls, [{ code: CODE, email: "buyer@example.com" }]);
  await assert.rejects(
    resolvePromo({ promoCode: CODE, storeFactory: store.factory }),
    /email you played the Arcade with/,
  );
});

test("used, expired, wrong-email and unknown Arcade codes are refused with a clear message", async () => {
  const messages = {
    used: /already been used/,
    expired: /expired/,
    wrong_email: /email that won it/,
    not_found: /not valid/,
  };
  for (const [reason, message] of Object.entries(messages)) {
    await assert.rejects(
      resolvePromo({ promoCode: CODE, email: "a@example.com", storeFactory: arcadeStore({ reason }).factory }),
      (error) => error instanceof PricingValidationError && message.test(error.message),
    );
  }
});

function stripeStub() {
  let request;
  return {
    get request() { return request; },
    factory: () => ({ checkout: { sessions: { create: async (r) => { request = r; return { url: "https://checkout.test" }; } } } }),
  };
}

test("Stripe checkout applies a valid Arcade code and records it on the session", async () => {
  const store = arcadeStore();
  const stripe = stripeStub();
  const handler = createSessionHandler({
    stripeFactory: stripe.factory,
    promoResolver: (args) => resolvePromo({ ...args, storeFactory: store.factory }),
    siteUrl: "https://shop.test",
    logger: { error() {} },
  });
  const response = await handler({
    httpMethod: "POST",
    headers: {},
    body: JSON.stringify({
      items: [{ productId: "TEST-PILLOW", color: "Red", quantity: 2 }],
      promoCode: CODE,
      customer: { email: "Buyer@Example.com" },
    }),
  });
  assert.equal(response.statusCode, 200);
  assert.equal(stripe.request.line_items[0].price_data.unit_amount, 900);
  assert.equal(stripe.request.metadata.promo_code, CODE);
  assert.equal(stripe.request.customer_email, "buyer@example.com");
  assert.deepEqual(store.calls, [{ code: CODE, email: "buyer@example.com" }]);
});

test("Stripe checkout refuses a used Arcade code without creating a session", async () => {
  const stripe = stripeStub();
  const handler = createSessionHandler({
    stripeFactory: stripe.factory,
    promoResolver: (args) => resolvePromo({ ...args, storeFactory: arcadeStore({ reason: "used" }).factory }),
    siteUrl: "https://shop.test",
    logger: { error() {} },
  });
  const response = await handler({
    httpMethod: "POST",
    headers: {},
    body: JSON.stringify({ items: [{ productId: "TEST-PILLOW", color: "Red", quantity: 1 }], promoCode: CODE, customer: { email: "a@example.com" } }),
  });
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /already been used/);
  assert.equal(stripe.request, undefined);
});

function validateEvent(code) {
  return { httpMethod: "POST", headers: { "x-nf-client-connection-ip": "203.0.113.9" }, body: JSON.stringify({ code }) };
}

test("validate-promo confirms Arcade codes without needing an email", async () => {
  const store = arcadeStore({ bp: 1500 });
  const handler = createValidateHandler({ storeFactory: store.factory, environment: {}, logger: { error() {} } });
  const response = await handler(validateEvent(CODE));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { valid: true, code: CODE, discount: 0.15, label: "15% off" });
  assert.deepEqual(store.calls, [{ code: CODE, email: null }]);
});

test("validate-promo explains invalid codes and is rate limited", async () => {
  const expired = createValidateHandler({ storeFactory: arcadeStore({ reason: "expired" }).factory, environment: {}, logger: { error() {} } });
  assert.deepEqual(JSON.parse((await expired(validateEvent(CODE))).body), { valid: false, error: "This code has expired." });
  const unknown = createValidateHandler({ storeFactory: arcadeStore().factory, environment: {}, logger: { error() {} } });
  assert.equal(JSON.parse((await unknown(validateEvent("FREESTUFF"))).body).valid, false);
  const limited = createValidateHandler({ storeFactory: arcadeStore({ allowed: false }).factory, environment: {}, logger: { error() {} } });
  assert.equal((await limited(validateEvent(CODE))).statusCode, 429);
});

test("Arcade prizes: no 20% codes, perks count as wins, unique codes are shown", () => {
  assert.deepEqual(PRIZES.map((prize) => prize.id), ["p10", "early", "p15", "giveaway"]);
  assert.ok(PRIZES.every((prize) => prize.code === null));
  assert.ok(!PRIZES.some((prize) => /20%/.test(prize.label)));
  assert.match(renderPrizeBanner({ type: "perk", label: "Early Access", detail: "x" }), /prize-win/);
  assert.match(renderPrizeBanner({ type: "discount", code: CODE, label: "10% Off", detail: "x" }), new RegExp(CODE));
});

test("migrations: additive schema first, activation after deploy", () => {
  const dir = path.join(__dirname, "../supabase/migrations");
  const schema = fs.readFileSync(path.join(dir, "202610210001_arcade_codes_schema.sql"), "utf8");
  const activate = fs.readFileSync(path.join(dir, "202610210002_arcade_codes_activate.sql"), "utf8");

  assert.match(schema, /create table if not exists public\.arcade_codes/i);
  assert.match(schema, /play_id uuid not null unique/i);
  assert.match(schema, /enable row level security/i);
  assert.match(schema, /revoke execute on function public\.cigco_check_arcade_code\(text, text\) from public, anon, authenticated/i);
  // The schema step must not change live prizes or the claim/order functions.
  assert.doesNotMatch(schema, /update public\.arcade_prizes|cigco_arcade_claim|cigco_process_stripe_order/i);

  assert.match(activate, /active = false\s+where id in \('p5', 'p20', 'merch', 'gift', 'again1', 'again2'\)/i);
  assert.match(activate, /prize\.is_first_play_eligible = first_play/);
  assert.match(activate, /\('p15', 'discount', null, '15% Off'.*1500, 7\)/);
  assert.match(activate, /insert into public\.arcade_codes/i);
  assert.match(activate, /update public\.arcade_codes set\s+used_at = p_paid_at/i);
  assert.doesNotMatch(activate, /gen_random_bytes/);
});
