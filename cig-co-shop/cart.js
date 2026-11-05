// Simple localStorage-backed cart.
// Line item shape: { productId, name, price, image, color, size, style, qty, sku }

const CART_KEY = "cig_co_cart_v1";

function readStoredCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(CART_KEY));
    return Array.isArray(cart) ? cart : [];
  } catch (e) {
    return [];
  }
}

// A bag saved before a product was taken off the site (e.g. the old pillow
// case and puffer jacket) still holds those lines. Drop anything that isn't
// a live, listed product so checkout never sees it.
// Same for products CIG marked sold out as a whole (soldOut: true); checkout
// refuses those server-side too. Saved names are refreshed from the catalog so
// a renamed product shows its current name in the bag and checkout summary.
function getCart() {
  const cart = readStoredCart();
  if (typeof PRODUCTS === "undefined" || !Array.isArray(PRODUCTS)) return cart;
  const byId = new Map(PRODUCTS.filter((p) => !p.hidden && !p.soldOut).map((p) => [p.id, p]));
  let changed = false;
  const kept = cart.filter((item) => item && byId.has(item.productId)).map((item) => {
    const product = byId.get(item.productId);
    const style = product.styles && product.styles.length ? itemStyleKey(item) : "";
    const name = style && !product.bundle ? `${product.name} (${style})` : product.name;
    // Products with a (timed) sale price: refresh the saved price from the
    // catalog, so a bag filled during the sale shows full price once it ends
    // (and vice versa), matching what the server charges.
    const price = typeof product.salePrice === "number" && typeof currentPrice === "function"
      ? currentPrice(product, style || null, item.color || null, item.size || null)
      : item.price;
    if (item.name === name && (!style || item.style === style) && item.price === price) return item;
    changed = true;
    return style ? { ...item, name, style, price } : { ...item, name, price };
  });
  if (changed || kept.length !== cart.length) localStorage.setItem(CART_KEY, JSON.stringify(kept));
  return kept;
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCart();
}

function itemStyleKey(item) {
  if (item.style) return item.style;
  // Legacy carts embedded the selected style in "Product Name (Style)".
  const legacyStyle = typeof item.name === "string" ? item.name.match(/\s\(([^()]*)\)$/) : null;
  return legacyStyle ? legacyStyle[1] : "";
}

// Crossbody + MagSafe bundle line: "Crossbody Navy · MagSafe Burgundy / iPhone 16 Pro".
function bundleCartMeta(item) {
  const product = typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)
    ? PRODUCTS.find((p) => p.id === item.productId) : null;
  if (!product || !product.bundle) return "";
  return `Crossbody ${item.color || ""} \u00b7 MagSafe ${itemStyleKey(item)} / ${item.size || ""}`;
}

function lineKey(item) {
  return [item.productId, item.color || "", item.size || "", itemStyleKey(item)].join("::");
}

// Site-visit events (site-visits.js). Never throws, so tracking can't break the bag.
function trackSiteEvent(event, productId) {
  try {
    if (typeof cigTrack === "function") cigTrack(event, productId);
  } catch {}
}

function addToCart(item) {
  const cart = getCart();
  const key = lineKey(item);
  const existing = cart.find((c) => lineKey(c) === key);
  if (existing) {
    existing.qty += item.qty;
  } else {
    cart.push(item);
  }
  saveCart(cart);
  trackSiteEvent("add_to_bag", item.productId);
  openCart();
}

function removeFromCart(key) {
  const cart = getCart().filter((c) => lineKey(c) !== key);
  saveCart(cart);
}

