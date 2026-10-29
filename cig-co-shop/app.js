const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ---------- FW26/27 drop lock (products.js DROP_AT) ----------
// Before a product's dropAt time it shows a "Drops Oct 30" badge and can't be
// added to the bag. The server enforces the same rule. Opening the site with
// ?droptest unlocks Add to Bag in this tab and shows a "Drop test code" box at
// checkout (the server only accepts the order if the code matches DROP_TEST_CODE).
function dropTestMode() {
  try {
    const href = typeof window !== "undefined" && window.location ? window.location.href : "";
    if (href && new URL(href).searchParams.has("droptest")) {
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem("cig_drop_test", "1");
      return true;
    }
    return typeof sessionStorage !== "undefined" && sessionStorage.getItem("cig_drop_test") === "1";
  } catch {
    return false;
  }
}
const DROP_TEST_MODE = dropTestMode();
function dropLocked(p, now = Date.now()) {
  if (!p || !p.dropAt) return false;
  const at = Date.parse(p.dropAt);
  return Number.isFinite(at) && now < at;
}
function dropBadgeText(p) {
  const at = new Date(Date.parse(p.dropAt));
  return `Drops ${at.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}`;
}
function addBlockedByDrop(p) {
  return dropLocked(p) && !DROP_TEST_MODE;
}

// ---------- Product grid ----------
// Sold out = what the card badges as "Sold Out": marked soldOut, or no stock left
// (live stock included). Coming-soon products aren't sold out.
function isSoldOutForGrid(p) {
  return !p.comingSoon && productTotalStock(p) <= 0;
}
// Visible products in their products.js order, with every sold-out product moved to
// the end (CIG 10/23). Both groups keep their relative order, so anything marked sold
// out later drops to the end on its own.
function shopGridProducts(products = PRODUCTS) {
  const visible = products.filter((p) => !p.hidden);
  return visible.filter((p) => !isSoldOutForGrid(p)).concat(visible.filter(isSoldOutForGrid));
}
function renderProductGrid() {
  const grid = document.getElementById("product-grid");
  if (!grid) return;
  grid.innerHTML = shopGridProducts().map((p) => {
    const price = p.styles || hasPriceRange(p)
      ? `From $${minPrice(p).toFixed(2)}`
      : p.salePrice
      ? `<span class="price-strike">$${p.price.toFixed(2)}</span><span class="price-sale">$${p.salePrice.toFixed(2)}</span>`
      : `$${p.price.toFixed(2)}`;
    return `
    <div class="product-card reveal" data-id="${p.id}">
      <div class="product-card-image-wrap">
        ${p.comingSoon ? `<div class="soldout-badge">Coming Soon</div>` : dropLocked(p) ? `<div class="soldout-badge drop-badge">${dropBadgeText(p)}</div>` : productTotalStock(p) <= 0 ? `<div class="soldout-badge">Sold Out</div>` : ""}
        <div class="product-card-parallax">
          <img src="${p.image}" alt="${p.name}" />
        </div>
      </div>
      <div class="product-card-body">
        <div class="product-card-name">${p.name}</div>
        <div class="product-card-price">${price}</div>
      </div>
    </div>`;
  }).join("");

  grid.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", () => openProductModal(card.dataset.id));
  });

  if (window.initScrollEffects) window.initScrollEffects();
}

// ---------- Product modal ----------
let modalState = { style: null, color: null, size: null, qty: 1, slide: 0 };

// ---------- Inventory helpers ----------
function componentVariantStock(p, style, color) {
  const selectedStyle = styleObj(p, style);
  const requirements = selectedStyle && selectedStyle.components;
  const colorComponents = p.componentStock && p.componentStock[color];
  if (!requirements || !colorComponents) return 0;
  const availability = Object.keys(requirements).map((component) => {
    const required = requirements[component];
    const inStock = colorComponents[component] || 0;
    return required > 0 ? Math.floor(inStock / required) : 0;
  });
  return availability.length ? Math.min.apply(null, availability) : 0;
}

function variantStock(p, style, color, size) {
  if (p.soldOut) return 0;                     // whole product marked sold out (CIG)
  if (p.componentStock) return componentVariantStock(p, style, color);
  if (!p.stock) return Infinity;              // products without a stock block are always available
  let node = p.stock;
  if (p.styles) { node = node[style]; if (node == null) return 0; }
  const c = node[color];
  if (c == null) return 0;
  if (typeof c === "number") return c;        // color-only stock (no sizes)
  if (!size) return Object.keys(c).reduce((a, k) => a + (c[k] || 0), 0);
  return c[size] || 0;
}
function colorStock(p, style, color) { return variantStock(p, style, color, null); }
function productTotalStock(p) {
  if (p.soldOut) return 0;
  if (p.componentStock) {
    return Object.values(p.componentStock).reduce(
      (total, components) => total + Object.values(components).reduce((sum, count) => sum + count, 0),
      0,
    );
  }
  if (!p.stock) return Infinity;
  if (p.styles) return p.styles.reduce((sum, st) => sum + p.colors.reduce((a, c) => a + colorStock(p, st.name, c), 0), 0);
  return p.colors.reduce((a, c) => a + colorStock(p, null, c), 0);
}
function styleObj(p, name) { return (p.styles || []).find((s) => s.name === name) || null; }
function optionPriceFor(map, key) {
  return map && key != null && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}
