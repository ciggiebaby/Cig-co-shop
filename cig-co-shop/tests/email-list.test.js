// Email list (CIG, Oct 29, 2026): one Supabase `subscribers` table, tagged by
// source (arcade, qr, shop, checkout, notify_me, early_access).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const subscribers = require("../netlify/lib/subscribers.js");
const { EMAILED_DETAIL, publicPrize, publicLastPlay } = require("../netlify/lib/arcade-public.js");
const { createHandler: registerHandler, NEW_SIGNUPS_PER_HOUR } = require("../netlify/functions/arcade-register.js");
const { createHandler: claimHandler } = require("../netlify/functions/arcade-claim.js");
const { createHandler: subscribeHandler, validProductVariant } = require("../netlify/functions/subscribe.js");
const { createHandler: unsubscribeHandler } = require("../netlify/functions/unsubscribe.js");
const { createHandler: exportHandler } = require("../netlify/functions/customer-export.js");
const { createHandler: dropSignupHandler } = require("../netlify/functions/drop-signup.js");
const { createHandler: stripeWebhookHandler } = require("../netlify/functions/stripe-webhook.js");
const { recordPaidOrder } = require("../netlify/lib/order-recording.js");
const { createResendClient } = require("../netlify/lib/resend.js");
const { createCustomerStore } = require("../netlify/lib/customer-store.js");
const { renderPrizeBanner, arcadeSignupSource } = require("../arcade.js");
const vm = require("node:vm");
// app.js is a browser script; load just the notify-me helpers (and dropLocked).
const appSrc = fs.readFileSync(path.join(root, "app.js"), "utf8");
const appCtx = { Date };
vm.runInNewContext(
  appSrc.slice(appSrc.indexOf("function dropLocked"), appSrc.indexOf("function dropBadgeText"))
    + appSrc.slice(appSrc.indexOf("function notifyVariantLabel"), appSrc.indexOf("function refreshNotifyMe"))
    + "\nthis.notifyVariantLabel = notifyVariantLabel; this.shouldOfferNotifyMe = shouldOfferNotifyMe;",
  appCtx,
);
const { notifyVariantLabel, shouldOfferNotifyMe } = appCtx;
const { subscribeEmail } = require("../email-list.js");

const quiet = { error() {} };
const ENV = { SUPABASE_SECRET_KEY: "server-only-secret" };
const post = (body, extra = {}) => ({
  httpMethod: "POST",
  headers: { "x-nf-client-connection-ip": "203.0.113.9" },
  body: JSON.stringify(body),
  ...extra,
});
const UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CODE = "CIG10-7KQ4XW2M";
const codePrize = () => ({
  id: "p10",
  type: "discount",
  code: CODE,
  label: "10% Off Masks",
  detail: `Use code ${CODE} at checkout by November 5. One use, for winner@example.com only.`,
});

// ---------- lib/subscribers.js ----------
test("src list: qr, shop, fani live in one config list and are stored as-is", () => {
  assert.deepEqual(Object.keys(subscribers.ARCADE_SRC_LIST), ["qr", "shop", "fani"]);
  for (const slug of Object.keys(subscribers.ARCADE_SRC_LIST)) {
    assert.equal(subscribers.arcadeSource(slug), slug);
    assert.match(slug, subscribers.SOURCE_SLUG_PATTERN, "listed slugs must fit the DB check");
    assert.ok(!subscribers.RESERVED_SOURCES.has(slug));
  }
  assert.equal(subscribers.arcadeSource(" QR "), "qr");
  assert.equal(subscribers.arcadeSource("Fani"), "fani");
});

