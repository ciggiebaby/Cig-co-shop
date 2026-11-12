// Arcade traffic: homepage + mask-page banners, bag and footer links,
// result-screen opt-in, and the subscribers backfill. Same 10% first-play
// offer. No new discount.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { PRODUCTS } = require("../products.js");
const seo = require("../product-seo.js");
const subscribers = require("../netlify/lib/subscribers.js");
const {
  arcadeSignupSource,
  rememberArcadeListSource,
  currentArcadeListSource,
  shouldShowArcadeOptIn,
  arcadeOptInRequest,
} = require("../arcade.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const OFFER = "Unlock the Arcade — first play wins 10% off masks";
const PROMPT = "Get emailed if you win the monthly free-mask giveaway and when drops land.";
const BAG_PAGES = ["index.html", "gallery.html", "arcade.html", "faq.html", "shipping-returns.html"];

function between(html, start, end) {
  const i = html.indexOf(start);
  assert.ok(i >= 0, start);
  const j = end ? html.indexOf(end, i) : html.length;
  assert.ok(j > i);
  return html.slice(i, j);
}

test("site banners and links use the existing 10% masks offer and a src slug", () => {
  const home = read("index.html");
  assert.match(home, new RegExp(`<a class="arcade-strip" href="/arcade\\?src=home">${OFFER}</a>`));
  assert.equal(home.split('class="arcade-strip"').length - 1, 1);
  const homeModal = home.slice(home.indexOf('id="checkout-modal"'));
  assert.doesNotMatch(homeModal, /arcade-strip|cart-arcade-link|src=home|src=bag|Unlock the Arcade/);

  for (const page of ["gallery.html", "faq.html", "shipping-returns.html", "arcade.html"]) {
    assert.doesNotMatch(read(page), /class="arcade-strip"/, page);
  }

  const masks = PRODUCTS.filter((p) => p.liveStock && !p.hidden);
  assert.deepEqual(masks.map((p) => p.id).sort(), ["0005", "0008", "0013"]);
  for (const p of seo.pageProducts(PRODUCTS)) {
    const html = read(`products/${seo.productSlug(p)}/index.html`);
    const strip = `<a class="arcade-strip" href="/arcade?src=pdp">${OFFER}</a>`;
    if (p.liveStock) assert.ok(html.includes(strip), p.id);
    else assert.ok(!html.includes("arcade-strip"), p.id);
    assert.ok(html.includes('href="/arcade?src=footer">Arcade</a>'), p.id);
    assert.ok(!html.includes("cart-arcade-link"), `${p.id} has no bag drawer`);
  }

  for (const page of BAG_PAGES) {
    const html = read(page);
    const drawer = between(html, 'id="cart-drawer"', 'id="cart-backdrop"');
    const checkoutAt = drawer.indexOf('id="checkout-btn"');
    const linkAt = drawer.indexOf('class="cart-arcade-link" href="/arcade?src=bag"');
    assert.ok(checkoutAt > 0 && linkAt > checkoutAt, `${page} keeps Checkout above the Arcade link`);
    assert.match(drawer, /Arcade — 10% off masks/);
    const footer = between(html, '<footer class="site-footer">', "</footer>");
    assert.match(footer, /href="\/arcade\?src=footer">Arcade<\/a>/);
    const modal = html.slice(html.indexOf('id="checkout-modal"'));
    assert.doesNotMatch(modal, /cart-arcade-link|src=bag|arcade-strip/);
  }

  for (const slug of ["home", "pdp", "bag", "footer"]) {
    assert.equal(subscribers.arcadeSource(slug), slug);
    assert.equal(subscribers.isKnownArcadeSrc(slug), true);
  }
  const css = read("styles.css");
  assert.match(css, /\.cart-arcade-link \{[^}]*font-size: 11px;/);
  assert.match(css, /\.arcade-strip \{[^}]*font-size: 13px;/);
  assert.doesNotMatch(OFFER + PROMPT, /15%|20%|\$99/);
});

test("result screen asks once, never pre-checked, and posts consent on the same path", () => {
  const html = read("arcade.html");
  const gate = between(html, 'id="arcade-gate"', 'id="arcade-cooldown"');
  const cooldown = between(html, 'id="arcade-cooldown"', 'id="arcade-games"');
  assert.doesNotMatch(gate, /arcade-optin/);
  assert.match(gate, /id="arcade-marketing-consent"(?![^>]*checked)/);
  assert.match(cooldown, new RegExp(`<p class="arcade-optin-copy">${PROMPT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</p>`));
  assert.match(cooldown, /<button type="button" id="arcade-optin-btn"/);
  assert.doesNotMatch(cooldown, /type="checkbox"/);
  assert.match(cooldown, /id="arcade-optin"[^>]*hidden/);

  assert.equal(shouldShowArcadeOptIn(true), false);
  assert.equal(shouldShowArcadeOptIn(false), true);
  assert.equal(shouldShowArcadeOptIn(undefined), true);
  const body = arcadeOptInRequest("player@example.com", "pdp", "");
  assert.deepEqual(body, {
    email: "player@example.com",
    marketingConsent: true,
    consentProvided: true,
    consentSource: "arcade_result",
    source: "pdp",
    website: "",
  });
  assert.equal(subscribers.arcadeConsentSource("arcade_result"), "arcade_result");
  assert.equal(subscribers.arcadeConsentSource("stripe_checkout"), "arcade_gate");
  assert.equal(subscribers.arcadeConsentCopy("arcade_result", true), subscribers.CONSENT_TEXT.arcadeResult);
  assert.equal(subscribers.arcadeConsentCopy("arcade_gate", false), null);

  const store = new Map();
  global.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  try {
    rememberArcadeListSource("<nope>");
    assert.equal(arcadeSignupSource("?src=bag"), "bag");
    rememberArcadeListSource("bag");
    store.delete("cig_co_arcade_src");
    assert.equal(arcadeSignupSource(""), "arcade", "a refresh is not another bag scan");
    assert.equal(currentArcadeListSource(), "bag", "the opt-in still updates the bag row");
    assert.equal(arcadeOptInRequest("player@example.com", currentArcadeListSource()).source, "bag");
  } finally {
    delete global.sessionStorage;
  }

  const js = read("arcade.js");
  assert.match(js, /syncOptInPrompt\(\)/);
  assert.match(js, /consentSource: "arcade_result"/);
  assert.doesNotMatch(js, /marketing-consent" required/);
});

test("backfill inserts missing consented arcade contacts and leaves everyone else alone", () => {
  const sql = read("supabase/migrations/202611120002_backfill_arcade_consented_subscribers.sql");
  assert.match(sql, /insert into public\.subscribers/i);
  assert.match(sql, /c\.source_arcade = true/);
  assert.match(sql, /c\.marketing_consent = true/);
  assert.match(sql, /c\.marketing_consent_revoked_at is null/);
  assert.match(sql, /not exists \(/);
  assert.match(sql, /on conflict \(email_normalized, source, product_id, variant\) do nothing/i);
  assert.match(sql, /'arcade'/);
  assert.equal(sql.split(/insert into/i).length - 1, 1);
  const statements = sql.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(statements, /\b(update|delete|truncate|drop|alter)\b/i);
  assert.doesNotMatch(sql, /@/);
  assert.match(sql, /RUN THIS IN SUPABASE/i);
});