// Same order as the server (stripe-pricing.js): style, size, color, sale, base.
function currentPrice(p, style, color, size) {
  if (p.styles) { const s = styleObj(p, style); return s ? s.price : p.styles[0].price; }
  const bySize = optionPriceFor(p.sizePrices, size);
  if (bySize !== undefined) return bySize;
  const byColor = optionPriceFor(p.colorPrices, color);
  if (byColor !== undefined) return byColor;
  return p.salePrice != null ? p.salePrice : p.price;
}
function allPrices(p) {
  if (p.styles) return p.styles.map((s) => s.price);
  const base = p.salePrice != null ? p.salePrice : p.price;
  const extra = Object.values(p.sizePrices || {}).concat(Object.values(p.colorPrices || {}));
  // With per-size prices on every size, the base price never applies.
  const allSizesPriced = p.sizes && p.sizes.length && p.sizes.every((sz) => optionPriceFor(p.sizePrices, sz) !== undefined);
  return (allSizesPriced ? [] : [base]).concat(extra).filter((v) => typeof v === "number");
}
function minPrice(p) {
  return Math.min.apply(null, allPrices(p));
}
function hasPriceRange(p) {
  return new Set(allPrices(p)).size > 1;
}

function productImageForColor(p, color, size, style) {
  if (p.styleImages && style && p.styleImages[style]) {
    return p.styleImages[style][color] || p.image;
  }
  const entry = p.colorImages && p.colorImages[color];
  if (!entry) return p.image;
  if (typeof entry === "string") return entry;
  return entry[size] || entry[Object.keys(entry)[0]] || p.image;
}

// Returns the full ordered list of images to show in the slider for the
// currently selected color/style: the primary shot first, then any extra
// angle photos defined in p.gallery[color].
function productGalleryImages(p, color, size, style) {
  const primary = productImageForColor(p, color, size, style);
  let extra = [];
  if (p.styleGallery && style && p.styleGallery[style]) extra = p.styleGallery[style][color] || [];
  else extra = (p.gallery && p.gallery[color]) || [];
  const seen = new Set([primary]);
  const rest = extra.filter((img) => {
    if (seen.has(img)) return false;
    seen.add(img);
    return true;
  });
  return [primary, ...rest];
}

