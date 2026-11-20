const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { VENTURES_SERVICES, VENTURES_INTAKE_CONFIRMATION } = require("../ventures.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const html = read("ventures.html");
const css = read("ventures.css");
const js = read("ventures.js");
const visible = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<noscript>[\s\S]*?<\/noscript>/g, "");

test("ventures page uses the required headline and company description", () => {
  assert.match(html, /Intelligence That Drives Revenue\./);
  assert.match(
    html,
    /CIG Ventures is an AI-powered business intelligence and growth strategy firm specializing in market research, competitive intelligence, revenue discovery and strategic acquisitions\. We transform data into actionable opportunities, helping businesses make smarter decisions, acquire customers and accelerate growth\./
  );
});

test("ventures page keeps the required research wording", () => {
  assert.match(js, /AI-assisted research, quality-checked before delivery\./);
  assert.match(html, /AI-assisted research, quality-checked before delivery\./);
  assert.match(js, /up to 5 qualified opportunities a week\./);
  assert.match(
    js,
    /up to 5 qualified opportunities a week\. The weekly count depends on your codes and eligibility \(size, set-aside, location\); some weeks have fewer\./
  );
  assert.match(js, /Research, not legal or bidding advice\./);
});

test("ventures prices match CIG's reference prices", () => {
  const text = js + html;
  assert.match(text, /\$149 Starter/);
  assert.match(text, /\$349 Professional/);
  assert.match(text, /\$249/);
  assert.match(text, /\$49 trial/);
  assert.match(text, /\$199\/month/);
});

test("each service leads with a buyer benefit and keeps disclosures below", () => {
  for (const service of VENTURES_SERVICES) {
    assert.ok(service.benefit && service.benefit.length > 20, service.id);
    assert.ok(Array.isArray(service.paragraphs) && service.paragraphs.length >= 1, service.id);
  }
  assert.match(VENTURES_SERVICES[0].benefit, /qualified prospects/i);
  assert.match(VENTURES_SERVICES[1].benefit, /pricing/i);
  assert.match(VENTURES_SERVICES[2].benefit, /federal contract/i);
  assert.match(js, /class="ventures-service-benefit"/);
});

test("sample reports are labeled illustrative and SIGNAL keeps the advice line", () => {
  assert.match(html, /id="samples"/);
  assert.match(html, /Sample reports/);
  for (const service of VENTURES_SERVICES) {
    assert.equal(service.sample.label, "Sample — illustrative format");
    assert.match(service.sample.caption, /not a (list of past clients|real engagement|past-client)/i);
  }
  assert.equal(VENTURES_SERVICES[2].sample.disclaimer, "Research, not legal or bidding advice.");
  assert.doesNotMatch(js, /our clients|as seen in|client testimonials/i);
});

test("each service has an Order button and an empty paymentUrl slot", () => {
  for (const service of VENTURES_SERVICES) {
    assert.equal(service.paymentUrl, "", service.id);
  }
  assert.match(js, /data-service="\$\{escapeHtml\(service\.id\)\}">Order/);
  assert.doesNotMatch(html, /buy\.stripe|checkout\.stripe|stripe\.com\/pay|href="[^"]*payment/i);
  assert.doesNotMatch(js, /buy\.stripe|checkout\.stripe|stripe\.com\/pay/i);
});