test("src regex fallback: unlisted slugs are saved as-is, junk is plain arcade", () => {
  for (const slug of ["closette-2", "store_nyc", "ab", "a".repeat(24), "qr2", "constructor"]) {
    assert.equal(subscribers.arcadeSource(slug), slug);
    assert.equal(subscribers.isKnownArcadeSrc(slug), false);
  }
  for (const bad of [undefined, null, "", "a", "a".repeat(25), "fani's", "store nyc", "<script>", "a.b", "é-store",
    "checkout", "notify_me", "early_access", "arcade", 42, {}]) {
    assert.equal(subscribers.arcadeSource(bad), "arcade", String(bad));
  }
  assert.equal(subscribers.isValidSource("closette-2"), true);
  assert.equal(subscribers.isValidSource("Bad Source"), false);
}); 

test("honeypot and throwaway inbox checks", () => {
  assert.equal(subscribers.honeypotTripped({ website: "http://spam" }), true);
  assert.equal(subscribers.honeypotTripped({ website: "  " }), false);
  assert.equal(subscribers.honeypotTripped({}), false);
  assert.equal(subscribers.isDisposableEmail("x@mailinator.com"), true);
  assert.equal(subscribers.isDisposableEmail("x@gmail.com"), false);
  assert.throws(() => subscribers.assertNotDisposable("x@yopmail.com"), /real email/);
});

test("unsubscribe tokens are per-email and need the server secret", () => {
  const t = subscribers.unsubscribeToken("Fan@Example.com", "secret-1");
  assert.equal(subscribers.verifyUnsubscribeToken("fan@example.com", t, "secret-1"), true);
  assert.equal(subscribers.verifyUnsubscribeToken("other@example.com", t, "secret-1"), false);
  assert.equal(subscribers.verifyUnsubscribeToken("fan@example.com", t, "secret-2"), false);
  assert.equal(subscribers.verifyUnsubscribeToken("fan@example.com", t, ""), false);
  assert.equal(subscribers.unsubscribeUrl("fan@example.com", {}), null);
  const url = subscribers.unsubscribeUrl("fan@example.com", { UNSUBSCRIBE_SECRET: "secret-1", SITE_URL: "https://cigcompany.com/" });
  assert.match(url, /^https:\/\/cigcompany\.com\/\.netlify\/functions\/unsubscribe\?e=fan%40example\.com&t=/);
});

test("recordSubscriber never throws and refuses unknown sources", async () => {
  const calls = [];
  const ok = { subscribe: async (x) => { calls.push(x); return { created: true }; } };
  assert.deepEqual(await subscribers.recordSubscriber(ok, { email: "a@b.co", source: "qr" }, { logger: quiet }), { created: true });
  assert.equal(calls[0].emailOriginal, "a@b.co");
  assert.equal(await subscribers.recordSubscriber(ok, { email: "a@b.co", source: "not a slug!" }, { logger: quiet }), null);
  assert.equal(calls.length, 1);
  const broken = { subscribe: async () => { throw new Error("db down"); } };
  assert.equal(await subscribers.recordSubscriber(broken, { email: "a@b.co", source: "arcade" }, { logger: quiet }), null);
});

test("customer store maps subscribe/unsubscribe/export to the new RPCs", async () => {
  const rpcs = [];
  const store = createCustomerStore({ rpc: async (name, params) => { rpcs.push([name, params]); return []; } });
  await store.subscribe({ email: "a@b.co", source: "notify_me", productId: "0004", variant: "Set / Red", marketingConsent: false, consentText: "x" });
  await store.unsubscribe("a@b.co");
  await store.exportSubscribers("shop");
  await store.subscriberCounts();
  assert.deepEqual(rpcs.map((r) => r[0]), ["cigco_subscribe", "cigco_unsubscribe", "cigco_export_subscribers", "cigco_subscriber_counts"]);
  assert.deepEqual(rpcs[0][1], {
    p_email: "a@b.co", p_email_original: null, p_source: "notify_me", p_product_id: "0004",
    p_variant: "Set / Red", p_marketing_consent: false, p_consent_text: "x",
  });
  assert.deepEqual(rpcs[2][1], { p_source: "shop" });
});