function renderCarousel(p) {
  const wrap = document.getElementById("pd-carousel");
  if (!wrap) return;
  const images = productGalleryImages(p, modalState.color, modalState.size, modalState.style);
  if (modalState.slide >= images.length) modalState.slide = 0;
  const showArrows = images.length > 1;
  wrap.innerHTML = `
    <div class="pd-carousel-frame">
      ${showArrows ? `<button class="pd-carousel-arrow pd-carousel-prev" aria-label="Previous photo">&#8249;</button>` : ""}
      <img class="pd-image" id="pd-image" src="${images[modalState.slide]}" alt="${p.name}" />
      ${showArrows ? `<button class="pd-carousel-arrow pd-carousel-next" aria-label="Next photo">&#8250;</button>` : ""}
    </div>
    ${images.length > 1 ? `
      <div class="pd-carousel-dots">
        ${images.map((_, i) => `<button class="pd-carousel-dot${i === modalState.slide ? " active" : ""}" data-slide="${i}" aria-label="Photo ${i + 1}"></button>`).join("")}
      </div>` : ""}
  `;
  const goTo = (i) => {
    modalState.slide = (i + images.length) % images.length;
    renderCarousel(p);
  };
  const prevBtn = wrap.querySelector(".pd-carousel-prev");
  const nextBtn = wrap.querySelector(".pd-carousel-next");
  if (prevBtn) prevBtn.addEventListener("click", () => goTo(modalState.slide - 1));
  if (nextBtn) nextBtn.addEventListener("click", () => goTo(modalState.slide + 1));
  wrap.querySelectorAll(".pd-carousel-dot").forEach((dot) => {
    dot.addEventListener("click", () => goTo(Number(dot.dataset.slide)));
  });
}

// Phones: the photo is pinned at the top of the product sheet (styles.css, max-width
// 768px) and shrinks a little once the options are scrolled into view. Hysteresis keeps
// the height change from flipping the class back and forth.
const PD_COMPACT_AT = 120;
const PD_EXPAND_AT = 24;
function updateModalMediaCompact(scrollTop, media) {
  if (!media) return false;
  const compact = media.classList.contains("is-compact");
  if (!compact && scrollTop > PD_COMPACT_AT) media.classList.add("is-compact");
  else if (compact && scrollTop < PD_EXPAND_AT) media.classList.remove("is-compact");
  return media.classList.contains("is-compact");
}
function watchModalScroll() {
  const inner = document.querySelector("#product-modal .modal-inner");
  if (!inner || !inner.addEventListener) return;
  inner.scrollTop = 0;
  if (!inner._pdScrollWatch) {
    inner._pdScrollWatch = true;
    inner.addEventListener("scroll", () => updateModalMediaCompact(inner.scrollTop, document.getElementById("pd-media")), { passive: true });
  }
}

function openProductModal(id) {
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p || p.hidden) return;
  modalState = { style: (p.styles && p.styles[0].name) || null, color: (p.defaultColor && p.colors.includes(p.defaultColor) ? p.defaultColor : p.colors[0]) || null, size: p.sizes[0] || null, qty: 1, slide: 0 };

  document.getElementById("modal-content").innerHTML = `
    <div class="pd-media" id="pd-media">
      <div class="pd-carousel" id="pd-carousel"></div>
    </div>
    <div class="pd-details">
    ${p.photoComingSoon ? `<p class="pd-photo-note" id="pd-photo-note" hidden>Photo coming soon</p>` : ""}
    <h3 class="pd-name">${p.name}</h3>
    ${p.soldOut ? `<div class="soldout-badge pd-soldout-badge">Sold Out</div>` : ""}
    <div class="pd-price" id="pd-price"></div>
    ${p.description ? `<p class="pd-description">${p.description}</p>` : ""}
    ${p.styles ? `
      <div class="pd-field">
        <label>Style</label>
        <div class="pd-options" id="pd-styles">
          ${p.styles.map((st) => `<button class="pd-option${st.name === modalState.style ? " selected" : ""}" data-style="${st.name}">${st.name} \u00b7 $${st.price.toFixed(2)}</button>`).join("")}
        </div>
      </div>` : ""}
    ${p.colors.length ? `
      <div class="pd-field">
        <label>Color</label>
        <div class="pd-options" id="pd-colors">
          ${p.colors.map((c) => {
            const swatch = p.colorSwatches && p.colorSwatches[c];
            const hex = !swatch && p.colorHex && p.colorHex[c];
            const dot = swatch ? `<img class="pd-swatch-img" src="${swatch}" alt="" loading="lazy" />` : hex ? `<span class="pd-swatch-dot" style="background:${hex}"></span>` : "";
            return `<button class="pd-option${dot ? " pd-swatch" : ""}${c === modalState.color ? " selected" : ""}${colorStock(p, modalState.style, c) <= 0 ? " soldout" : ""}" data-color="${c}" title="${c}">${dot}<span>${c}</span></button>`;
          }).join("")}
        </div>
      </div>` : ""}
    ${p.sizes.length ? `
      <div class="pd-field">
        <label>${p.sizeLabel || "Size"}</label>
        <div class="pd-options" id="pd-sizes">
          ${p.sizes.map((s) => `<button class="pd-option${s === modalState.size ? " selected" : ""}${variantStock(p, modalState.style, modalState.color, s) <= 0 ? " soldout" : ""}" data-size="${s}">${s}</button>`).join("")}
        </div>
      </div>` : ""}
    <div class="pd-field">
      <label>Quantity</label>
      <div class="pd-qty">
        <button id="qty-minus">&minus;</button>
        <span id="qty-value">1</span>
        <button id="qty-plus">+</button>
      </div>
    </div>
    <form class="notify-me" id="pd-notify" hidden novalidate>
      <label for="pd-notify-email">Sold out. Get an email when <span id="pd-notify-variant"></span> is back.</label>
      <div class="email-gate-row">
        <input type="email" id="pd-notify-email" placeholder="you@email.com" autocomplete="email" required />
        <button type="submit" class="btn btn-outline btn-promo">Notify me</button>
      </div>
      <div class="hp-field" aria-hidden="true"><input type="text" name="website" tabindex="-1" autocomplete="off" /></div>
      <p class="notify-me-note">One email when it&rsquo;s back. Unsubscribe anytime.</p>
      <p class="notify-me-message" role="status" aria-live="polite"></p>
    </form>
    <button class="btn btn-gold btn-full" id="add-to-cart-btn">Add to Bag</button>
    </div>
  `;

  renderCarousel(p);
  watchModalScroll();

  function refreshAvailability() {
    const photoNote = document.getElementById("pd-photo-note");
    if (photoNote) photoNote.hidden = !p.photoComingSoon.includes(modalState.color);
    document.querySelectorAll("#pd-sizes .pd-option").forEach((b) => {
      b.classList.toggle("soldout", variantStock(p, modalState.style, modalState.color, b.dataset.size) <= 0);
    });
    document.querySelectorAll("#pd-colors .pd-option").forEach((b) => {
      b.classList.toggle("soldout", colorStock(p, modalState.style, b.dataset.color) <= 0);
    });
    const priceEl = document.getElementById("pd-price");
    if (priceEl) priceEl.textContent = `$${currentPrice(p, modalState.style, modalState.color, modalState.size).toFixed(2)}`;
    const avail = variantStock(p, modalState.style, modalState.color, modalState.size);
    const addBtn = document.getElementById("add-to-cart-btn");
    const qtyVal = document.getElementById("qty-value");
    refreshNotifyMe(p, avail);
    if (addBlockedByDrop(p)) {
      addBtn.textContent = dropBadgeText(p);
      addBtn.disabled = true;
      addBtn.classList.add("btn-disabled");
    } else if (p.comingSoon) {
      addBtn.textContent = "Coming Soon";
      addBtn.disabled = true;
      addBtn.classList.add("btn-disabled");
    } else if (avail <= 0) {
      addBtn.textContent = "Sold Out";
      addBtn.disabled = true;
      addBtn.classList.add("btn-disabled");
    } else {
      addBtn.textContent = "Add to Bag";
      addBtn.disabled = false;
      addBtn.classList.remove("btn-disabled");
      if (modalState.qty > avail) { modalState.qty = avail; qtyVal.textContent = avail; }
    }
  }

  document.querySelectorAll("#pd-styles .pd-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      modalState.style = btn.dataset.style;
      modalState.slide = 0;
      document.querySelectorAll("#pd-styles .pd-option").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      renderCarousel(p);
      refreshAvailability();
    });
  });

  document.querySelectorAll("#pd-colors .pd-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      modalState.color = btn.dataset.color;
      modalState.slide = 0;
      document.querySelectorAll("#pd-colors .pd-option").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      renderCarousel(p);
      refreshAvailability();
    });
  });
  document.querySelectorAll("#pd-sizes .pd-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      modalState.size = btn.dataset.size;
      modalState.slide = 0;
      document.querySelectorAll("#pd-sizes .pd-option").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      renderCarousel(p);
      refreshAvailability();
    });
  });
  document.getElementById("qty-minus").addEventListener("click", () => {
    modalState.qty = Math.max(1, modalState.qty - 1);
    document.getElementById("qty-value").textContent = modalState.qty;
  });
  document.getElementById("qty-plus").addEventListener("click", () => {
    const avail = variantStock(p, modalState.style, modalState.color, modalState.size);
    modalState.qty = Math.min(avail, modalState.qty + 1);
    document.getElementById("qty-value").textContent = modalState.qty;
  });
  document.getElementById("add-to-cart-btn").addEventListener("click", () => {
    if (p.comingSoon || addBlockedByDrop(p) || variantStock(p, modalState.style, modalState.color, modalState.size) <= 0) return;
    addToCart({
      productId: p.id,
      sku: p.sku,
      name: p.styles ? `${p.name} (${modalState.style})` : p.name,
      price: currentPrice(p, modalState.style, modalState.color, modalState.size),
      image: productImageForColor(p, modalState.color, modalState.size, modalState.style),
      color: modalState.color,
      size: modalState.size,
      style: modalState.style,
      qty: modalState.qty,
    });
    dismissProductModal();
  });

  wireNotifyMe(p);
  refreshAvailability();
  document.getElementById("product-modal").setAttribute("aria-hidden", "false");
  pushProductModalHistory();
}

// ---------- Notify me (sold-out products/variants) ----------
// Email list source "notify_me", stored with the product and variant so we can
// email exactly the people waiting when it restocks.
function notifyVariantLabel(p, state) {
  return [p.styles ? state.style : null, state.color, state.size].filter(Boolean).join(" / ");
}
// Offer it on anything sold out, but not on drop-locked or coming-soon items.
function shouldOfferNotifyMe(p, avail) {
  return !p.comingSoon && !dropLocked(p) && avail <= 0;
}
function refreshNotifyMe(p, avail) {
  const form = document.getElementById("pd-notify");
  if (!form) return;
  const offer = shouldOfferNotifyMe(p, avail);
  form.hidden = !offer;
  if (!offer) return;
  const label = notifyVariantLabel(p, modalState);
  const variantEl = document.getElementById("pd-notify-variant");
  if (variantEl) variantEl.textContent = label ? `${p.name} (${label})` : p.name;
  if (form.dataset.variant !== label) {
    form.dataset.variant = label;
    const message = form.querySelector(".notify-me-message");
    if (message) message.textContent = "";
  }
}
function wireNotifyMe(p) {
  const form = document.getElementById("pd-notify");
  if (!form || form.dataset.wired) return;
  form.dataset.wired = "1";
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("pd-notify-email");
    const message = form.querySelector(".notify-me-message");
    const button = form.querySelector('button[type="submit"]');
    const email = input ? input.value : "";
    if (!isValidEmail(email)) {
      if (message) message.textContent = "Enter a valid email.";
      return;
    }
    if (button) button.disabled = true;
    try {
      await subscribeEmail({
        email,
        source: "notify_me",
        productId: p.id,
        variant: notifyVariantLabel(p, modalState) || null,
        website: form.querySelector('input[name="website"]').value,
      });
      if (message) message.textContent = "You're on the list. We'll email you when it's back.";
      if (input) input.value = "";
    } catch (error) {
      if (message) message.textContent = error.message;
    } finally {
      if (button) button.disabled = false;
    }
  });
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.setAttribute("aria-hidden", "true");
}

// ---------- Product modal dismissal ----------
// On a phone the modal reads as its own screen, so people dismiss it with the
// system Back gesture. Giving it a history entry makes Back close the sheet
// instead of leaving the shop. Every other dismissal unwinds that same entry, so
// the modal and the history stack can't drift apart.
let productModalHasHistoryEntry = false;

function productModalIsOpen() {
  const el = document.getElementById("product-modal");
  return !!el && el.getAttribute("aria-hidden") === "false";
}

function pushProductModalHistory() {
  const nav = typeof window !== "undefined" ? window.history : null;
  if (productModalHasHistoryEntry || !nav) return;
  nav.pushState({ ...nav.state, cigProductModal: true }, "");
  productModalHasHistoryEntry = true;
}

function dismissProductModal() {
  const nav = typeof window !== "undefined" ? window.history : null;
  if (productModalHasHistoryEntry && nav) {
    nav.back();   // the popstate handler below performs the actual close
    return;
  }
  closeModal("product-modal");
}

window.addEventListener("popstate", () => {
  productModalHasHistoryEntry = false;
  if (productModalIsOpen()) closeModal("product-modal");
});

const modalCloseBtn = document.getElementById("modal-close");
if (modalCloseBtn) modalCloseBtn.addEventListener("click", dismissProductModal);

// Tapping the dimmed area outside the sheet closes it, matching the cart drawer.
const productModalEl = document.getElementById("product-modal");
if (productModalEl) {
  productModalEl.addEventListener("click", (e) => {
    if (e.target === productModalEl) dismissProductModal();
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && productModalIsOpen()) dismissProductModal();
});

// ---------- Cart drawer wiring ----------
const cartToggleBtn = document.getElementById("cart-toggle");
const cartCloseBtn = document.getElementById("cart-close");
const cartBackdropEl = document.getElementById("cart-backdrop");
if (cartToggleBtn) cartToggleBtn.addEventListener("click", openCart);
if (cartCloseBtn) cartCloseBtn.addEventListener("click", closeCart);
if (cartBackdropEl) cartBackdropEl.addEventListener("click", closeCart);

// ---------- Promo codes ----------
// Arcade codes (unique per email, one use, 7 days) are checked by the server;
// serverPromos caches the ones it confirmed.
const serverPromos = {};
function promoDetails(code) {
  if (!code) return null;
  if (typeof PROMO_CODES !== "undefined" && PROMO_CODES[code]) return PROMO_CODES[code];
  return serverPromos[code] || null;
}
function looksLikeArcadeCode(code) {
  return typeof isArcadeCode === "function" && isArcadeCode(code);
}

const savedPromo = typeof getSavedPromo === "function" ? getSavedPromo() : null;
let promoState = savedPromo && !looksLikeArcadeCode(savedPromo) ? savedPromo : null;

// Crypto checkout on/off: CRYPTO_ENABLED in products.js (missing = off).
const cryptoEnabled = typeof CRYPTO_ENABLED !== "undefined" && CRYPTO_ENABLED === true;
const CRYPTO_NOTE = cryptoEnabled ? " (Crypto checkout gets its 20% off instead.)" : "";

// Shows crypto-only bits ([data-crypto-only]) when crypto is on, and their
// stand-ins ([data-crypto-off]) when it's off. Everything starts hidden in the
// HTML, so crypto never flashes on screen while it's switched off.
function applyCryptoSwitch() {
  if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return;
  Array.from(document.querySelectorAll("[data-crypto-only]")).forEach((el) => { el.hidden = !cryptoEnabled; });
  Array.from(document.querySelectorAll("[data-crypto-off]")).forEach((el) => { el.hidden = cryptoEnabled; });
}
applyCryptoSwitch();

async function applyPromoCode(rawCode, { quiet = false } = {}) {
  const messageEl = quiet ? null : document.getElementById("promo-message");
  const code = (rawCode || "").trim().toUpperCase();
  if (!code) {
    promoState = null;
    if (messageEl) messageEl.textContent = "";
    renderCheckoutSummary();
    return;
  }
  if (typeof PROMO_CODES !== "undefined" && PROMO_CODES[code]) {
    promoState = code;
    if (typeof savePromoWin === "function") savePromoWin(code);
    if (messageEl) { messageEl.textContent = `Code applied — ${PROMO_CODES[code].label} on masks.${CRYPTO_NOTE}`; messageEl.classList.remove("promo-error"); }
  } else if (looksLikeArcadeCode(code)) {
    if (messageEl) { messageEl.textContent = "Checking code…"; messageEl.classList.remove("promo-error"); }
    let result = null;
    try {
      const res = await fetch("/.netlify/functions/validate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      result = await res.json();
    } catch {
      result = { valid: false, error: "That code couldn't be checked. Please try again." };
    }
    if (result && result.valid) {
      serverPromos[code] = { discount: result.discount, label: result.label };
      promoState = code;
      if (typeof savePromoWin === "function") savePromoWin(code);
      if (messageEl) { messageEl.textContent = `Code applied — ${result.label} on masks (ski mask, balaclava, moto mask). One use, with the email that won it.${CRYPTO_NOTE}`; messageEl.classList.remove("promo-error"); }
    } else {
      promoState = null;
      if (typeof clearSavedPromo === "function") clearSavedPromo();
      if (messageEl) { messageEl.textContent = (result && result.error) || "That code isn't valid."; messageEl.classList.add("promo-error"); }
    }
  } else {
    promoState = null;
    if (messageEl) { messageEl.textContent = "That code isn't valid."; messageEl.classList.add("promo-error"); }
  }
  renderCheckoutSummary();
}

// An Arcade code saved by the Arcade page is re-checked before it's applied.
if (savedPromo && looksLikeArcadeCode(savedPromo)) {
  applyPromoCode(savedPromo, { quiet: true });
}

const promoApplyBtn = document.getElementById("promo-apply");
const promoInputEl = document.getElementById("promo-input");
if (promoApplyBtn && promoInputEl) {
  promoApplyBtn.addEventListener("click", () => applyPromoCode(promoInputEl.value));
  promoInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); applyPromoCode(promoInputEl.value); }
  });
}

// ---------- Checkout ----------
const checkoutBtn = document.getElementById("checkout-btn");
if (checkoutBtn) {
  checkoutBtn.addEventListener("click", () => {
    const cart = getCart();
    if (cart.length === 0) return;
    if (promoInputEl && promoState) promoInputEl.value = promoState;
    renderCheckoutSummary();
    const checkoutModal = document.getElementById("checkout-modal");
    if (checkoutModal) checkoutModal.setAttribute("aria-hidden", "false");
  });
}
const checkoutCloseBtn = document.getElementById("checkout-close");
if (checkoutCloseBtn) checkoutCloseBtn.addEventListener("click", () => closeModal("checkout-modal"));

// ---------- Ship-to country + shipping (rates: shipping-rates.js) ----------
// A function (not a const) so it's safe to call before this point in the file.
function shipCountryNames() {
  return typeof SHIP_TO_COUNTRIES !== "undefined" ? SHIP_TO_COUNTRIES : { US: "United States" };
}

function selectedShipCountry() {
  const select = document.getElementById("checkout-country");
  const value = select && typeof select.value === "string" ? select.value.trim().toUpperCase() : "";
  return value && shipCountryNames()[value] ? value : "US";
}

// Same quote the server charges (shipping-rates.js). Returns
// { shippingCents, blocked: [product names that ship to the US only] }.
function cartShippingLines(cart) {
  return cart.map((item) => {
    const product = PRODUCTS.find((entry) => entry.id === item.productId);
    return {
      name: product ? product.name : item.name,
      shipping: product && typeof product.shipping === "string" ? product.shipping : null,
      quantity: item.qty,
      // In-hand backstock (masks): US only, flat fee under $75 (shipping-rates.js).
      mask: !!(product && product.liveStock),
    };
  });
}

// Items total after promo, in cents, rounded per unit exactly like the server
// (stripe-pricing.js discountedUnitAmount), so the $75 threshold matches.
// Promos are masks only (promo.js promoUnitCents): FW26/27 lines stay full price.
function cartMerchandiseCents(cart, promoInfo) {
  const basisPoints = promoInfo && promoInfo.discount ? Math.round(promoInfo.discount * 10000) : 0;
  return cart.reduce((sum, item) => {
    const unit = Math.round(Number(item.price) * 100);
    const charged = typeof promoUnitCents === "function"
      ? promoUnitCents(item.productId, unit, basisPoints)
      : unit; // promo.js missing: show full price (the server decides anyway)
    return sum + charged * item.qty;
  }, 0);
}

function cartShippingQuote(cart, country) {
  const lines = cartShippingLines(cart);
  const merchandiseCents = cartMerchandiseCents(cart, promoDetails(promoState));
  if (typeof quoteShipping !== "function") {
    if (country === "US") return { shippingCents: lines.some((l) => l.mask) ? null : 0, blocked: [] };
    return { shippingCents: null, blocked: lines.map((line) => line.name) };
  }
  const quote = quoteShipping(lines, country, { merchandiseCents });
  return { shippingCents: quote.shippingCents, blocked: quote.blocked };
}

function usOnlyMessage(blocked) {
  return `${blocked.join(", ")} ${blocked.length === 1 ? "ships" : "ship"} to the US only, so international shipping isn't available for this bag.`;
}

