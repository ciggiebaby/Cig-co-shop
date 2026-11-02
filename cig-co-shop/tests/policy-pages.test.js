const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&rsquo;/g, "’");
const htmlText = (s) => decode(s.replace(/<\/(a|strong|em)>/g, "").replace(/<(a|strong|em)\b[^>]*>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const mdText = (s) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*|\*/g, "").replace(/^#+ |^\s*(- |\d+\. )|\|/gm, " ").replace(/^---.*$/gm, " ").replace(/\s+/g, " ").trim();

function mainText(file) {
  const html = read(file);
  const m = html.match(/<main class="policy-page"[^>]*>([\s\S]*?)<\/main>/);
  assert.ok(m, `${file} has a <main class="policy-page">`);
  return htmlText(m[1]);
}

for (const [page, md] of [["shipping-returns.html", "docs/policies/shipping-returns.md"], ["faq.html", "docs/policies/faq.md"]]) {
  test(`${page} carries the approved copy word for word`, () => {
    const expected = mdText(read(md).replace("[publish date]", "November 1, 2026")).split(" ").filter((w) => !/^-+$/.test(w)).join(" ");
    const actual = mainText(page).split(" ").filter((w) => !/^-+$/.test(w)).join(" ");
    assert.equal(actual, expected);
  });
}

test("policy page shows the Last updated date", () => {
  assert.match(read("shipping-returns.html"), /Last updated: November 1, 2026/);
  assert.doesNotMatch(read("shipping-returns.html"), /\[publish date\]/);
});

test("support email is a mailto link on both pages", () => {
  for (const page of ["shipping-returns.html", "faq.html"]) {
    assert.match(read(page), /<a href="mailto:orders@cigcompany\.com">orders@cigcompany\.com<\/a>/, page);
  }
});

const allPages = ["index.html", "gallery.html", "arcade.html", "shipping-returns.html", "faq.html"];

test("footer links to Shipping & Returns and FAQ on every page", () => {
  for (const page of allPages) {
    const html = read(page);
    const footer = html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)[0];
    assert.match(footer, /href="shipping-returns\.html"/, page);
    assert.match(footer, /href="faq\.html"/, page);
    assert.match(footer, /mailto:orders@cigcompany\.com/, page);
  }
});

test("checkout shows the policy agreement line + FAQ link right above the pay buttons", () => {
  for (const page of allPages) {
    const html = read(page);
    const i = html.indexOf('class="checkout-agree"');
    const j = html.indexOf('class="payment-options"');
    assert.ok(i > 0 && j > i, page);
    const line = html.slice(i, j);
    assert.match(line, /By ordering you agree to our <a href="shipping-returns\.html"[^>]*>Shipping &amp; Returns policy<\/a>/, page);
    assert.match(line, /href="faq\.html"/, page);
  }
});

test("About says FW26/27 is made to order and no longer says 'limited quantities'", () => {
  const about = read("index.html").match(/<section id="about"[\s\S]*?<\/section>/)[0];
  assert.match(about, /Every FW26\/27 piece is made to order/);
  assert.doesNotMatch(about, /limited quantities/);
  assert.doesNotMatch(about, /mask[^<]*made to order/i);
});

test("sitemap lists the new pages", () => {
  const sitemap = read("sitemap.xml");
  assert.match(sitemap, /cigcompany\.com\/shipping-returns</);
  assert.match(sitemap, /cigcompany\.com\/faq</);
});

test("the Masks shipping line links to the mask terms section", () => {
  const html = read("shipping-returns.html");
  assert.match(html, /<h2 id="mask-terms">Masks: Shipping, Returns &amp; Exchanges<\/h2>/);
  assert.match(html, /about 5 to 14 business days\. <a href="#mask-terms">See the mask terms for details<\/a>\./);
});

test("policy pages: masks ship free in the US; no $8.95 or free-over-$75 left; intl mask rates unchanged", () => {
  for (const f of ["shipping-returns.html", "faq.html", "index.html", "docs/policies/shipping-returns.md", "docs/policies/faq.md"]) {
    const text = read(f);
    assert.doesNotMatch(text, /8\.95/, f);
    assert.doesNotMatch(text, /over \$75/, f);
  }
  const html = read("shipping-returns.html");
  assert.match(html, /<strong>Cost:<\/strong> US shipping on masks is free, with no minimum order\./);
  assert.match(html, /1 to 4 masks cost \$25 to Canada, \$31 to the UK, \$28 to Germany, \$40 to Australia, \$33 to Japan, and \$30 to South Korea/);
  assert.match(read("faq.html"), /Masks also ship free in the US, with no minimum/);
});