test("intake form posts to the ventures-intake function", () => {
  assert.match(html, /<form class="ventures-intake" id="ventures-intake"/);
  assert.match(html, /id="intake-name"/);
  assert.match(html, /id="intake-business"/);
  assert.match(html, /id="intake-email"/);
  assert.match(html, /id="intake-need"/);
  assert.match(html, /id="intake-budget"/);
  assert.match(js, /\/\.netlify\/functions\/ventures-intake/);
  assert.match(js, /We'll reply within 1 business day with scope and a payment link\./);
  assert.equal(VENTURES_INTAKE_CONFIRMATION, "We'll reply within 1 business day with scope and a payment link.");
  assert.doesNotMatch(html, /\bEIN\b|\bUEI\b|Mayland|tel:|\(\d{3}\)\s*\d{3}/);
  assert.doesNotMatch(html + js, /CIG Holdings/);
  assert.match(html, /We do not claim government contracts, SAM\.gov registration, or past performance|id="ventures-services"/);
  assert.match(js, /We do not claim government contracts, SAM\.gov registration, or past performance/);
});

test("How It Works lists intake, quote, payment, and delivery", () => {
  assert.match(html, /id="how-it-works"/);
  assert.match(html, /How It Works/);
  assert.match(html, /1\. Intake/);
  assert.match(html, /2\. Quote/);
  assert.match(html, /3\. Payment/);
  assert.match(html, /4\. Delivery/);
  assert.match(html, /We’ll reply within 1 business day with scope and a payment link/);
});

test("strategic acquisitions is framed as research, not brokerage", () => {
  assert.match(html, /Strategic acquisitions is a research focus\. We do not broker deals, and this is not investment or legal advice\./);
});

test("services are defined in a data array for later expansion", () => {
  assert.equal(VENTURES_SERVICES.length, 3);
  assert.deepEqual(VENTURES_SERVICES.map((s) => s.id), [
    "lead-research",
    "competitor-intelligence",
    "signal-federal",
  ]);
  assert.match(html, /id="ventures-services"/);
  assert.match(html, /<script src="ventures\.js"><\/script>/);
});

test("Ventures pages use a Ventures-only nav and footer, with no merch path", () => {
  const header = html.match(/<header class="site-header ventures-header">[\s\S]*?<\/header>/)[0];
  assert.match(header, /href="\/ventures" class="wordmark"/);
  assert.match(header, /CIG <span>VENTURES<\/span>/);
  assert.match(header, /href="\/ventures#services">Services</);
  assert.match(header, /href="\/ventures#samples">Samples</);
  assert.match(header, /href="\/ventures#how-it-works">How It Works</);
  assert.match(header, /href="\/privacy">Privacy</);
  assert.match(header, /href="\/ventures#order">Order</);
  assert.doesNotMatch(header, /Shop|Gallery|Arcade|BAG|#shop|index\.html/i);
  assert.doesNotMatch(visible, /class="arcade-strip"|cart-toggle|cart-drawer|checkout-modal|footer-products|product-grid|#shop|id="product-modal"/);
  assert.doesNotMatch(visible, /href="index\.html|href="\/products\/|href="gallery\.html|href="arcade\.html|href="\/arcade/);
  assert.doesNotMatch(html, /src="(cart|app|products|promo|shipping-rates|email-list|drop-hero|effects)\.js"/);
  const footer = html.match(/<footer class="ventures-footer">[\s\S]*?<\/footer>/)[0];
  assert.match(footer, /mailto:ventures@cigcompany\.com/);
  assert.match(footer, /href="\/privacy">Privacy</);
  assert.match(footer, /323 Walker St\. Ste A, Atlanta, GA 30313/);
  assert.match(footer, /CIG Ventures, a division of Cig &amp; Co\./);
  assert.doesNotMatch(footer, /Mayland|orders@cigcompany|Shipping &amp; returns|Paisley/);
  assert.match(css, /body\.ventures-page \.arcade-strip/);
});

test("sitemap and shop footers include /ventures", () => {
  assert.match(read("sitemap.xml"), /cigcompany\.com\/ventures</);
  assert.match(read("scripts/build-product-pages.js"), /cigcompany\.com\/ventures/);
  const pages = ["index.html", "gallery.html", "arcade.html", "shipping-returns.html", "faq.html", "privacy.html"];
  for (const page of pages) {
    const footer = read(page).match(/<footer class="site-footer">[\s\S]*?<\/footer>/)[0];
    assert.match(footer, /href="\/ventures"/, page);
    assert.match(footer, /href="(?:\/)?privacy\.html"/, page);
  }
});

test("Fiverr placeholder stays commented out", () => {
  assert.match(html, /<!-- Find us on Fiverr:[\s\S]*?-->/);
  assert.doesNotMatch(visible, /Find us on Fiverr/);
});