// Disables countries the bag can't ship to and updates the address hints.
function updateShipToOptions(cart) {
  const select = document.getElementById("checkout-country");
  const note = document.getElementById("checkout-shipping-note");
  let blockedNames = [];
  if (select && select.options) {
    Array.from(select.options).forEach((option) => {
      if (option.value === "US") return;
      const quote = cartShippingQuote(cart, option.value);
      option.disabled = quote.shippingCents === null;
      if (quote.blocked.length) blockedNames = quote.blocked;
    });
    const current = Array.from(select.options).find((option) => option.value === select.value);
    if (current && current.disabled) select.value = "US";
  }
  const country = selectedShipCountry();
  if (note) {
    let text = blockedNames.length ? usOnlyMessage(blockedNames) : "";
    if (!text && country !== "US" && typeof slowDeliveryNote === "function") {
      text = slowDeliveryNote(cartShippingLines(cart), country);
    }
    note.textContent = text;
    note.hidden = !text;
  }
  const maskNote = document.getElementById("checkout-mask-shipping-note");
  if (maskNote) {
    if (typeof MASK_SHIPPING_NOTE === "string") maskNote.textContent = MASK_SHIPPING_NOTE;
    maskNote.hidden = !cartShippingLines(cart).some((line) => line.mask);
  }
  const dutiesNote = document.getElementById("checkout-duties-note");
  if (dutiesNote) dutiesNote.hidden = country === "US";
  const pcccRow = document.getElementById("checkout-pccc-row");
  if (pcccRow) pcccRow.hidden = country !== "KR";
  const stateEl = document.getElementById("checkout-state");
  const zipEl = document.getElementById("checkout-zip");
  if (stateEl) stateEl.placeholder = country === "US" ? "State (e.g. GA)" : "State / Province (optional)";
  if (zipEl) zipEl.placeholder = country === "US" ? "ZIP" : "Postal code";
}

