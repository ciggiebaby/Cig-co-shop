// Simple localStorage-backed cart.
// Line item shape: { productId, name, price, image, color, size, qty, sku }

const CART_KEY = "cig_co_cart_v1";

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCart();
}

function lineKey(item) {
  return [item.productId, item.color || "", item.size || ""].join("::");
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