function cartSubtotal(cart) {
  return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function renderCart() {
  const cart = getCart();
  const countEl = document.getElementById("cart-count");
  const itemsEl = document.getElementById("cart-items");
  const subtotalEl = document.getElementById("cart-subtotal-amount");
  if (!countEl || !itemsEl || !subtotalEl) return;

  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  countEl.textContent = totalQty;

  if (cart.length === 0) {
    itemsEl.innerHTML = '<p class="cart-empty">Your bag is empty.</p>';
  } else {
    itemsEl.innerHTML = cart
      .map((item) => {
        const key = lineKey(item);
        const meta = bundleCartMeta(item) || [item.color, item.size].filter(Boolean).join(" / ");
        return `
        <div class="cart-item">
          <img src="${item.image}" alt="${item.name}" />
          <div class="cart-item-info">
            <div class="cart-item-name">${item.name}</div>
            ${meta ? `<div class="cart-item-meta">${meta}</div>` : ""}
            <div class="cart-item-meta">Qty ${item.qty} &times; $${item.price.toFixed(2)}</div>
            <button class="cart-item-remove" data-key="${key}">Remove</button>
          </div>
        </div>`;
      })
      .join("");

    itemsEl.querySelectorAll(".cart-item-remove").forEach((btn) => {
      btn.addEventListener("click", () => removeFromCart(btn.dataset.key));
    });
  }

  subtotalEl.textContent = `$${cartSubtotal(cart).toFixed(2)}`;
  renderCartTotals(cart);
  renderBundleOffer(cart);
}

// ---------- Shipping + total in the bag ----------
// US shipping comes from shipping-rates.js (quoteShipping), the same table the
// checkout and the server use. The bag only shows the US figure, labelled US;
// international shipping is quoted in the checkout form once a country is picked.
// Pages that don't load shipping-rates.js just show the subtotal.
function cartUsShippingCents(cart) {
  if (typeof quoteShipping !== "function" || typeof PRODUCTS === "undefined") return null;
  const lines = cart.map((item) => {
    const product = PRODUCTS.find((p) => p.id === item.productId);
    return {
      name: product ? product.name : item.name,
      shipping: product && typeof product.shipping === "string" ? product.shipping : null,
      quantity: item.qty,
      mask: !!(product && product.liveStock),
      inHand: !!(product && (product.liveStock || (!product.pod && typeof product.shipping !== "string"))),
      weightOz: product && typeof product.shipWeightOz === "number" ? product.shipWeightOz : null,
    };
  });
  const merchandiseCents = cart.reduce((sum, item) => sum + Math.round(Number(item.price) * 100) * item.qty, 0);
  const quote = quoteShipping(lines, "US", { merchandiseCents });
  return quote && Number.isInteger(quote.shippingCents) ? quote.shippingCents : null;
}

function setHidden(el, hidden) {
  if (!el) return;
  el.hidden = hidden;
}

function renderCartTotals(cart) {
  const shipRow = document.getElementById("cart-shipping-row");
  const shipAmount = document.getElementById("cart-shipping-amount");
  const totalRow = document.getElementById("cart-total-row");
  const totalAmount = document.getElementById("cart-total-amount");
  const note = document.getElementById("cart-ship-note");
  const shippingCents = cart.length ? cartUsShippingCents(cart) : null;
  const show = shippingCents !== null;
  if (show) {
    const subtotalCents = Math.round(cartSubtotal(cart) * 100);
    if (shipAmount) shipAmount.textContent = shippingCents === 0 ? "Free (US)" : `$${(shippingCents / 100).toFixed(2)} (US)`;
    if (totalAmount) totalAmount.textContent = `$${((subtotalCents + shippingCents) / 100).toFixed(2)}`;
  }
  setHidden(shipRow, !show);
  setHidden(totalRow, !show);
  setHidden(note, !show);
}

// ---------- Crossbody + MagSafe bundle offer ----------
// A MagSafe Case (FW26-CASE) in the bag without a Crossbody: offer to swap one
// case for the existing FW26-BUNDLE product (products.js, PR #33), keeping the
// case color + phone model. Only solid Crossbody colors: the bundle never
// includes the Multi colorway (sales rule), so Multi is never offered here.
// Savings and the extra cost come from the catalog prices, not fixed numbers.
const BUNDLE_OFFER_EXCLUDED_COLORS = ["Multi"];

function bundleOffer(cart) {
  if (typeof PRODUCTS === "undefined" || !Array.isArray(PRODUCTS)) return null;
  const bundle = PRODUCTS.find((p) => p.id === "FW26-BUNDLE" && p.bundle && !p.hidden && !p.soldOut);
  const bag = PRODUCTS.find((p) => p.id === "FW26-BAG");
  if (!bundle || !bag) return null;
  if (typeof addBlockedByDrop === "function" && addBlockedByDrop(bundle)) return null;
  if (cart.some((item) => item.productId === "FW26-BAG" || item.productId === "FW26-BUNDLE")) return null;
  const sizes = bundle.sizes || [];
  const styles = (bundle.styles || []).map((s) => s.name);
  const caseItem = cart.find((item) => item.productId === "FW26-CASE" && styles.includes(item.color) && sizes.includes(item.size));
  if (!caseItem) return null;
  const colors = (bundle.colors || []).filter((c) => !BUNDLE_OFFER_EXCLUDED_COLORS.includes(c)
    && !(bag.colorPrices && bag.colorPrices[c] != null));
  if (!colors.length) return null;
  const crossbodyColor = colors.includes(bundle.defaultColor) ? bundle.defaultColor : colors[0];
  const extra = Math.round((bundle.price - caseItem.price) * 100) / 100;
  const savings = Math.round((bag.price + caseItem.price - bundle.price) * 100) / 100;
  if (!(extra > 0) || !(savings > 0)) return null;
  return { bundle, caseItem, caseKey: lineKey(caseItem), colors, crossbodyColor, extra, savings };
}

function bundleLineFromCase(caseItem, bundle, crossbodyColor) {
  const image = typeof productImageForColor === "function"
    ? productImageForColor(bundle, crossbodyColor, caseItem.size, caseItem.color)
    : (bundle.colorImages && bundle.colorImages[crossbodyColor]) || bundle.image;
  return {
    productId: bundle.id,
    sku: bundle.sku,
    name: bundle.name,
    price: bundle.price,
    image: typeof image === "string" && image ? image : bundle.image,
    color: crossbodyColor,
    size: caseItem.size,
    style: caseItem.color,
    qty: 1,
  };
}

// Swap one MagSafe Case for the bundle. Returns true when the bag changed.
function switchCaseToBundle(caseKey, crossbodyColor) {
  const cart = getCart();
  const offer = bundleOffer(cart);
  if (!offer || offer.caseKey !== caseKey || !offer.colors.includes(crossbodyColor)) return false;
  const caseItem = cart.find((item) => lineKey(item) === caseKey);
  const line = bundleLineFromCase(caseItem, offer.bundle, crossbodyColor);
  const next = caseItem.qty > 1
    ? cart.map((item) => (item === caseItem ? { ...item, qty: item.qty - 1 } : item))
    : cart.filter((item) => item !== caseItem);
  next.push(line);
  saveCart(next);
  trackSiteEvent("add_to_bag", line.productId);
  return true;
}

function escapeCartText(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderBundleOffer(cart) {
  const el = document.getElementById("cart-bundle-offer");
  if (!el) return;
  const offer = cart.length ? bundleOffer(cart) : null;
  if (!offer) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  const money = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
  const options = offer.colors
    .map((c) => `<option value="${escapeCartText(c)}"${c === offer.crossbodyColor ? " selected" : ""}>${escapeCartText(c)}</option>`)
    .join("");
  el.innerHTML = `
    <p class="cart-bundle-title">Add the Crossbody for ${money(offer.extra)} more</p>
    <p class="cart-bundle-copy">Switch to the ${escapeCartText(offer.bundle.name)} for ${money(offer.bundle.price)} and save ${money(offer.savings)}. Keeps your ${escapeCartText(offer.caseItem.color)} case for ${escapeCartText(offer.caseItem.size)}.</p>
    <div class="cart-bundle-actions">
      <label class="cart-bundle-color">Crossbody
        <select id="cart-bundle-color" aria-label="Crossbody color">${options}</select>
      </label>
      <button type="button" id="cart-bundle-switch" class="btn btn-full cart-bundle-btn">Switch to bundle &middot; ${money(offer.bundle.price)}</button>
    </div>`;
  el.hidden = false;
  const btn = el.querySelector("#cart-bundle-switch");
  const select = el.querySelector("#cart-bundle-color");
  if (btn) btn.addEventListener("click", () => switchCaseToBundle(offer.caseKey, select ? select.value : offer.crossbodyColor));
}

function openCart() {
  const drawer = document.getElementById("cart-drawer");
  const backdrop = document.getElementById("cart-backdrop");
  if (drawer) drawer.classList.add("open");
  if (backdrop) backdrop.classList.add("open");
}

function closeCart() {
  const drawer = document.getElementById("cart-drawer");
  const backdrop = document.getElementById("cart-backdrop");
  if (drawer) drawer.classList.remove("open");
  if (backdrop) backdrop.classList.remove("open");
}