const shipCountryEl = document.getElementById("checkout-country");
if (shipCountryEl && typeof shipCountryEl.addEventListener === "function") {
  shipCountryEl.addEventListener("change", () => renderCheckoutSummary());
}

function renderCheckoutSummary() {
  const summary = document.getElementById("checkout-summary");
  if (!summary) return;
  const cart = getCart();
  updateShipToOptions(cart);
  const country = selectedShipCountry();
  const shippingQuote = cartShippingQuote(cart, country);
  const shipping = shippingQuote.shippingCents === null ? 0 : shippingQuote.shippingCents / 100;
  const subtotal = cartSubtotal(cart);
  const promoInfo = promoDetails(promoState);
  const discountFraction = promoInfo ? promoInfo.discount : 0;
  const merchandise = cartMerchandiseCents(cart, promoInfo) / 100;
  const discountAmount = subtotal - merchandise;
  const total = merchandise + shipping;

  let rows = cart
    .map((item) => {
      const meta = [item.color, item.size].filter(Boolean).join(" / ");
      return `<div class="checkout-summary-row"><span>${item.name}${meta ? " (" + meta + ")" : ""} &times;${item.qty}</span><span>$${(item.price * item.qty).toFixed(2)}</span></div>`;
    })
    .join("");

  rows += `<div class="checkout-summary-row" style="border-top:1px solid #2a2a2a;margin-top:8px;padding-top:8px;"><span>Subtotal</span><span>$${subtotal.toFixed(2)}</span></div>`;

  if (discountFraction > 0 && discountAmount > 0) {
    rows += `<div class="checkout-summary-row" style="color:var(--gold);"><span>Promo (${promoState}, masks only)</span><span>&minus;$${discountAmount.toFixed(2)}</span></div>`;
  } else if (discountFraction > 0) {
    // Promos are masks only (promo.js); checkout refuses a code on a bag with no mask.
    rows += `<div class="checkout-summary-row promo-error"><span>Promo (${promoState}) only works on masks (ski mask, balaclava, moto mask). Add a mask or remove the code.</span><span></span></div>`;
  }

  const shippingLabel = shippingQuote.shippingCents === null
    ? "Not available"
    : shipping === 0 ? "Free" : `$${shipping.toFixed(2)}`;
  rows += `<div class="checkout-summary-row"><span>Shipping (${shipCountryNames()[country] || country})</span><span>${shippingLabel}</span></div>`;

  rows += `<div class="checkout-summary-row" style="font-weight:700;"><span>Total</span><span>$${total.toFixed(2)}</span></div>`;

  summary.innerHTML = rows;
}

