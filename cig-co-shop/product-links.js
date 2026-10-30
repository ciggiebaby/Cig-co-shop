// CIG & CO. — shareable product links + Google-readable product data.
//
// A link like https://cigcompany.com/?product=0008&color=Red&size=1-Hole opens
// that product's pop-up on page load with Red / 1-Hole picked. Opening a
// pop-up puts its product (and the picked color/size/style) in the address
// bar, and closing it takes them back out, so any product view can be copied
// and shared. Unknown or hidden products and options that don't exist are
// ignored: a bad product shows the normal shop grid, a bad color/size falls
// back to the product's default pick.
//
// It also builds schema.org Product data (JSON-LD) for Google: one block for
// the whole catalog on the homepage, and one for the open pop-up, with the
// price actually charged right now (the timed sale helper decides) and stock.
// Google Merchant Center product links are built with productLinkUrl below,
// so the feed and the site always agree on the link format.

const PRODUCT_LINK_PARAMS = ["product", "color", "size", "style"];
const SITE_URL = "https://cigcompany.com/";
const SCHEMA_BRAND = "Cig & Co.";

// Case-insensitive match against a product's own option list; returns the
// option exactly as products.js spells it, or null.
function matchOption(list, value) {
  if (value == null || !Array.isArray(list)) return null;
  const want = String(value).trim().toLowerCase();
  if (!want) return null;
  const hit = list.find((o) => String(o).toLowerCase() === want);
  return hit === undefined ? null : hit;
}

// search: a location.search string ("?product=..."), a URLSearchParams, or a full URL.
// Returns { id, color, size, style } (options null when absent/invalid), or
// null when there's no valid, visible product in the link.
function parseProductLink(search, products) {
  let params;
  try {
    if (search && typeof search === "object" && typeof search.get === "function") params = search;
    else if (typeof search === "string" && /^https?:/i.test(search)) params = new URL(search).searchParams;
    else params = new URLSearchParams(search || "");
  } catch {
    return null;
  }
  const rawId = params.get("product");
  if (!rawId || !Array.isArray(products)) return null;
  const id = rawId.trim().toLowerCase();
  const p = products.find((x) => x && String(x.id).toLowerCase() === id);
  if (!p || p.hidden) return null;
  const styleNames = (p.styles || []).map((s) => s.name);
  return {
    id: p.id,
    color: matchOption(p.colors, params.get("color")),
    size: matchOption(p.sizes, params.get("size")),
    style: matchOption(styleNames, params.get("style")),
  };
}

// Query string for a product view: "?product=0008&color=Red&size=1-Hole".
function productLinkSearch(sel) {
  const q = new URLSearchParams();
  if (!sel || !sel.id) return "";
  q.set("product", sel.id);
  if (sel.style) q.set("style", sel.style);
  if (sel.color) q.set("color", sel.color);
  if (sel.size) q.set("size", sel.size);
  return `?${q.toString()}`;
}

// Absolute shareable link (what the Google feed uses).
function productLinkUrl(sel, base = SITE_URL) {
  return `${base}${productLinkSearch(sel)}`;
}

// The current address with the product view swapped in (sel) or taken out
// (sel = null). Every other query param (utm tags, ?droptest) and the #hash
// are kept. Returns a path + search + hash string for history.replaceState.
function urlWithProductView(href, sel) {
  const url = new URL(href);
  PRODUCT_LINK_PARAMS.forEach((k) => url.searchParams.delete(k));
  const other = url.searchParams.toString();
  const view = productLinkSearch(sel).replace(/^\?/, "");
  const search = [view, other].filter(Boolean).join("&");
  return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
}

function absoluteAsset(src, base = SITE_URL) {
  if (!src) return undefined;
  return /^https?:/i.test(src) ? src : `${base}${String(src).replace(/^\//, "")}`;
}

function plainDescription(p) {
  const bits = [];
  if (p.description) bits.push(p.description);
  if (p.material) bits.push(`Material: ${p.material}.`);
  return bits.join(" ") || `${p.name} from ${SCHEMA_BRAND}`;
}

// helpers: { priceFor(p, style, color, size), stockFor(p, style, color, size),
//            imageFor(p, color, size, style), now }
function variantOffer(p, sel, helpers, base) {
  const price = helpers.priceFor(p, sel.style, sel.color, sel.size);
  const stock = helpers.stockFor(p, sel.style, sel.color, sel.size);
  return {
    "@type": "Offer",
    url: productLinkUrl({ id: p.id, ...sel }, base),
    price: Number(price).toFixed(2),
    priceCurrency: "USD",
    availability: stock > 0 && !p.comingSoon ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    itemCondition: "https://schema.org/NewCondition",
  };
}

// One schema.org Product for one exact pick (the open pop-up).
function productJsonLd(p, sel, helpers, base = SITE_URL) {
  const pick = { style: sel.style || null, color: sel.color || null, size: sel.size || null };
  const variantBits = [pick.style, pick.color, pick.size].filter(Boolean).join(" / ");
  const out = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: variantBits ? `${p.name} (${variantBits})` : p.name,
    image: absoluteAsset(helpers.imageFor(p, pick.color, pick.size, pick.style), base),
    description: plainDescription(p),
    sku: p.sku || p.id,
    brand: { "@type": "Brand", name: SCHEMA_BRAND },
    offers: variantOffer(p, pick, helpers, base),
  };
  if (pick.color) out.color = pick.color;
  if (pick.size) out.size = pick.size;
  if (p.material) out.material = p.material;
  return out;
}

// Every pick a product offers (styles x colors x sizes).
function productVariants(p) {
  const styles = p.styles && p.styles.length ? p.styles.map((s) => s.name) : [null];
  const colors = p.colors && p.colors.length ? p.colors : [null];
  const sizes = p.sizes && p.sizes.length ? p.sizes : [null];
  const out = [];
  styles.forEach((style) => colors.forEach((color) => sizes.forEach((size) => out.push({ style, color, size }))));
  return out;
}

// Whole catalog for the homepage: a ProductGroup per visible product, with
// one Product per variant (so every shared/feed link has its own price).
function catalogJsonLd(products, helpers, base = SITE_URL) {
  const groups = products.filter((p) => p && !p.hidden && (p.price != null || (p.styles && p.styles.length))).map((p) => {
    const varies = [];
    if (p.styles && p.styles.length) varies.push("https://schema.org/pattern");
    if (p.colors && p.colors.length) varies.push("https://schema.org/color");
    if (p.sizes && p.sizes.length) varies.push("https://schema.org/size");
    return {
      "@type": "ProductGroup",
      name: p.name,
      productGroupID: p.id,
      description: plainDescription(p),
      brand: { "@type": "Brand", name: SCHEMA_BRAND },
      url: productLinkUrl({ id: p.id }, base),
      variesBy: varies,
      hasVariant: productVariants(p).map((sel) => {
        const v = productJsonLd(p, sel, helpers, base);
        delete v["@context"];
        return v;
      }),
    };
  });
  return { "@context": "https://schema.org", "@graph": groups };
}

// JSON for a <script type="application/ld+json">, safe against "</script>".
function jsonLdText(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PRODUCT_LINK_PARAMS, SITE_URL, catalogJsonLd, jsonLdText, matchOption, parseProductLink,
    productJsonLd, productLinkSearch, productLinkUrl, productVariants, urlWithProductView,
  };
}
