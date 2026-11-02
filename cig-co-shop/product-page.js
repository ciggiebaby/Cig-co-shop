// CIG & CO. — product page (/products/<slug>/, built by scripts/build-product-pages.js).
// The static HTML already shows the product's default pick. This script:
//   * applies a variant from the link (?color=Red&size=1-Hole, what the Google
//     feed and the color/size links use) to the photo, price, stock and buy link,
//   * keeps ?src= / utm_* tags on the buy and option links (checkout-attribution.js
//     also saves them for the tab, so the sale is credited either way),
//   * swaps in live mask stock when /.netlify/functions/stock answers.
// "Add to bag" hands off to the shop's own pop-up (/?product=ID&color=..), so
// cart, stock checks and checkout are exactly the homepage's.
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && root.document) api.init(root);
})(typeof window !== "undefined" ? window : null, function () {
  var ATTRIBUTION_KEYS = ["src", "utm_source", "utm_medium", "utm_campaign", "utm_content"];

  function attributionParams(search) {
    var out = {};
    try {
      var params = new URLSearchParams(search || "");
      ATTRIBUTION_KEYS.forEach(function (k) { var v = params.get(k); if (v) out[k] = v; });
    } catch (e) {}
    return out;
  }
  function withAttribution(href, attribution) {
    var keys = Object.keys(attribution || {});
    if (!keys.length) return href;
    var q = keys.map(function (k) { return k + "=" + encodeURIComponent(attribution[k]); }).join("&");
    return href + (href.indexOf("?") >= 0 ? "&" : "?") + q;
  }

  // The pick on this page: the product default, overridden by valid link params.
  function pickFromSearch(p, products, seo, links, search) {
    var pick = Object.assign({}, seo.pageDefaultPick(p));
    var rest = String(search || "").replace(/^\?/, "");
    var parsed = links.parseProductLink("?product=" + encodeURIComponent(p.id) + (rest ? "&" + rest : ""), products);
    if (parsed) ["style", "color", "size"].forEach(function (k) { if (parsed[k]) pick[k] = parsed[k]; });
    return pick;
  }

  function buyHref(p, pick, links, attribution) {
    return withAttribution("/" + links.productLinkSearch({ id: p.id, style: pick.style, color: pick.color, size: pick.size }), attribution);
  }

  function money(n) { return "$" + Number(n).toFixed(2); }

  function render(doc, ctx) {
    var p = ctx.product, pick = ctx.pick, seo = ctx.seo;
    var img = doc.getElementById("pp-image");
    if (img) {
      var src = seo.imageFor(p, pick);
      img.src = /^https?:/i.test(src) ? src : "/" + String(src).replace(/^\//, "");
      img.alt = seo.variantTitle(p, pick);
    }
    var priceEl = doc.getElementById("pp-price");
    if (priceEl) {
      var charged = seo.priceNow(p, pick, ctx.now()), regular = seo.regularPrice(p, pick);
      var strike = charged < regular ? regular : p.bundle && p.compareAtPrice > charged ? p.compareAtPrice : null;
      priceEl.innerHTML = strike != null
        ? '<span class="price-strike">' + money(strike) + '</span><span class="price-sale">' + money(charged) + "</span>"
        : money(charged);
    }
    var inStock = seo.inStock(p, pick);
    var avail = doc.getElementById("pp-availability");
    if (avail) {
      var label = [pick.style, pick.color, pick.size].filter(Boolean).join(" / ");
      avail.setAttribute("data-in-stock", inStock ? "true" : "false");
      avail.innerHTML = (inStock ? "In stock" : "Sold out") + (label ? ' <span class="pp-pick" id="pp-pick">· ' + label.replace(/</g, "&lt;") + "</span>" : "");
    }
    var buy = doc.getElementById("pp-buy");
    if (buy) {
      buy.href = buyHref(p, pick, ctx.links, ctx.attribution);
      buy.textContent = inStock ? "Choose options & add to bag" : "Sold out: see options";
    }
    var chips = doc.querySelectorAll ? doc.querySelectorAll(".pd-option[data-dim]") : [];
    Array.prototype.forEach.call(chips, function (a) {
      var dim = a.getAttribute("data-dim"), value = a.getAttribute("data-value");
      var target = Object.assign({}, pick); target[dim] = value;
      a.href = withAttribution(seo.variantQuery(target), ctx.attribution);
      if (a.classList) a.classList.toggle("selected", pick[dim] === value);
    });
    var ld = doc.getElementById("product-jsonld");
    if (ld && ctx.refreshJsonLd) ld.textContent = seo.jsonLdText(seo.productJsonLd(p, { now: ctx.now() }));
  }

  function init(win) {
    var doc = win.document;
    var main = doc.getElementById("product-page");
    var seo = win.CIGProductSeo;
    var products = win.PRODUCTS || (typeof PRODUCTS !== "undefined" ? PRODUCTS : null);
    var links = { parseProductLink: win.parseProductLink, productLinkSearch: win.productLinkSearch };
    if (!main || !seo || !products || typeof links.parseProductLink !== "function") return null;
    var id = main.getAttribute("data-product-id");
    var p = products.find(function (x) { return x.id === id; });
    if (!p) return null;
    var yearEl = doc.getElementById("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();
    var ctx = {
      product: p, seo: seo, links: links, now: function () { return Date.now(); },
      pick: pickFromSearch(p, products, seo, links, win.location.search),
      attribution: attributionParams(win.location.search),
    };
    try { render(doc, ctx); } catch (e) { /* the static page still works */ }
    if (typeof win.loadLiveStock === "function" && p.liveStock) {
      win.loadLiveStock({ products: products, onUpdate: function () {
        ctx.refreshJsonLd = true;
        try { render(doc, ctx); } catch (e) {}
      } });
    }
    return ctx;
  }

  return { ATTRIBUTION_KEYS: ATTRIBUTION_KEYS, attributionParams: attributionParams, withAttribution: withAttribution, pickFromSearch: pickFromSearch, buyHref: buyHref, render: render, init: init };
});