function checkoutFieldValue(id) {
  const element = document.getElementById(id);
  return element && typeof element.value === "string" ? element.value.trim() : "";
}

function getCheckoutFields() {
  return {
    email: checkoutFieldValue("checkout-email"),
    name: checkoutFieldValue("checkout-name"),
    address: checkoutFieldValue("checkout-address"),
    city: checkoutFieldValue("checkout-city"),
    state: checkoutFieldValue("checkout-state").toUpperCase(),
    zip: checkoutFieldValue("checkout-zip").toUpperCase(),
    country: selectedShipCountry(),
    pccc: checkoutFieldValue("checkout-pccc").replace(/[\s-]/g, "").toUpperCase(),
  };
}

// South Korea customs code: P + 12 digits (the server checks it too).
function validateKoreaCustomsCode(fields) {
  if (fields.country !== "KR") return null;
  return /^P\d{12}$/.test(fields.pccc || "")
    ? null
    : "South Korea orders need your Personal Customs Clearance Code (PCCC): P followed by 12 digits.";
}

function validateCheckoutFields(fields) {
  return fields.email && fields.name && fields.address && fields.city;
}

// Crypto has no hosted address form, so it needs the full address from us:
// state + ZIP in the US, a postal code elsewhere (the server checks the format).
function validateCryptoShipping(fields) {
  if (fields.country === "US") {
    if (!/^[A-Z]{2}$/.test(fields.state)) {
      return "Crypto orders need a US state (2-letter code, e.g. GA).";
    }
    if (!/^\d{5}(-\d{4})?$/.test(fields.zip)) {
      return "Crypto orders need a valid 5-digit US ZIP code.";
    }
  } else if (!fields.zip) {
    return "Crypto orders need a postal code.";
  }
  return null;
}

