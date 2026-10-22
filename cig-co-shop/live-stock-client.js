// Live backstock counts (balaclava, ski mask, moto mask: products.js
// `liveStock: true`). On load, fetch the counts from Supabase via
// /.netlify/functions/stock and swap them into each product's `stock`, so the
// grid and product page show "Sold out" the moment a variant hits 0. If the
// request fails, the static counts in products.js stay (checkout still checks
// the live count on the server).

// items: [{ productId, color, size, quantity }]. Returns the ids it updated.
function applyLiveStock(products, items) {
  const updated = [];
  if (!Array.isArray(items)) return updated;
  for (const p of products) {
    if (!p.liveStock) continue;
    const rows = items.filter((r) => r && r.productId === p.id);
    if (!rows.length) continue;
    const count = (color, size) => {
      const row = rows.find((r) => (r.color || "") === (color || "") && (r.size || "") === (size || ""));
      return row ? Math.max(0, Number(row.quantity) || 0) : 0;
    };
    const stock = {};
    for (const color of p.colors) {
      if (p.sizes && p.sizes.length) {
        stock[color] = {};
        for (const size of p.sizes) stock[color][size] = count(color, size);
      } else {
        stock[color] = count(color, "");
      }
    }
    p.stock = stock;
    updated.push(p.id);
  }
  return updated;
}

function loadLiveStock({ products = typeof PRODUCTS !== "undefined" ? PRODUCTS : [], fetchImpl = typeof fetch === "function" ? fetch : null, onUpdate = null } = {}) {
  if (!fetchImpl || !products.some((p) => p.liveStock && !p.hidden)) return Promise.resolve([]);
  return fetchImpl("/.netlify/functions/stock", { headers: { Accept: "application/json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const updated = data ? applyLiveStock(products, data.items) : [];
      if (updated.length && typeof onUpdate === "function") onUpdate(updated);
      return updated;
    })
    .catch(() => []);
}

if (typeof document !== "undefined" && document.getElementById && typeof PRODUCTS !== "undefined") {
  loadLiveStock({ onUpdate: () => { if (typeof renderProductGrid === "function") renderProductGrid(); } });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { applyLiveStock, loadLiveStock };
}