// ---------- Arcade: codes are emailed, not shown ----------
test("public prize hides the code (and the detail that spells it out)", () => {
  const shown = publicPrize(codePrize(), {});
  assert.equal("code" in shown, false);
  assert.equal(shown.emailed, true);
  assert.equal(shown.detail, EMAILED_DETAIL);
  assert.ok(!JSON.stringify(shown).includes(CODE));
  // Perks without a code pass through untouched.
  const perk = { id: "early", type: "perk", label: "Early Access", detail: "You're on the early list." };
  assert.deepEqual(publicPrize(perk, {}), perk);
  // Emergency switch puts the code back on screen.
  assert.equal(publicPrize(codePrize(), { ARCADE_SHOW_CODE_ON_SCREEN: "true" }).code, CODE);
  assert.ok(!JSON.stringify(publicLastPlay({ playedAt: "x", prize: codePrize() }, {})).includes(CODE));
  assert.equal(publicLastPlay(null, {}), null);
});

function claimStore() {
  return {
    checkArcadeRateLimit: async () => true,
    claimArcade: async () => ({
      claimed: true, replayedRequest: false, contactId: "c1", playId: "play-1",
      email: "winner@example.com", firstPlay: true,
      playedAt: "2026-10-31T12:00:00.000Z", nextEligibleAt: "2026-11-07T12:00:00.000Z",
      prize: codePrize(),
    }),
  };
}

test("Arcade claim emails the code but never returns it to the browser", async () => {
  const sent = [];
  const res = await claimHandler({
    storeFactory: claimStore,
    sendPrize: async ({ claim }) => { sent.push(claim); },
    environment: ENV,
    logger: quiet,
  })(post({ email: "winner@example.com", game: "wheel", requestId: UUID }));
  assert.equal(res.statusCode, 200);
  assert.ok(!res.body.includes(CODE), "code must not be in the response");
  assert.equal(JSON.parse(res.body).prize.emailed, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].prize.code, CODE, "the email still gets the real code");
});

test("Arcade claim shows the code only with the emergency switch", async () => {
  const res = await claimHandler({
    storeFactory: claimStore, sendPrize: async () => {},
    environment: { ...ENV, ARCADE_SHOW_CODE_ON_SCREEN: "true" }, logger: quiet,
  })(post({ email: "winner@example.com", game: "wheel", requestId: UUID }));
  assert.equal(JSON.parse(res.body).prize.code, CODE);
});

function registerSetup({ hourlyAllowed = true, lastPlay = null, logger = quiet } = {}) {
  const calls = { subscribe: [], register: [], limits: [] };
  const store = {
    checkArcadeRateLimit: async (key, limit, windowSeconds) => {
      calls.limits.push([limit, windowSeconds]);
      return windowSeconds === 3600 ? hourlyAllowed : true;
    },
    registerArcade: async (r) => {
      calls.register.push(r);
      return { contactId: "c1", eligible: true, serverNow: "now", lastPlay, marketingConsent: r.marketingConsent };
    },
    subscribe: async (s) => { calls.subscribe.push(s); return { created: true }; },
  };
  const handler = registerHandler({ storeFactory: () => store, syncKit: async () => {}, environment: ENV, logger });
  return { handler, calls };
}

test("Arcade gate stores the email with source arcade / qr / shop / fani / new store slug", async () => {
  for (const [src, expected] of [[undefined, "arcade"], ["qr", "qr"], ["shop", "shop"], ["fani", "fani"],
    ["newstore", "newstore"], ["evil'); drop table", "arcade"], ["checkout", "arcade"]]) {
    const warnings = [];
    const { handler, calls } = registerSetup({ logger: { error() {}, warn: (m, d) => warnings.push(d.source) } });
    const res = await handler(post({ email: " Player@Example.com ", consentProvided: true, marketingConsent: false, source: src }));
    assert.equal(res.statusCode, 200);
    assert.equal(calls.subscribe.length, 1);
    assert.equal(calls.subscribe[0].source, expected, String(src));
    assert.equal(calls.subscribe[0].email, "player@example.com");
    assert.equal(calls.subscribe[0].marketingConsent, false);
    assert.equal(calls.subscribe[0].consentText, null);
    assert.deepEqual(warnings, expected === "newstore" ? ["newstore"] : [], "only unlisted slugs are flagged");
  }
});

