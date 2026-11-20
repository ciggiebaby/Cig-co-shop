const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { VENTURES_SERVICES } = require("../ventures.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const html = read("ventures.html");
const js = read("ventures.js");

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

test("ventures page has no payment links, intake form, or private identifiers", () => {
  assert.doesNotMatch(html, /buy\.stripe|checkout\.stripe|stripe\.com\/pay|payment.?link/i);
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /\bEIN\b|\bUEI\b|Mayland|tel:|\(\d{3}\)\s*\d{3}/);
  assert.doesNotMatch(html + js, /CIG Holdings/);
  assert.doesNotMatch(html, /testimonial|as seen in|win rate|same-day|24-hour/i);
  assert.match(js, /We do not claim government contracts, SAM\.gov registration, or past performance/);
  assert.match(html, /<a class="btn btn-gold" href="mailto:ventures@cigcompany\.com">/);
  assert.match(html, /<a class="ventures-email" href="mailto:ventures@cigcompany\.com">ventures@cigcompany\.com<\/a>/);
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

test("sitemap and footers include /ventures", () => {
  assert.match(read("sitemap.xml"), /cigcompany\.com\/ventures</);
  assert.match(read("scripts/build-product-pages.js"), /cigcompany\.com\/ventures/);
  const pages = ["index.html", "gallery.html", "arcade.html", "shipping-returns.html", "faq.html", "ventures.html"];
  for (const page of pages) {
    const footer = read(page).match(/<footer class="site-footer">[\s\S]*?<\/footer>/)[0];
    assert.match(footer, /href="\/ventures"/, page);
  }
});

test("Fiverr placeholder stays commented out", () => {
  assert.match(html, /<!-- Find us on Fiverr:[\s\S]*?-->/);
  const visible = html.replace(/<!--[\s\S]*?-->/g, "");
  assert.doesNotMatch(visible, /Find us on Fiverr/);
});
