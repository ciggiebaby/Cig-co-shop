#!/usr/bin/env node
// Builds one crawlable page per product + the Google Merchant Center feed.
//
//   node scripts/build-product-pages.js              (static stock from products.js)
//   node scripts/build-product-pages.js --live-stock (mask stock from the live
//                                                     /.netlify/functions/stock)
//
// Writes (all committed; Netlify publishes this folder as-is, no build step):
//   products/<slug>/index.html  one page per visible product (product-seo.js)
//   google-feed.tsv             Merchant Center feed, served at /google-feed.tsv
//   sitemap.xml                 site pages + every product page
//   index.html                  footer product links (between the markers)
// Re-run after changing products.js (prices, colors, sizes, stock, sale windows).
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const seo = require(path.join(ROOT, "product-seo.js"));
const links = require(path.join(ROOT, "product-links.js"));

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const assetPath = (src) => (/^https?:/i.test(src) ? src : "/" + String(src).replace(/^\//, ""));
const money = (n) => `$${Number(n).toFixed(2)}`;

const FOOTER_START = "<!-- product-links:start (scripts/build-product-pages.js) -->";
const FOOTER_END = "<!-- product-links:end -->";
const STATIC_SITEMAP = [
  ["https://cigcompany.com/", "weekly", "1.0"],
  ["https://cigcompany.com/gallery", "monthly", "0.6"],
  ["https://cigcompany.com/arcade", "monthly", "0.6"],
  ["https://cigcompany.com/shipping-returns", "monthly", "0.5"],
  ["https://cigcompany.com/faq", "monthly", "0.5"],
];

function optionLabel(p, dim) {
  if (dim === "color") return p.colorLabel || "Color";
  if (dim === "size") return p.sizeLabel || "Size";
  return p.styleLabel || "Style";
}

function priceHtml(p, pick, now) {
  const charged = seo.priceNow(p, pick, now);
  const regular = seo.regularPrice(p, pick);
  if (charged < regular) return `<span class="price-strike">${money(regular)}</span><span class="price-sale">${money(charged)}</span>`;
  if (p.bundle && typeof p.compareAtPrice === "number" && p.compareAtPrice > charged) {
    return `<span class="price-strike">${money(p.compareAtPrice)}</span><span class="price-sale">${money(charged)}</span>`;
  }
  return money(charged);
}

// Option chips: real links (crawlable, work without JS). Dimensions the page
// doesn't split on (MagSafe model, bundle case color/model) are listed as text
// and picked in the shop pop-up after "Choose options".
function optionsHtml(p, pick) {
  const vs = seo.pageVariants(p);
  const out = [];
  for (const dim of ["style", "color", "size"]) {
    const list = dim === "style" ? (p.styles || []).map((s) => s.name) : dim === "color" ? p.colors || [] : p.sizes || [];
    if (!list.length) continue;
    const label = optionLabel(p, dim);
    if (vs.some((v) => v[dim])) {
      const chips = list.map((value) => {
        const target = { ...pick, [dim]: value };
        const href = seo.variantQuery(target);
        const on = pick[dim] === value ? " selected" : "";
        return `<a class="pd-option${on}" data-dim="${dim}" data-value="${esc(value)}" href="${esc(href)}">${esc(value)}</a>`;
      });
      out.push(`<div class="pd-field"><span class="pp-label">${esc(label)}</span><div class="pd-options">${chips.join("")}</div></div>`);
    } else {
      out.push(`<div class="pd-field"><span class="pp-label">${esc(label)}</span><p class="pp-note">Pick at the next step: ${list.map(esc).join(", ")}.</p></div>`);
    }
  }
  return out.join("\n      ");
}

function shippingLine(p) {
  if (p.liveStock) return `In-stock mask: ships from the US in 1–2 business days. Free US shipping, delivered in about 5–14 business days. Exchanges on unworn masks within 14 days (<a href="/shipping-returns#mask-terms">mask terms</a>).`;
  const usOnly = /US only/i.test(p.description || "") ? " Ships to the US only." : "";
  return `Made to order, ships in ${esc(p.shipTime || "7–9 business days")}. Free US shipping.${usOnly} Damaged, defective or wrong items are replaced or refunded (<a href="/shipping-returns">shipping &amp; returns</a>).`;
}

function pageHtml(p, ctx) {
  const { now, footer, all } = ctx;
  const info = seo.seoInfo(p);
  const pick = seo.pageDefaultPick(p);
  const url = seo.productPageUrl(p);
  const img = seo.imageFor(p, pick);
  const title = `${info.name} | ${p.pod ? "Free US Shipping" : "Ships in 1–2 Days"}`;
  const desc = seo.metaDescription(p, now);
  const pickText = [pick.style, pick.color, pick.size].filter(Boolean).join(" / ");
  const avail = seo.inStock(p, pick);
  const buyHref = "/" + links.productLinkSearch({ id: p.id, ...pick });
  const details = seo.detailLines(p);
  const more = all.filter((x) => x.id !== p.id && !x.soldOut).map((x) => `<a href="${seo.productPagePath(x)}">${esc(seo.seoName(x))}</a>`).join("\n      ");
  // Masks only (liveStock). Same 10% first-play offer, no new discount.
  const arcadeStrip = p.liveStock
    ? `\n<a class="arcade-strip" href="/arcade?src=pdp">Unlock the Arcade — first play wins 10% off masks</a>`
    : "";
  const jsonLd = seo.jsonLdText(seo.productJsonLd(p, { now }));
  const crumbs = seo.jsonLdText(seo.breadcrumbJsonLd(p));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<!-- Generated by scripts/build-product-pages.js from products.js + product-seo.js. Don't edit by hand: change those, then re-run. -->
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${url}" />
<meta property="og:site_name" content="CIG &amp; CO." />
<meta property="og:type" content="product" />
<meta property="og:title" content="${esc(info.name)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${esc(seo.absoluteAsset(img))}" />
<meta property="og:image:alt" content="${esc(seo.variantTitle(p, pick))}" />
<meta property="product:price:amount" content="${Number(seo.priceNow(p, pick, now)).toFixed(2)}" />
<meta property="product:price:currency" content="USD" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(info.name)}" />
<meta name="twitter:description" content="${esc(desc)}" />
<meta name="twitter:image" content="${esc(seo.absoluteAsset(img))}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,500;0,6..96,600;1,6..96,400&family=Jost:wght@300;400;500&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/styles.css" />
<link rel="icon" href="/favicon.ico" sizes="48x48" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<meta name="theme-color" content="#000000" />
<script type="application/ld+json" id="product-jsonld">${jsonLd}</script>
<script type="application/ld+json">${crumbs}</script>
</head>
<body>

<header class="site-header">
  <div class="header-inner">
    <a href="/" class="wordmark">CIG <span>&amp;</span> CO.</a>
    <nav class="main-nav">
      <a href="/#shop">Shop</a>
      <a href="/#about">About</a>
      <a href="/gallery.html">Gallery</a>
      <a href="/arcade.html">Arcade</a>
    </nav>
    <a class="cart-toggle" href="/#shop">SHOP</a>
  </div>
</header>
${arcadeStrip}

<main class="product-page" id="product-page" data-product-id="${esc(p.id)}">
  <nav class="pp-breadcrumb" aria-label="Breadcrumb"><a href="/#shop">Shop</a> <span aria-hidden="true">/</span> <span>${esc(info.name)}</span></nav>
  <div class="pp-grid">
    <div class="pp-media">
      <img class="pd-image" id="pp-image" src="${esc(assetPath(img))}" alt="${esc(seo.variantTitle(p, pick))}" />
    </div>
    <div class="pp-info">
      <p class="pd-sku">${p.pod ? "FW26/27 Collection" : "In-stock masks"}</p>
      <h1 class="pd-name">${esc(info.name)}</h1>
      <p class="pd-price" id="pp-price">${priceHtml(p, pick, now)}</p>
      <p class="pp-stock" id="pp-availability" data-in-stock="${avail ? "true" : "false"}">${avail ? "In stock" : "Sold out"}${pickText ? ` <span class="pp-pick" id="pp-pick">· ${esc(pickText)}</span>` : ""}</p>
      ${optionsHtml(p, pick)}
      <a class="btn btn-gold btn-full pp-buy" id="pp-buy" href="${esc(buyHref)}">${avail ? "Choose options &amp; add to bag" : "Sold out: see options"}</a>
      <p class="pp-desc">${esc(seo.descriptionFor(p))}</p>
      ${details.length ? `<ul class="pp-details">\n        ${details.map((d) => `<li>${esc(d)}</li>`).join("\n        ")}\n      </ul>` : ""}
      <p class="pp-ship">${shippingLine(p)}</p>
      <p class="pp-contact">Questions? Email <a href="mailto:${seo.CONTACT_EMAIL}">${seo.CONTACT_EMAIL}</a>.</p>
    </div>
  </div>
  <nav class="pp-more footer-links" aria-label="More products">
      ${more}
  </nav>
</main>

${footer}

<script src="/site-visits.js"></script>
<script src="/checkout-attribution.js"></script>
<script src="/products.js"></script>
<script src="/product-links.js"></script>
<script src="/product-seo.js"></script>
<script src="/live-stock-client.js"></script>
<script src="/product-page.js"></script>
</body>
</html>
`;
}

function footerLinksHtml(products) {
  return `${FOOTER_START}
  <nav class="footer-links footer-products" aria-label="Products">
    ${products.map((p) => `<a href="${seo.productPagePath(p)}">${esc(seo.seoName(p))}</a>`).join("\n    ")}
  </nav>
  ${FOOTER_END}`;
}

function sitemapXml(products) {
  const rows = STATIC_SITEMAP.map(([loc, freq, pri]) => `  <url><loc>${loc}</loc><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`)
    .concat(products.map((p) => `  <url><loc>${seo.productPageUrl(p)}</loc><changefreq>weekly</changefreq><priority>${p.soldOut ? "0.4" : "0.8"}</priority></url>`));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>\n`;
}

// The homepage footer, with its product links, for the product pages. New
// pages use info@ (orders@ bounces; PR #35 fixes the rest of the site).
function siteFooter(indexHtml) {
  const i = indexHtml.indexOf('<footer class="site-footer">');
  const j = indexHtml.indexOf("</footer>", i) + "</footer>".length;
  if (i < 0 || j < i) throw new Error("index.html footer not found");
  return indexHtml.slice(i, j)
    .replace(/orders@cigcompany\.com/g, seo.CONTACT_EMAIL)
    .replace(/href="(shipping-returns|faq)\.html"/g, 'href="/$1.html"');
}

async function liveStockItems() {
  const res = await fetch("https://cigcompany.com/.netlify/functions/stock", { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`stock function: HTTP ${res.status}`);
  const data = await res.json();
  return data.items;
}

async function build({ live = false, now = Date.now(), write = true } = {}) {
  // Fresh copy of the catalog so live stock never leaks into other requires.
  delete require.cache[require.resolve(path.join(ROOT, "products.js"))];
  const { PRODUCTS } = require(path.join(ROOT, "products.js"));
  if (live) {
    const { applyLiveStock } = require(path.join(ROOT, "live-stock-client.js"));
    const updated = applyLiveStock(PRODUCTS, await liveStockItems());
    console.log("live stock applied to", updated.join(", ") || "nothing");
  }
  const products = seo.pageProducts(PRODUCTS);
  const indexPath = path.join(ROOT, "index.html");
  let index = fs.readFileSync(indexPath, "utf8");
  const block = footerLinksHtml(products);
  if (index.includes(FOOTER_START)) {
    index = index.slice(0, index.indexOf(FOOTER_START)) + block + index.slice(index.indexOf(FOOTER_END) + FOOTER_END.length);
  } else {
    index = index.replace('  <nav class="footer-links" aria-label="Policies and help">', `  ${block}\n  <nav class="footer-links" aria-label="Policies and help">`);
  }
  const footer = siteFooter(index);
  const pages = products.map((p) => ({ product: p, file: path.join("products", seo.productSlug(p), "index.html"), html: pageHtml(p, { now, footer, all: products }) }));
  const feed = seo.feedTsv(seo.feedRows(PRODUCTS, { now }));
  const sitemap = sitemapXml(products);
  if (write) {
    fs.writeFileSync(indexPath, index);
    // Drop pages for products that no longer exist.
    const dir = path.join(ROOT, "products");
    const keep = new Set(products.map((p) => seo.productSlug(p)));
    if (fs.existsSync(dir)) for (const d of fs.readdirSync(dir)) if (!keep.has(d)) fs.rmSync(path.join(dir, d), { recursive: true });
    for (const pg of pages) {
      fs.mkdirSync(path.dirname(path.join(ROOT, pg.file)), { recursive: true });
      fs.writeFileSync(path.join(ROOT, pg.file), pg.html);
    }
    fs.writeFileSync(path.join(ROOT, "google-feed.tsv"), feed);
    fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap);
  }
  return { pages, feed, sitemap, index };
}

if (require.main === module) {
  const live = process.argv.includes("--live-stock");
  build({ live }).then(({ pages, feed }) => {
    console.log(`${pages.length} product pages, ${feed.trim().split("\n").length - 1} feed items`);
    pages.forEach((pg) => console.log("  /" + pg.file.replace(/index\.html$/, "")));
  }).catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { build, pageHtml, sitemapXml, footerLinksHtml, siteFooter, FOOTER_START, FOOTER_END };