test("Arcade gate records the optional promo opt-in as consent", async () => {
  const { handler, calls } = registerSetup();
  await handler(post({ email: "p@example.com", consentProvided: true, marketingConsent: true }));
  assert.equal(calls.subscribe[0].marketingConsent, true);
  assert.match(calls.subscribe[0].consentText, /Arcade/);
});

test("returning-visitor refresh is not a new sign-up, unless they came from a card", async () => {
  let { handler, calls } = registerSetup();
  await handler(post({ email: "p@example.com", consentProvided: false, source: "arcade" }));
  assert.equal(calls.subscribe.length, 0);
  ({ handler, calls } = registerSetup());
  await handler(post({ email: "p@example.com", consentProvided: false, source: "shop" }));
  assert.equal(calls.subscribe.length, 1);
  assert.equal(calls.subscribe[0].source, "shop");
});

test("Arcade gate abuse protection: honeypot, throwaway inboxes, hourly cap", async () => {
  let { handler, calls } = registerSetup();
  let res = await handler(post({ email: "bot@example.com", consentProvided: true, marketingConsent: false, website: "http://x" }));
  assert.equal(res.statusCode, 200);
  assert.equal(calls.register.length + calls.subscribe.length, 0);

  ({ handler, calls } = registerSetup());
  res = await handler(post({ email: "farm@mailinator.com", consentProvided: true, marketingConsent: false }));
  assert.equal(res.statusCode, 400);
  assert.equal(calls.register.length, 0);

  ({ handler, calls } = registerSetup({ hourlyAllowed: false }));
  res = await handler(post({ email: "p@example.com", consentProvided: true, marketingConsent: false }));
  assert.equal(res.statusCode, 429);
  assert.deepEqual(calls.limits[1], [NEW_SIGNUPS_PER_HOUR, 3600]);
  assert.equal(calls.register.length, 0);
});

test("Arcade registration never returns a past prize code", async () => {
  const { handler } = registerSetup({ lastPlay: { playedAt: "x", nextEligibleAt: "y", prize: codePrize() } });
  const res = await handler(post({ email: "winner@example.com", consentProvided: false }));
  assert.ok(!res.body.includes(CODE));
});

test("a broken subscribers table never blocks the Arcade", async () => {
  const store = {
    checkArcadeRateLimit: async () => true,
    registerArcade: async () => ({ contactId: "c1", eligible: true, serverNow: "now", lastPlay: null }),
    subscribe: async () => { throw new Error("relation does not exist"); },
  };
  const res = await registerHandler({ storeFactory: () => store, syncKit: async () => {}, environment: ENV, logger: quiet })(
    post({ email: "p@example.com", consentProvided: true, marketingConsent: false, source: "qr" }));
  assert.equal(res.statusCode, 200);
});

