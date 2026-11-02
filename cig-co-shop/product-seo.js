// CIG & CO. — product pages + Google product data (one source for all three):
//   * the static product pages at /products/<slug>/ (scripts/build-product-pages.js),
//   * their schema.org ProductGroup/Product JSON-LD,
//   * the Google Merchant Center feed (/google-feed.tsv).
// Pure functions only (no DOM), so the build script, the product pages and the
// tests all use the same code. Prices, stock and images follow the same rules
// as app.js (currentPrice / variantStock / productImageForColor); a test keeps
// them in step.
//
// Naming rule (Merchant Center, 11/1): Google disapproved mask listings titled
// "Cig & Co. CIG Ski Mask ..." under "Tobacco products & related equipment".
// So product NAMES used for Google (titles, page headings, JSON-LD, feed) are
// descriptive and never contain "cig"/"cigarette"/"smoke"; the brand lives only
// in the brand field ("CIG & CO."). The shop grid keeps its own names.
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CIGProductSeo = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var SITE_URL = "https://cigcompany.com/";
  var BRAND = "CIG & CO.";
  var CONTACT_EMAIL = "info@cigcompany.com";
  var RETURNS_URL = SITE_URL + "shipping-returns";
  // Words Google's tobacco classifier keys on. Never in a Google-facing name/description.
  var BLOCKED_WORDS = /\b(cig|cigs|cigar|cigars|cigarette|cigarettes|smoke|smoking|tobacco|vape|vaping)\b/i;

  // Google-facing name, page slug and Merchant Center category per product.
  // gpc = Google product category id (taxonomy-with-ids.en-US.txt).
  var SEO = {
    "FW26-BAG": { slug: "paisley-crossbody-bag", name: "Paisley Bandana Print Crossbody Bag", gpc: "3032", type: "FW26/27 Collection > Bags > Crossbody Bag", apparel: true },
    "FW26-CASE": { slug: "paisley-magsafe-phone-case", name: "Paisley Bandana Print MagSafe Phone Case", gpc: "2353", type: "FW26/27 Collection > Tech > MagSafe Phone Case" },
    "FW26-BUNDLE": { slug: "paisley-crossbody-magsafe-bundle", name: "Paisley Bandana Print Crossbody Bag + MagSafe Case Bundle", gpc: "3032", type: "FW26/27 Collection > Bundles > Crossbody + MagSafe", apparel: true, bundle: true },
    "FW26-SLEEVE": { slug: "paisley-laptop-sleeve", name: "Paisley Bandana Print Laptop Sleeve", gpc: "279", type: "FW26/27 Collection > Tech > Laptop Sleeve" },
    "FW26-PILLOW": { slug: "paisley-throw-pillow", name: "Paisley Bandana Print Throw Pillow", gpc: "4454", type: "FW26/27 Collection > Home > Throw Pillow" },
    "FW26-TOTE": { slug: "paisley-tote-bag", name: "Paisley Bandana Print Tote Bag", gpc: "5608", type: "FW26/27 Collection > Bags > Tote Bag" },
    "0005": { slug: "paisley-balaclava", name: "Paisley Bandana Print Balaclava", gpc: "1786", type: "Masks > Balaclava", apparel: true,
      blurb: "Full-face balaclava in an all-over paisley bandana print." },
    "0008": { slug: "paisley-ski-mask", name: "Paisley Bandana Print Ski Mask", gpc: "1786", type: "Masks > Ski Mask", apparel: true,
      blurb: "Ski mask in an all-over paisley bandana print, in 1-Hole, 3-Hole and Skully styles." },
    "0013": { slug: "paisley-moto-mask", name: "Paisley Bandana Print Moto Mask", gpc: "167", type: "Masks > Moto Mask", apparel: true,
      blurb: "Moto face mask in a paisley bandana print." },
    "0004": { slug: "silky-bonnet-durag", name: "Silky Bonnet & Durag", gpc: "2020", type: "Headwear > Bonnet & Durag", apparel: true,
      blurb: "Silky bonnet and durag, sold as a set or on their own." },
    "0011": { slug: "paisley-bikini", name: "Paisley Bikini", gpc: "211", type: "Swimwear > Bikini", apparel: true, gender: "female",
      blurb: "Bikini in a paisley bandana print, sold as a set or as a separate top or bottom." },
  };

  function slugify(s) {
    return String(s).toLowerCase().replace(BLOCKED_WORDS, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function seoInfo(p) {
    var info = SEO[p.id];
    if (info) return info;
    var name = String(p.name || p.id).replace(BLOCKED_WORDS, "").replace(/\s+/g, " ").trim();
    return { slug: slugify(name || p.id), name: name || p.id, gpc: "", type: "" };
  }
  function seoName(p) { return seoInfo(p).name; }
  function productSlug(p) { return seoInfo(p).slug; }
  function productPagePath(p) { return "/products/" + productSlug(p) + "/"; }
  function productPageUrl(p, base) { return (base || SITE_URL) + "products/" + productSlug(p) + "/"; }

  // Products that get a page: everything the shop grid shows (hidden ones don't).
  function pageProducts(products) {
    return (products || []).filter(function (p) { return p && !p.hidden && (p.price != null || (p.styles && p.styles.length)); });
  }
  // Products in the Google feed: page products minus ones CIG marked sold out
  // as a whole (bonnet, bikini) — no point paying Shopping impressions for them.
  function feedProducts(products) {
    return pageProducts(products).filter(function (p) { return !p.soldOut; });
  }

  // ---------- Same rules as app.js ----------
  function styleObj(p, name) { return (p.styles || []).find(function (s) { return s.name === name; }) || null; }
  function own(map, key) { return map && key != null && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined; }
  function saleNow(p, now) {
    if (!p || typeof p.salePrice !== "number" || !isFinite(p.salePrice)) return null;
    var start = p.saleStart == null ? -Infinity : Date.parse(p.saleStart);
    var end = p.saleEnd == null ? Infinity : Date.parse(p.saleEnd);
    if (isNaN(start) || isNaN(end)) return null;
    return now >= start && now < end ? p.salePrice : null;
  }
  // Regular (non-sale) price for a pick: style, size, color, base — like app.js currentPrice.
  function regularPrice(p, sel) {
    sel = sel || {};
    if (p.styles) { var s = styleObj(p, sel.style); return s ? s.price : p.styles[0].price; }
    var bySize = own(p.sizePrices, sel.size);
    if (bySize !== undefined) return bySize;
    var byColor = own(p.colorPrices, sel.color);
    if (byColor !== undefined) return byColor;
    return p.price;
  }
  // Price charged right now (timed sale included) — app.js currentPrice.
  function priceNow(p, sel, now) {
    sel = sel || {};
    if (p.styles || own(p.sizePrices, sel.size) !== undefined || own(p.colorPrices, sel.color) !== undefined) return regularPrice(p, sel);
    var sale = saleNow(p, now == null ? Date.now() : now);
    return sale != null ? sale : p.price;
  }
  function stockFor(p, sel) {
    sel = sel || {};
    if (p.soldOut) return 0;
    if (p.componentStock) {
      var st = styleObj(p, sel.style), req = st && st.components, have = p.componentStock[sel.color];
      if (!req || !have) return 0;
      var n = Object.keys(req).map(function (k) { return req[k] > 0 ? Math.floor((have[k] || 0) / req[k]) : 0; });
      return n.length ? Math.min.apply(null, n) : 0;
    }
    if (!p.stock) return Infinity;
    var node = p.stock;
    if (p.styles) { node = node[sel.style]; if (node == null) return 0; }
    var c = node[sel.color];
    if (c == null) return 0;
    if (typeof c === "number") return c;
    if (!sel.size) return Object.keys(c).reduce(function (a, k) { return a + (c[k] || 0); }, 0);
    return c[sel.size] || 0;
  }
  function inStock(p, sel) { return !p.comingSoon && stockFor(p, sel) > 0; }
  function imageFor(p, sel) {
    sel = sel || {};
    if (p.styleImages && sel.style && p.styleImages[sel.style]) return p.styleImages[sel.style][sel.color] || p.image;
    var entry = p.colorImages && p.colorImages[sel.color];
    if (!entry) return p.image;
    if (typeof entry === "string") return entry;
    return entry[sel.size] || entry[Object.keys(entry)[0]] || p.image;
  }
  function extraImagesFor(p, sel) {
    sel = sel || {};
    var extra = p.styleGallery && sel.style && p.styleGallery[sel.style] ? (p.styleGallery[sel.style][sel.color] || []) : ((p.gallery && p.gallery[sel.color]) || []);
    var main = imageFor(p, sel);
    return extra.filter(function (img, i) { return img && img !== main && extra.indexOf(img) === i; });
  }
  function absoluteAsset(src, base) {
    if (!src) return "";
    return /^https?:/i.test(src) ? src : (base || SITE_URL) + String(src).replace(/^\//, "");
  }

  // ---------- Variants ----------
  // One Google item per pick a buyer can make. The bundle is listed per
  // Crossbody color only (its case color and phone model are picked in the
  // pop-up; 8 x 8 x 18 = 1,152 items would swamp the feed). Everything else:
  // every style x color x size, same as the Oct 30 cigco-feed.tsv.
  function variants(p) {
    var info = seoInfo(p);
    var colors = p.colors && p.colors.length ? p.colors : [null];
    if (info.bundle || p.bundle) return colors.map(function (c) { return { style: null, color: c, size: null }; });
    var styles = p.styles && p.styles.length ? p.styles.map(function (s) { return s.name; }) : [null];
    var sizes = p.sizes && p.sizes.length ? p.sizes : [null];
    var out = [];
    styles.forEach(function (style) { colors.forEach(function (color) { sizes.forEach(function (size) { out.push({ style: style, color: color, size: size }); }); }); });
    return out;
  }
  function defaultPick(p) {
    var vs = variants(p);
    var want = p.defaultColor;
    return vs.find(function (v) { return v.color === want && inStock(p, v); }) || vs.find(function (v) { return inStock(p, v); }) || vs.find(function (v) { return v.color === want; }) || vs[0];
  }
  // Default pick among the variants a page splits on (no phone model for the case).
  function pageDefaultPick(p) {
    var vs = pageVariants(p);
    var want = p.defaultColor;
    return vs.find(function (v) { return v.color === want && inStock(p, v); }) || vs.find(function (v) { return inStock(p, v); }) || vs.find(function (v) { return v.color === want; }) || vs[0];
  }
  // Detail lines shown/sent to Google (same filter as the Oct 30 feed).
  function detailLines(p) {
    return (Array.isArray(p.details) ? p.details : []).filter(function (d) { return !/trademark of Apple|in-house team|customiz/i.test(d) && !BLOCKED_WORDS.test(d); })
      .map(function (d) { return d === "Matte or gloss finish" ? "Matte finish" : String(d); });
  }
  // Item id: same scheme as the Oct 30 feed, so Merchant Center updates items.
  function idPart(s) {
    return String(s).toUpperCase().replace(/″/g, "IN").replace(/×/g, "X").replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function variantId(p, sel) {
    return idPart([p.id, sel.style, sel.color, sel.size].filter(Boolean).join("-"));
  }
  function sizeText(p, size) {
    if (!size) return "";
    if (p.id === "FW26-SLEEVE") return size.replace("″", " inch");
    if (p.id === "FW26-PILLOW") return size.replace(/″/g, "in").replace("×", " x ");
    return size;
  }
  function variantTitle(p, sel) {
    var name = seoName(p);
    if (p.id === "FW26-CASE" && sel.size) return name + " for " + sel.size + " - " + sel.color;
    if ((p.id === "FW26-SLEEVE" || p.id === "FW26-PILLOW" || p.id === "0008") && sel.size) return name + " " + sizeText(p, sel.size) + " - " + sel.color;
    var bits = [sel.style, sel.color, sel.size].filter(Boolean);
    return bits.length ? name + " - " + bits.join(", ") : name;
  }
  function variantQuery(sel, extra) {
    var q = [];
    ["style", "color", "size"].forEach(function (k) { if (sel && sel[k]) q.push(k + "=" + encodeURIComponent(sel[k]).replace(/%20/g, "+")); });
    Object.keys(extra || {}).forEach(function (k) { if (extra[k]) q.push(k + "=" + encodeURIComponent(extra[k])); });
    return q.length ? "?" + q.join("&") : "";
  }
  function variantUrl(p, sel, extra, base) { return productPageUrl(p, base) + variantQuery(sel, extra); }

  // ---------- Copy ----------
  function isInHand(p) { return !p.pod; }   // masks etc. ship from CIG's own stock
  function shippingUsd(p) { return p.liveStock ? 8.95 : 0; } // shipping-rates.js: US mask orders $8.95 (free over $75); FW26 free
  function cleanText(s) { return String(s == null ? "" : s).replace(/[\t\r\n]+/g, " ").replace(/\s+/g, " ").trim(); }
  function descriptionFor(p) {
    var info = seoInfo(p);
    var parts = [];
    if (p.pod) {
      parts.push(info.name + " from the FW26/27 Collection.");
      if (p.description) parts.push(p.description);
      if (p.material) parts.push("Material: " + p.material + ".");
      var details = detailLines(p).map(function (d) { return d.replace(/\.$/, ""); });
      if (details.length) parts.push(details.join(". ") + ".");
      parts.push("Ships in " + (p.shipTime || "7–9 business days") + ". Free US shipping.");
    } else {
      parts.push(info.blurb || info.name + ".");
      if (p.description) parts.push(p.description);
      if (p.material) parts.push("Material: " + p.material + ".");
      if (p.colors && p.colors.length > 1) parts.push("Colors: " + p.colors.join(", ") + ".");
      if (p.sizes && p.sizes.length > 1) parts.push("Sizes: " + p.sizes.join(", ") + ".");
      if (p.soldOut) parts.push("Currently sold out.");
      if (p.liveStock) parts.push("In stock and ships from the US in 1–2 business days. US mask orders ship for $8.95, free over $75.");
    }
    return cleanText(parts.join(" ").replace(BLOCKED_WORDS, "").replace(/\s+([.,])/g, "$1"));
  }
  function metaDescription(p, now) {
    var prices = variants(p).map(function (v) { return priceNow(p, v, now); });
    var lo = Math.min.apply(null, prices), hi = Math.max.apply(null, prices);
    var price = lo === hi ? "$" + lo.toFixed(2) : "From $" + lo.toFixed(2);
    var ship = p.pod ? "Free US shipping." : p.liveStock ? "Ships from the US in 1–2 business days." : "";
    var colors = p.colors && p.colors.length > 1 ? " " + p.colors.length + " colorways." : "";
    return cleanText(seoName(p) + ". " + price + "." + colors + " " + ship);
  }

  // ---------- schema.org ----------
  function shippingDetails(p) {
    var mask = !!p.liveStock;
    return {
      "@type": "OfferShippingDetails",
      shippingRate: { "@type": "MonetaryAmount", value: shippingUsd(p), currency: "USD" },
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" },
      deliveryTime: {
        "@type": "ShippingDeliveryTime",
        // Policy: masks ship in 1–2 business days; FW26 goes into production in
        // 2–5 business days and arrives about 5–9 business days from the order.
        handlingTime: { "@type": "QuantitativeValue", minValue: mask ? 1 : 2, maxValue: mask ? 2 : 5, unitCode: "DAY" },
        transitTime: { "@type": "QuantitativeValue", minValue: mask ? 2 : 3, maxValue: mask ? 5 : 4, unitCode: "DAY" },
      },
    };
  }
  // docs/policies/shipping-returns.md. Made-to-order pieces: no returns for
  // change of mind (damaged/defective/wrong items are replaced or refunded
  // without sending them back). In-stock masks: unworn exchanges within 14 days
  // of delivery, buyer pays return postage, no refunds except defects.
  function returnPolicy(p) {
    if (p.liveStock) {
      return {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "US",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 14,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
        refundType: "https://schema.org/ExchangeRefund",
        itemCondition: "https://schema.org/NewCondition",
        merchantReturnLink: RETURNS_URL + "#mask-terms",
      };
    }
    return {
      "@type": "MerchantReturnPolicy",
      applicableCountry: "US",
      returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
      merchantReturnLink: RETURNS_URL,
    };
  }
  function variantProduct(p, sel, opts) {
    opts = opts || {};
    var now = opts.now == null ? Date.now() : opts.now;
    var images = [absoluteAsset(imageFor(p, sel), opts.base)].concat(extraImagesFor(p, sel).map(function (i) { return absoluteAsset(i, opts.base); }));
    // description, brand and material sit on the ProductGroup (variants inherit them).
    var out = {
      "@type": "Product",
      name: variantTitle(p, sel),
      sku: variantId(p, sel),
      image: images.length > 1 ? images : images[0],
      offers: {
        "@type": "Offer",
        url: variantUrl(p, sel, null, opts.base),
        price: Number(priceNow(p, sel, now)).toFixed(2),
        priceCurrency: "USD",
        availability: inStock(p, sel) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition",
        shippingDetails: shippingDetails(p),
        hasMerchantReturnPolicy: returnPolicy(p),
      },
    };
    if (sel.color) out.color = sel.color;
    if (sel.size) out.size = sel.size;
    if (sel.style) out.pattern = sel.style;
    return out;
  }
  // Variants listed in a page's JSON-LD: the feed's variants, except a size
  // that changes neither price nor stock is left to the pop-up (MagSafe phone
  // model: 8 colors instead of 144 near-identical entries). Feed links that
  // carry &size= still land on the same page and offer.
  function sizeMatters(p) {
    if (!p.sizes || !p.sizes.length) return false;
    if (p.sizePrices && Object.keys(p.sizePrices).length) return true;
    return !!(p.stock || p.componentStock);
  }
  function pageVariants(p) {
    var vs = variants(p);
    if (sizeMatters(p)) return vs;
    var seen = {};
    return vs.map(function (v) { return { style: v.style, color: v.color, size: null }; }).filter(function (v) {
      var k = v.style + "|" + v.color; if (seen[k]) return false; seen[k] = true; return true;
    });
  }
  // ProductGroup (one per page) with a Product per variant.
  function productJsonLd(p, opts) {
    var vs = pageVariants(p);
    var varies = [];
    if (vs.some(function (v) { return v.style; })) varies.push("https://schema.org/pattern");
    if (vs.some(function (v) { return v.color; })) varies.push("https://schema.org/color");
    if (vs.some(function (v) { return v.size; })) varies.push("https://schema.org/size");
    var info = seoInfo(p);
    return {
      "@context": "https://schema.org",
      "@type": "ProductGroup",
      "@id": productPageUrl(p, opts && opts.base) + "#product",
      name: info.name,
      description: descriptionFor(p),
      url: productPageUrl(p, opts && opts.base),
      brand: { "@type": "Brand", name: BRAND },
      productGroupID: p.id,
      material: p.material || undefined,
      image: absoluteAsset(p.image, opts && opts.base),
      variesBy: varies,
      hasVariant: vs.map(function (v) { return variantProduct(p, v, opts); }),
    };
  }
  function breadcrumbJsonLd(p, base) {
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Shop", item: (base || SITE_URL) },
        { "@type": "ListItem", position: 2, name: seoName(p), item: productPageUrl(p, base) },
      ],
    };
  }
  // Homepage: a list of the product pages (each page carries its own Product data).
  function catalogItemListJsonLd(products, base) {
    return {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: pageProducts(products).map(function (p, i) {
        return { "@type": "ListItem", position: i + 1, url: productPageUrl(p, base), name: seoName(p) };
      }),
    };
  }
  function jsonLdText(data) { return JSON.stringify(data).replace(/</g, "\\u003c"); }

  // ---------- Google Merchant Center feed (TSV) ----------
  var FEED_COLUMNS = ["id", "item_group_id", "title", "description", "link", "image_link", "additional_image_link", "availability", "price", "sale_price", "sale_price_effective_date", "condition", "brand", "identifier_exists", "is_bundle", "google_product_category", "product_type", "color", "size", "pattern", "material", "gender", "age_group", "shipping", "shipping_label", "custom_label_0"];
  function money(n) { return Number(n).toFixed(2) + " USD"; }
  function isoMinute(ms) {
    // ISO 8601 with an explicit UTC offset, as Merchant Center wants.
    return new Date(ms).toISOString().replace(/:\d\d\.\d{3}Z$/, "Z");
  }
  function feedRows(products, opts) {
    opts = opts || {};
    var now = opts.now == null ? Date.now() : opts.now;
    var rows = [];
    feedProducts(products).forEach(function (p) {
      var info = seoInfo(p);
      variants(p).forEach(function (sel) {
        var regular = regularPrice(p, sel);
        var sale = "", saleDates = "";
        // A timed sale that hasn't ended yet: Google switches the price on its own.
        if (!p.styles && own(p.sizePrices, sel.size) === undefined && own(p.colorPrices, sel.color) === undefined &&
            typeof p.salePrice === "number" && p.salePrice < regular) {
          var start = p.saleStart == null ? null : Date.parse(p.saleStart);
          var end = p.saleEnd == null ? null : Date.parse(p.saleEnd);
          if (start != null && end != null && end > now) { sale = money(p.salePrice); saleDates = isoMinute(start) + "/" + isoMinute(end); }
          else if (start == null && end == null) sale = money(p.salePrice);
        }
        rows.push({
          id: variantId(p, sel),
          item_group_id: p.id,
          title: variantTitle(p, sel),
          description: descriptionFor(p),
          link: variantUrl(p, sel, { src: "google" }, opts.base),
          image_link: absoluteAsset(imageFor(p, sel), opts.base),
          additional_image_link: extraImagesFor(p, sel).slice(0, 10).map(function (i) { return absoluteAsset(i, opts.base); }).join(","),
          availability: inStock(p, sel) ? "in_stock" : "out_of_stock",
          price: money(regular),
          sale_price: sale,
          sale_price_effective_date: saleDates,
          condition: "new",
          brand: BRAND,
          identifier_exists: "no",
          is_bundle: info.bundle || p.bundle ? "yes" : "",
          google_product_category: info.gpc || "",
          product_type: info.type || "",
          color: sel.color || "",
          // Ski mask hole style is its size (it's what tells the variants apart).
          size: sel.size || "",
          pattern: sel.style || "Paisley",
          material: p.material || "",
          gender: info.apparel ? (info.gender || "unisex") : "",
          age_group: info.apparel ? "adult" : "",
          shipping: "US:::" + money(shippingUsd(p)),
          shipping_label: p.liveStock ? "mask_us_8_95" : "fw26_free_us",
          custom_label_0: p.pod ? "FW26 made to order" : "Mask in hand",
        });
      });
    });
    return rows;
  }
  function feedTsv(rows) {
    var lines = [FEED_COLUMNS.join("\t")].concat(rows.map(function (r) {
      return FEED_COLUMNS.map(function (c) { return cleanText(r[c]); }).join("\t");
    }));
    return lines.join("\n") + "\n";
  }

  return {
    SITE_URL: SITE_URL, BRAND: BRAND, CONTACT_EMAIL: CONTACT_EMAIL, BLOCKED_WORDS: BLOCKED_WORDS, SEO: SEO, FEED_COLUMNS: FEED_COLUMNS,
    seoInfo: seoInfo, seoName: seoName, productSlug: productSlug, productPagePath: productPagePath, productPageUrl: productPageUrl,
    pageProducts: pageProducts, feedProducts: feedProducts,
    regularPrice: regularPrice, priceNow: priceNow, stockFor: stockFor, inStock: inStock, imageFor: imageFor, extraImagesFor: extraImagesFor,
    absoluteAsset: absoluteAsset, variants: variants, pageVariants: pageVariants, sizeMatters: sizeMatters, defaultPick: defaultPick, pageDefaultPick: pageDefaultPick, detailLines: detailLines, variantId: variantId, variantTitle: variantTitle,
    variantQuery: variantQuery, variantUrl: variantUrl, sizeText: sizeText, shippingUsd: shippingUsd, isInHand: isInHand,
    descriptionFor: descriptionFor, metaDescription: metaDescription, shippingDetails: shippingDetails, returnPolicy: returnPolicy,
    variantProduct: variantProduct, productJsonLd: productJsonLd, breadcrumbJsonLd: breadcrumbJsonLd,
    catalogItemListJsonLd: catalogItemListJsonLd, jsonLdText: jsonLdText, feedRows: feedRows, feedTsv: feedTsv,
  };
});
