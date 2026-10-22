// Public, read-only live counts for backstock items (products.js liveStock),
// so the site can show "Sold out". Cached briefly at the edge.
const { createStockStore } = require("../lib/live-stock.js");
const { PRODUCTS } = require("../../products.js");

function createHandler({ stockStoreFactory = createStockStore, logger = console } = {}) {
  return async (event) => {
    if (event.httpMethod !== "GET") return { statusCode: 405, body: "Method Not Allowed" };
    const live = new Set(PRODUCTS.filter((p) => p.liveStock && !p.hidden).map((p) => p.id));
    try {
      const rows = await stockStoreFactory().getStock();
      const items = rows
        .filter((r) => live.has(r.product_id))
        .map((r) => ({ productId: r.product_id, color: r.color, size: r.size, quantity: Math.max(0, Number(r.quantity) || 0) }));
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=20" },
        body: JSON.stringify({ items }),
      };
    } catch (error) {
      logger.error("Live stock read failed.", { error: error && (error.code || error.name) });
      return { statusCode: 503, headers: { "Cache-Control": "no-store" }, body: JSON.stringify({ error: "Stock is unavailable." }) };
    }
  };
}

const handler = createHandler();
module.exports = { createHandler, handler };