test("Arcade page: banner says check your email, src is slug-checked, honeypot + unsubscribe note", () => {
  const banner = renderPrizeBanner({ type: "discount", label: "10% Off Masks", detail: EMAILED_DETAIL, emailed: true });
  assert.match(banner, /Your code is in your email/);
  assert.doesNotMatch(banner, /prize-code/);

  const store = new Map();
  global.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  try {
    assert.equal(arcadeSignupSource(""), "arcade");
    assert.equal(arcadeSignupSource("?src=QR"), "qr");
    assert.equal(arcadeSignupSource(""), "qr", "remembered for this visit");
    store.clear();
    assert.equal(arcadeSignupSource("?src=shop"), "shop");
    store.clear();
    assert.equal(arcadeSignupSource("?src=fani"), "fani");
    store.clear();
    assert.equal(arcadeSignupSource("?src=closette-2"), "closette-2");
    store.clear();
    assert.equal(arcadeSignupSource("?src=<img onerror=1>"), "arcade");
    assert.equal(arcadeSignupSource("?src=" + "x".repeat(25)), "arcade");
    store.set("cig_co_arcade_src", "<tampered>");
    assert.equal(arcadeSignupSource(""), "arcade");
  } finally {
    delete global.sessionStorage;
  }

  const html = read("arcade.html");
  assert.match(html, /id="arcade-website" name="website" tabindex="-1"/);
  assert.match(html, /prize codes are sent to that email/);
  assert.match(html, /unsubscribe anytime/i);
  const js = read("arcade.js");
  assert.match(js, /ARCADE_SRC_PATTERN = \/\^\[a-z0-9_-\]\{2,24\}\$\//);
  assert.doesNotMatch(js, /\["qr", "shop"/, "the slug list lives only in netlify/lib/subscribers.js");
});

// ---------- Notify me / early access ----------
test("notify-me only on sold-out items, not drop-locked or coming-soon", () => {
  assert.equal(shouldOfferNotifyMe({ id: "x" }, 0), true);
  assert.equal(shouldOfferNotifyMe({ id: "x" }, 3), false);
  assert.equal(shouldOfferNotifyMe({ id: "x", comingSoon: true }, 0), false);
  assert.equal(shouldOfferNotifyMe({ id: "x", dropAt: "2999-01-01T00:00:00Z" }, 0), false);
  assert.equal(notifyVariantLabel({ styles: [{ name: "Set" }] }, { style: "Set", color: "Red", size: "L" }), "Set / Red / L");
  assert.equal(notifyVariantLabel({}, { style: null, color: "Blue", size: null }), "Blue");
  const app = read("app.js");
  assert.match(app, /source: "notify_me",\s*productId: p\.id,/);
});

test("notify-me product/variant must match the catalog", () => {
  assert.equal(validProductVariant("0004", "Set / Red"), true);
  assert.equal(validProductVariant("0011", "Top / Pink / XL"), true);
  assert.equal(validProductVariant("0004", null), true);
  assert.equal(validProductVariant("0004", "Set / Plaid"), false);
  assert.equal(validProductVariant("nope", null), false);
  assert.equal(validProductVariant("0004", "x".repeat(121)), false);
});

function subscribeSetup({ allowed = true, fail = false } = {}) {
  const calls = [];
  const handler = subscribeHandler({
    environment: ENV,
    logger: quiet,
    storeFactory: () => ({
      checkArcadeRateLimit: async () => allowed,
      subscribe: async (s) => { if (fail) throw new Error("down"); calls.push(s); return { created: true }; },
    }),
  });
  return { handler, calls };
}

test("subscribe endpoint: notify_me with product + variant, early_access with consent", async () => {
  let { handler, calls } = subscribeSetup();
  let res = await handler(post({ email: "Fan@Example.com", source: "notify_me", productId: "0004", variant: "Set / Red" }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    { source: calls[0].source, productId: calls[0].productId, variant: calls[0].variant, email: calls[0].email, marketingConsent: calls[0].marketingConsent },
    { source: "notify_me", productId: "0004", variant: "Set / Red", email: "fan@example.com", marketingConsent: false },
  );
  ({ handler, calls } = subscribeSetup());
  res = await handler(post({ email: "fan@example.com", source: "early_access" }));
  assert.equal(res.statusCode, 200);
  assert.equal(calls[0].source, "early_access");
  assert.equal(calls[0].marketingConsent, true);
  assert.equal(calls[0].productId, null);
});

test("subscribe endpoint rejects bad input and only takes its two public sources", async () => {
  const bad = [
    { email: "fan@example.com", source: "arcade" },
    { email: "fan@example.com", source: "checkout" },
    { email: "fan@example.com", source: "qr" },
    { email: "fan@example.com" },
    { email: "nope", source: "early_access" },
    { email: "x@mailinator.com", source: "early_access" },
    { email: "fan@example.com", source: "notify_me" },
    { email: "fan@example.com", source: "notify_me", productId: "0004", variant: "Set / <b>" },
  ];
  for (const body of bad) {
    const { handler, calls } = subscribeSetup();
    assert.equal((await handler(post(body))).statusCode, 400, JSON.stringify(body));
    assert.equal(calls.length, 0);
  }
  assert.equal((await subscribeSetup().handler({ httpMethod: "GET" })).statusCode, 405);
  assert.equal((await subscribeSetup({ allowed: false }).handler(post({ email: "a@b.co", source: "early_access" }))).statusCode, 429);
  assert.equal((await subscribeSetup({ fail: true }).handler(post({ email: "a@b.co", source: "early_access" }))).statusCode, 500);
  const hp = subscribeSetup();
  assert.equal((await hp.handler(post({ email: "a@b.co", source: "early_access", website: "spam" }))).statusCode, 200);
  assert.equal(hp.calls.length, 0);
});

test("subscribeEmail (browser) posts to the function and surfaces errors", async () => {
  let sent;
  await subscribeEmail({ email: " a@b.co ", source: "early_access" }, async (url, opts) => {
    sent = [url, JSON.parse(opts.body)];
    return { ok: true, json: async () => ({ ok: true }) };
  });
  assert.equal(sent[0], "/.netlify/functions/subscribe");
  assert.deepEqual(sent[1], { email: "a@b.co", source: "early_access", productId: null, variant: null, website: "" });
  await assert.rejects(
    subscribeEmail({ email: "a@b.co", source: "early_access" }, async () => ({ ok: false, json: async () => ({ error: "Too many attempts." }) })),
    /Too many attempts/,
  );
});

test("home page has the early-access form with a honeypot and unsubscribe note", () => {
  const html = read("index.html");
  assert.match(html, /id="early-access-form"/);
  assert.match(html, /Black Friday code/);
  assert.match(html, /Unsubscribe anytime/);
  const form = html.slice(html.indexOf('id="early-access-form"'), html.indexOf("</form>", html.indexOf('id="early-access-form"')));
  assert.match(form, /name="website" tabindex="-1"/);
});

test("drop hero 'Get notified' also lands on the list as early_access", async () => {
  const subs = [];
  const handler = dropSignupHandler({
    environment: { KIT_API_KEY: "k", KIT_MARKETING_OPT_IN_TAG_ID: "1", SUPABASE_SECRET_KEY: "s" },
    logger: quiet,
    storeFactory: () => ({ checkArcadeRateLimit: async () => true, subscribe: async (s) => { subs.push(s); } }),
    kitFactory: () => ({ upsertSubscriber: async () => ({ subscriber: { id: 1 }, suppressed: false }), addTags: async () => {} }),
  });
  assert.equal((await handler(post({ email: "fan@example.com", marketingConsent: true }))).statusCode, 200);
  assert.equal(subs[0].source, "early_access");
});

// ---------- Checkout opt-in ----------
function fakeOrderStore(subs) {
  return {
    processStripeOrder: async (order) => ({
      created: true,
      contact: { id: "c1", email_normalized: order.email, marketing_consent: order.marketingConsent, order_count: 1 },
      order: { id: "o1", order_number: "CIG-1", stripe_session_id: order.sessionId, items: [] },
    }),
    subscribe: async (s) => { subs.push(s); },
  };
}

test("PayPal/crypto paid orders add opted-in buyers with source checkout (only with the box ticked)", async () => {
  for (const consent of [true, false]) {
    const subs = [];
    await recordPaidOrder({
      eventId: "e", eventType: "t", sessionId: "paypal:1", paymentId: "p",
      emailOriginal: "Buyer@Example.com", name: "A B", amountTotalCents: 100, items: [],
      shippingDestination: null, marketingConsent: consent,
    }, { storeFactory: () => fakeOrderStore(subs), syncKit: async () => {}, sendOrder: async () => {}, logger: quiet });
    assert.equal(subs.length, consent ? 1 : 0);
    if (consent) {
      assert.equal(subs[0].source, "checkout");
      assert.equal(subs[0].email, "buyer@example.com");
      assert.equal(subs[0].marketingConsent, true);
    }
  }
});

test("card (Stripe) paid orders add opted-in buyers with source checkout", async () => {
  const subs = [];
  const session = {
    id: "cs_1", mode: "payment", status: "complete", payment_status: "paid", payment_intent: "pi_1",
    amount_total: 4500, currency: "usd",
    customer_details: { email: "Buyer@Example.com", name: "A B" },
    metadata: { marketing_consent: "true" },
    line_items: { data: [] },
  };
  const res = await stripeWebhookHandler({
    stripeFactory: () => ({
      webhooks: { constructEvent: () => ({ id: "evt", type: "checkout.session.completed", created: 1, data: { object: { id: "cs_1" } } }) },
      checkout: { sessions: { retrieve: async () => session } },
    }),
    storeFactory: () => fakeOrderStore(subs),
    stockStoreFactory: () => ({ commitOrder: async () => ({}) }),
    sendOrder: async () => {},
    syncKit: async () => {},
    environment: { STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: "whsec" },
    logger: quiet,
  })({ httpMethod: "POST", headers: { "stripe-signature": "ok" }, body: "raw" });
  assert.equal(res.statusCode, 200);
  assert.equal(subs.length, 1);
  assert.equal(subs[0].source, "checkout");
});

test("checkout opt-in box stays unchecked by default", () => {
  const html = read("index.html");
  assert.match(html, /<input type="checkbox" id="checkout-optin" \/>/);
  assert.doesNotMatch(html, /id="checkout-optin"[^>]*checked/);
});

// ---------- Unsubscribe ----------
test("unsubscribe: GET confirms only, POST with a valid token unsubscribes", async () => {
  const secret = "unsub-secret";
  const calls = [];
  const handler = unsubscribeHandler({
    storeFactory: () => ({ unsubscribe: async (e) => { calls.push(e); return 1; } }),
    environment: { UNSUBSCRIBE_SECRET: secret },
    logger: quiet,
  });
  const t = subscribers.unsubscribeToken("fan@example.com", secret);
  const get = await handler({ httpMethod: "GET", queryStringParameters: { e: "fan@example.com", t } });
  assert.equal(get.statusCode, 200);
  assert.match(get.body, /<form method="post"/);
  assert.equal(calls.length, 0);
  const postRes = await handler({ httpMethod: "POST", queryStringParameters: { e: "fan@example.com", t } });
  assert.equal(postRes.statusCode, 200);
  assert.deepEqual(calls, ["fan@example.com"]);
  const forged = await handler({ httpMethod: "POST", queryStringParameters: { e: "victim@example.com", t } });
  assert.equal(forged.statusCode, 400);
  assert.equal(calls.length, 1);
  const noSecret = unsubscribeHandler({ storeFactory: () => ({ unsubscribe: async () => 1 }), environment: {}, logger: quiet });
  assert.equal((await noSecret({ httpMethod: "POST", queryStringParameters: { e: "fan@example.com", t } })).statusCode, 400);
});

test("prize email has the code, an unsubscribe link and one-click headers", async () => {
  let payload;
  const client = createResendClient({
    apiKey: "re_test", fromEmail: "CIG & CO. <info@cigcompany.com>",
    environment: { UNSUBSCRIBE_SECRET: "s", SITE_URL: "https://cigcompany.com" },
    fetchImpl: async (url, opts) => { payload = JSON.parse(opts.body); return { ok: true, json: async () => ({ id: "1" }) }; },
  });
  await client.sendPrize({ email: "winner@example.com", prize: codePrize(), playId: "play-1" });
  assert.match(payload.html, new RegExp(CODE));
  assert.match(payload.html, /Unsubscribe<\/a>/);
  assert.match(payload.headers["List-Unsubscribe"], /^<https:\/\/cigcompany\.com\/\.netlify\/functions\/unsubscribe\?e=winner%40example\.com&t=/);
  assert.equal(payload.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

  const plain = createResendClient({
    apiKey: "re_test", fromEmail: "x", environment: {},
    fetchImpl: async (url, opts) => { payload = JSON.parse(opts.body); return { ok: true, json: async () => ({}) }; },
  });
  await plain.sendPrize({ email: "winner@example.com", prize: codePrize(), playId: "play-2" });
  assert.equal("headers" in payload, false);
  assert.match(payload.html, /reply &ldquo;unsubscribe&rdquo;/);
});

// ---------- Exports for BG ----------
test("subscriber exports: by source and per-source counts, token protected", async () => {
  const seen = [];
  const handler = exportHandler({
    environment: { ADMIN_EXPORT_TOKEN: "tok" },
    logger: quiet,
    storeFactory: () => ({
      exportSubscribers: async (s) => { seen.push(["export", s]); return [{ email: "a@b.co", source: "shop", product_id: null, marketing_consent: true, signup_count: 1, is_customer: false }]; },
      subscriberCounts: async () => { seen.push(["counts"]); return [{ source: "qr", signups: 3, unique_emails: 3 }]; },
    }),
  });
  const auth = { authorization: "Bearer tok" };
  let res = await handler({ httpMethod: "GET", headers: auth, queryStringParameters: { filter: "subscribers", source: "shop" } });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /^Email,Source,Product,Variant/);
  assert.match(res.body, /a@b\.co,shop,/);
  res = await handler({ httpMethod: "GET", headers: auth, queryStringParameters: { filter: "subscriber_counts" } });
  assert.match(res.body, /qr,3,3/);
  res = await handler({ httpMethod: "GET", headers: auth, queryStringParameters: { filter: "subscribers", source: "Not A Slug" } });
  assert.equal(res.statusCode, 400);
  res = await handler({ httpMethod: "GET", headers: {}, queryStringParameters: { filter: "subscribers" } });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(seen, [["export", "shop"], ["counts"]]);
});

// ---------- Migration ----------
test("subscribers migration: one table, slug-shaped sources, dedupe, consent timestamp, locked down", () => {
  const sql = read("supabase/migrations/202610310001_email_list_subscribers.sql");
  assert.match(sql, /create table if not exists public\.subscribers/);
  assert.match(sql, /check \(source ~ '\^\[a-z0-9_-\]\{2,24\}\$'\)/);
  assert.match(sql, /p_source !~ '\^\[a-z0-9_-\]\{2,24\}\$'/);
  assert.equal(String(subscribers.SOURCE_SLUG_PATTERN), "/^[a-z0-9_-]{2,24}$/", "JS and SQL use the same slug rule");
  for (const s of subscribers.ALL_SOURCES) assert.match(s, subscribers.SOURCE_SLUG_PATTERN);
  assert.match(sql, /unique \(email_normalized, source, product_id, variant\)/);
  assert.match(sql, /consent_at timestamptz/);
  assert.match(sql, /alter table public\.subscribers enable row level security;/);
  assert.match(sql, /revoke all on table public\.subscribers from public, anon, authenticated;/);
  for (const fn of ["cigco_subscribe(text, text, text, text, text, boolean, text)", "cigco_unsubscribe(text)", "cigco_export_subscribers(text)", "cigco_subscriber_counts()"]) {
    assert.ok(sql.includes(`revoke execute on function public.${fn} from public, anon, authenticated;`), fn);
    assert.ok(sql.includes(`grant execute on function public.${fn} to service_role;`), fn);
  }
  assert.match(sql, /POST-MERGE STEP/);
});

test("no server secret or Supabase client in browser files", () => {
  for (const file of ["arcade.js", "app.js", "email-list.js", "index.html", "arcade.html"]) {
    const src = read(file);
    assert.doesNotMatch(src, /SUPABASE_SECRET_KEY|UNSUBSCRIBE_SECRET|sb_secret_|service_role/, file);
  }
});
