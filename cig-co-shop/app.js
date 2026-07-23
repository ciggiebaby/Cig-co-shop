const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ---------- Product grid ----------
function renderProductGrid() {
  const grid = document.getElementById("product-grid");
  if (!grid) return;
  grid.innerHTML = PRODUCTS.map((p) => {
    const price = p.styles
      ? `From $${minPrice(p).toFixed(2)}`
      : p.salePrice
      ? `<span class="price-strike">$${p.price.toFixed(2)}</span><span class="price-sale">$${p.salePrice.toFixed(2)}</span>`
      : `$${p.price.toFixed(2)}`;
    return `
    <div class="product-card reveal" data-id="${p.id}">
      <div class="product-card-image-wrap">
        ${productTotalStock(p) <= 0 ? `<div class="soldout-badge">Sold Out</div>` : ""}
        <div class="product-card-parallax">
          <img src="${p.image}" alt="${p.name}" />
        </div>
      </div>
      <div class="product-card-body">
        <div class="product-card-sku">SKU: ${p.sku}</div>
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
function variantStock(p, style, color, size) {
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
  if (!p.stock) return Infinity;
  if (p.styles) return p.styles.reduce((sum, st) => sum + p.colors.reduce((a, c) => a + colorStock(p, st.name, c), 0), 0);
  return p.colors.reduce((a, c) => a + colorStock(p, null, c), 0);
}
function styleObj(p, name) { return (p.styles || []).find((s) => s.name === name) || null; }
function currentPrice(p, style) {
  if (p.styles) { const s = styleObj(p, style); return s ? s.price : p.styles[0].price; }
  return p.salePrice != null ? p.salePrice : p.price;
}
function minPrice(p) {
  if (p.styles) return Math.min.apply(null, p.styles.map((s) => s.price));
  return p.salePrice != null ? p.salePrice : p.price;
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

function openProductModal(id) {
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p) return;
  modalState = { style: (p.styles && p.styles[0].name) || null, color: p.colors[0] || null, size: p.sizes[0] || null, qty: 1, slide: 0 };

  document.getElementById("modal-content").innerHTML = `
    <div class="pd-carousel" id="pd-carousel"></div>
    <div class="pd-sku">SKU: ${p.sku}</div>
    <h3 class="pd-name">${p.name}</h3>
    <div class="pd-price" id="pd-price"></div>
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
          ${p.colors.map((c) => `<button class="pd-option${c === modalState.color ? " selected" : ""}${colorStock(p, modalState.style, c) <= 0 ? " soldout" : ""}" data-color="${c}">${c}</button>`).join("")}
        </div>
      </div>` : ""}
    ${p.sizes.length ? `
      <div class="pd-field">
        <label>Size</label>
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
    <button class="btn btn-gold btn-full" id="add-to-cart-btn">Add to Bag</button>
  `;

  renderCarousel(p);

  function refreshAvailability() {
    document.querySelectorAll("#pd-sizes .pd-option").forEach((b) => {
      b.classList.toggle("soldout", variantStock(p, modalState.style, modalState.color, b.dataset.size) <= 0);
    });
    document.querySelectorAll("#pd-colors .pd-option").forEach((b) => {
      b.classList.toggle("soldout", colorStock(p, modalState.style, b.dataset.color) <= 0);
    });
    const priceEl = document.getElementById("pd-price");
    if (priceEl) priceEl.textContent = `$${currentPrice(p, modalState.style).toFixed(2)}`;
    const avail = variantStock(p, modalState.style, modalState.color, modalState.size);
    const addBtn = document.getElementById("add-to-cart-btn");
    const qtyVal = document.getElementById("qty-value");
    if (avail <= 0) {
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
    if (variantStock(p, modalState.style, modalState.color, modalState.size) <= 0) return;
    addToCart({
      productId: p.id,
      sku: p.sku,
      name: p.styles ? `${p.name} (${modalState.style})` : p.name,
      price: currentPrice(p, modalState.style),
      image: productImageForColor(p, modalState.color, modalState.size, modalState.style),
      color: modalState.color,
      size: modalState.size,
      qty: modalState.qty,
    });
    closeModal("product-modal");
  });

  refreshAvailability();
  document.getElementById("product-modal").setAttribute("aria-hidden", "false");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.setAttribute("aria-hidden", "true");
}

const modalCloseBtn = document.getElementById("modal-close");
if (modalCloseBtn) modalCloseBtn.addEventListener("click", () => closeModal("product-modal"));

// ---------- Cart drawer wiring ----------
const cartToggleBtn = document.getElementById("cart-toggle");
const cartCloseBtn = document.getElementById("cart-close");
const cartBackdropEl = document.getElementById("cart-backdrop");
if (cartToggleBtn) cartToggleBtn.addEventListener("click", openCart);
if (cartCloseBtn) cartCloseBtn.addEventListener("click", closeCart);
if (cartBackdropEl) cartBackdropEl.addEventListener("click", closeCart);

// ---------- Promo codes ----------
let promoState = typeof getSavedPromo === "function" ? getSavedPromo() : null;

function applyPromoCode(rawCode) {
  const messageEl = document.getElementById("promo-message");
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
    if (messageEl) { messageEl.textContent = `Code applied — ${PROMO_CODES[code].label}.`; messageEl.classList.remove("promo-error"); }
  } else {
    promoState = null;
    if (messageEl) { messageEl.textContent = "That code isn't valid."; messageEl.classList.add("promo-error"); }
  }
  renderCheckoutSummary();
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

function renderCheckoutSummary() {
  const summary = document.getElementById("checkout-summary");
  if (!summary) return;
  const cart = getCart();
  const subtotal = cartSubtotal(cart);
  const discountFraction = promoState && typeof PROMO_CODES !== "undefined" && PROMO_CODES[promoState] ? PROMO_CODES[promoState].discount : 0;
  const discountAmount = subtotal * discountFraction;
  const total = subtotal - discountAmount;

  let rows = cart
    .map((item) => {
      const meta = [item.color, item.size].filter(Boolean).join(" / ");
      return `<div class="checkout-summary-row"><span>${item.name}${meta ? " (" + meta + ")" : ""} &times;${item.qty}</span><span>$${(item.price * item.qty).toFixed(2)}</span></div>`;
    })
    .join("");

  rows += `<div class="checkout-summary-row" style="border-top:1px solid #2a2a2a;margin-top:8px;padding-top:8px;"><span>Subtotal</span><span>$${subtotal.toFixed(2)}</span></div>`;

  if (discountFraction > 0) {
    rows += `<div class="checkout-summary-row" style="color:var(--gold);"><span>Promo (${promoState})</span><span>&minus;$${discountAmount.toFixed(2)}</span></div>`;
  }

  rows += `<div class="checkout-summary-row" style="font-weight:700;"><span>Total</span><span>$${total.toFixed(2)}</span></div>`;

  summary.innerHTML = rows;
}

function getCheckoutFields() {
  return {
    email: document.getElementById("checkout-email").value.trim(),
    name: document.getElementById("checkout-name").value.trim(),
    address: document.getElementById("checkout-address").value.trim(),
    city: document.getElementById("checkout-city").value.trim(),
  };
}

function validateCheckoutFields(fields) {
  return fields.email && fields.name && fields.address && fields.city;
}

// The three payment functions below call your deployed serverless functions
// (see netlify/functions/). Each returns a hosted checkout URL to redirect to.
document.querySelectorAll(".pay-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const method = btn.dataset.method;
    const fields = getCheckoutFields();
    const errorEl = document.getElementById("checkout-error");
    const loadingEl = document.getElementById("checkout-loading");
    errorEl.textContent = "";

    if (!validateCheckoutFields(fields)) {
      errorEl.textContent = "Please fill in all fields before checking out.";
      return;
    }

    const cart = getCart();
    if (cart.length === 0) {
      errorEl.textContent = "Your bag is empty.";
      return;
    }

    const optinEl = document.getElementById("checkout-optin");
    if (optinEl && optinEl.checked && fields.email && typeof submitEmail === "function") {
      submitEmail(fields.email, "checkout");
    }

    loadingEl.hidden = false;

    const endpoint =
      method === "stripe"
        ? "/.netlify/functions/create-stripe-session"
        : method === "paypal"
        ? "/.netlify/functions/create-paypal-order"
        : "/.netlify/functions/create-coinbase-charge";

    const discountFraction = promoState && typeof PROMO_CODES !== "undefined" && PROMO_CODES[promoState] ? PROMO_CODES[promoState].discount : 0;
    const cartToCharge = discountFraction > 0
      ? cart.map((item) => ({ ...item, price: Math.round(item.price * (1 - discountFraction) * 100) / 100 }))
      : cart;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cart: cartToCharge, customer: fields, promoCode: promoState || null }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Checkout could not be started.");
      }
      // Save the cart+order id locally in case you want to show an order history later.
      window.location.href = data.url;
    } catch (err) {
      loadingEl.hidden = true;
      errorEl.textContent =
        "Checkout isn't wired up yet on this deployment — add your API keys per the README, then this button will work. (" +
        err.message +
        ")";
    }
  });
});

// ---------- Init ----------
renderProductGrid();
if (typeof renderCart === "function") renderCart();