class StripeCartCompatibilityError extends Error {
  constructor(message) {
    super(message);
    this.name = "StripeCartCompatibilityError";
  }
}

// The server turned the checkout down with a message meant for the shopper
// (e.g. a non-US crypto address), so show it as-is.
class CheckoutRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "CheckoutRequestError";
  }
}

class CheckoutFingerprintError extends Error {
  constructor(cause) {
    super("Checkout fingerprint generation failed.");
    this.name = "CheckoutFingerprintError";
    this.cause = cause;
  }
}

function stripeStyleForItem(item, product) {
  const productStyles =
    product && Array.isArray(product.styles) ? product.styles : [];
  if (productStyles.length === 0) return null;

  const style =
    typeof itemStyleKey === "function" ? itemStyleKey(item) : item.style;
  if (!productStyles.some((entry) => entry.name === style)) {
    throw new StripeCartCompatibilityError(
      `Your saved ${product.name} selection is missing a valid style. Please remove it from your bag and re-add it before checking out.`,
    );
  }
  return style;
}

function buildCheckoutRequestBody(
  method,
  cart,
  cartToCharge,
  customer,
  promoCode,
) {
  // Every payment method sends only the catalog selection; the server looks up
  // names and prices in products.js. (cartToCharge is no longer used.)
  return {
    items: cart.map((item) => {
      const product = PRODUCTS.find((entry) => entry.id === item.productId);
      return {
        productId: item.productId,
        color: item.color ?? null,
        size: item.size ?? null,
        style: stripeStyleForItem(item, product),
        quantity: item.qty,
      };
    }),
    promoCode: promoCode || null,
    customer,
  };
}

async function addCheckoutFingerprint(
  requestBody,
  promoCode,
  fingerprintApi =
    typeof window !== "undefined"
      ? window.CIGCheckoutFingerprint
      : null,
) {
  try {
    if (
      !fingerprintApi ||
      typeof fingerprintApi.createCheckoutFingerprint !== "function"
    ) {
      throw new Error("Checkout fingerprint utility is unavailable.");
    }

    const checkoutFingerprint =
      await fingerprintApi.createCheckoutFingerprint(
        requestBody.items,
        promoCode,
      );
    if (!/^v1:[a-f0-9]{64}$/.test(checkoutFingerprint)) {
      throw new Error("Checkout fingerprint utility returned an invalid value.");
    }

    return {
      ...requestBody,
      checkoutFingerprint,
    };
  } catch (error) {
    throw new CheckoutFingerprintError(error);
  }
}

