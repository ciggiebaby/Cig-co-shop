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
    const name = style ? `${product.name} (${style})` : product.name;
    if (item.name === name && (!style || item.style === style)) return item;
    changed = true;
    return style ? { ...item, name, style } : { ...item, name };
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

function lineKey(item) {
  return [item.productId, item.color || "", item.size || "", itemStyleKey(item)].join("::");
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
        const meta = [item.color, item.size].filter(Boolean).join(" / ");
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