function handleCheckoutResult({
  location = typeof window !== "undefined" ? window.location : null,
  history = typeof window !== "undefined" ? window.history : null,
  statusElement = document.getElementById("checkout-status"),
} = {}) {
  if (!location || !history || !statusElement) return;

  const url = new URL(location.href);
  const result = url.searchParams.get("checkout");
  const messages = {
    cancelled:
      "Checkout was cancelled. Your bag is still saved whenever you’re ready.",
    success:
      "You returned from checkout. Payment confirmation is still pending, so your bag has been kept for now.",
    failed:
      "Your payment didn’t go through, so nothing was charged. Your bag is still saved.",
    "us-only":
      "Your PayPal shipping address isn’t in the US, so your payment wasn’t taken. Pick its country under “Ship to” (pillows ship to the US only). Your bag is still saved.",
    "country-mismatch":
      "Your PayPal shipping address didn’t match the country you picked under “Ship to”, so your payment wasn’t taken. Your bag is still saved.",
  };
  const message = messages[result];
  if (!message) return;

  statusElement.textContent = message;
  statusElement.hidden = false;

  url.searchParams.delete("checkout");
  url.searchParams.delete("session_id");
  history.replaceState(
    history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

// The three payment functions below call your deployed serverless functions
// (see netlify/functions/). Each returns a hosted checkout URL to redirect to.
const paymentButtons = Array.from(document.querySelectorAll(".pay-btn"));
paymentButtons.forEach((btn) => {
  if (btn.dataset && btn.dataset.method === "crypto") {
    btn.hidden = !cryptoEnabled;
    if (!cryptoEnabled) btn.disabled = true;
  }
});
let checkoutSubmissionPending = false;

paymentButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const method = btn.dataset.method;
    if (checkoutSubmissionPending) return;

    const errorEl = document.getElementById("checkout-error");
    if (method === "crypto" && !cryptoEnabled) {
      errorEl.textContent = "Crypto checkout isn't available right now. Please pay by card or PayPal.";
      return;
    }
    const fields = getCheckoutFields();
    const loadingEl = document.getElementById("checkout-loading");
    errorEl.textContent = "";

    if (!validateCheckoutFields(fields)) {
      errorEl.textContent = "Please fill in all fields before checking out.";
      return;
    }

    const pcccError = validateKoreaCustomsCode(fields);
    if (pcccError) {
      errorEl.textContent = pcccError;
      return;
    }

    if (method === "crypto") {
      const shippingError = validateCryptoShipping(fields);
      if (shippingError) {
        errorEl.textContent = shippingError;
        return;
      }
    }

    const cart = getCart();
    if (cart.length === 0) {
      errorEl.textContent = "Your bag is empty.";
      return;
    }

    // Print-on-demand items are sent to Printful from a paid card or PayPal
    // order. Toggle: POD_CARD_ONLY in products.js (missing = card only; false
    // since CIG turned PayPal on for FW26, 10/22). Crypto never takes them.
    const podCardOnly = typeof POD_CARD_ONLY === "undefined" || POD_CARD_ONLY !== false;
    const cartHasPod = cart.some((item) => {
      const product = PRODUCTS.find((entry) => entry.id === item.productId);
      return product && product.pod;
    });
    if (cartHasPod && podCardOnly && method !== "stripe") {
      errorEl.textContent = "Made-to-order items can only be paid by card for now.";
      return;
    }
    if (cartHasPod && method === "crypto") {
      errorEl.textContent = "Made-to-order items can be paid by card or PayPal.";
      return;
    }

    const shipQuote = cartShippingQuote(cart, fields.country);
    if (shipQuote.shippingCents === null) {
      errorEl.textContent = shipQuote.blocked.length
        ? usOnlyMessage(shipQuote.blocked)
        : "Shipping isn't available to that country yet.";
      return;
    }

    checkoutSubmissionPending = true;
    const previousDisabledStates = paymentButtons.map(
      (paymentButton) => paymentButton.disabled,
    );
    paymentButtons.forEach((paymentButton) => {
      paymentButton.disabled = true;
    });
    loadingEl.hidden = false;

    try {
      const optinEl = document.getElementById("checkout-optin");
      const marketingConsent = !!(optinEl && optinEl.checked);
      if (
        method !== "stripe"
        && marketingConsent
        && fields.email
        && typeof submitEmail === "function"
      ) {
        submitEmail(fields.email, "checkout");
      }

      const endpoint =
        method === "stripe"
          ? "/.netlify/functions/create-stripe-session"
          : method === "paypal"
          ? "/.netlify/functions/create-paypal-order"
          : "/.netlify/functions/create-coinbase-charge";

      // Promo codes never stack with the 20% crypto discount (the server
      // enforces this too); prices themselves are always computed server-side.
      const checkoutPromo = method === "crypto" ? null : promoState;

      // Only crypto needs state/ZIP/country from us; card and PayPal collect the
      // shipping address on their own hosted pages (locked to the chosen country).
      // The PCCC is only sent for South Korea (customs needs it on the parcel).
      const { state, zip, country, pccc, ...baseFields } = fields;
      if (country === "KR") baseFields.pccc = pccc;
      const customerFields =
        method === "crypto" ? { ...baseFields, state, zip, country } : baseFields;

      let requestBody = buildCheckoutRequestBody(
        method,
        cart,
        cart,
        customerFields,
        checkoutPromo,
      );
      requestBody = {
        ...requestBody,
        customer: {
          ...requestBody.customer,
          marketingConsent,
        },
      };
      // The server prices shipping for this country (missing = US, free).
      if (method === "crypto" || country !== "US") {
        requestBody.shipCountry = country;
      }
      // Pre-launch test order only (see the drop lock above).
      const dropTestCode = DROP_TEST_MODE ? checkoutFieldValue("drop-test-code") : "";
      if (dropTestCode) requestBody.dropTestCode = dropTestCode;
      if (method === "stripe") {
        requestBody = await addCheckoutFingerprint(
          requestBody,
          promoState,
        );
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      if (res.status === 400 && data.error) {
        throw new CheckoutRequestError(data.error);
      }
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Checkout could not be started.");
      }
      // Save the cart+order id locally in case you want to show an order history later.
      window.location.href = data.url;
    } catch (err) {
      loadingEl.hidden = true;
      if (err instanceof CheckoutFingerprintError) {
        console.error(
          "Checkout fingerprint generation failed.",
          err.cause,
        );
        errorEl.textContent =
          "Checkout could not be prepared. Please refresh and try again.";
      } else {
        errorEl.textContent = err instanceof StripeCartCompatibilityError
          || err instanceof CheckoutRequestError
          ? err.message
          : "Checkout isn't wired up yet on this deployment — add your API keys per the README, then this button will work. (" +
            err.message +
            ")";
      }
    } finally {
      checkoutSubmissionPending = false;
      paymentButtons.forEach((paymentButton, index) => {
        paymentButton.disabled = previousDisabledStates[index];
      });
    }
  });
});

// ---------- Init ----------
handleCheckoutResult();
renderProductGrid();

// Show the drop-test code box only in test mode.
(function showDropTestRow() {
  const row = typeof document !== "undefined" && document.getElementById ? document.getElementById("drop-test-row") : null;
  if (row) row.hidden = !DROP_TEST_MODE;
})();

// Re-render when the drop opens, for shoppers who left the page open.
(function scheduleDropOpen() {
  const now = Date.now();
  const upcoming = PRODUCTS.filter((p) => dropLocked(p, now)).map((p) => Date.parse(p.dropAt) - now);
  if (!upcoming.length || typeof setTimeout !== "function") return;
  const wait = Math.min.apply(null, upcoming) + 1000;
  if (wait < 2147483647) setTimeout(() => renderProductGrid(), wait);
})();
if (typeof renderCart === "function") renderCart();

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CheckoutFingerprintError,
    StripeCartCompatibilityError,
    addCheckoutFingerprint,
    buildCheckoutRequestBody,
    componentVariantStock,
    currentPrice,
    dropLocked,
    minPrice,
    handleCheckoutResult,
    notifyVariantLabel,
    shouldOfferNotifyMe,
    productTotalStock,
    variantStock,
  };
}
