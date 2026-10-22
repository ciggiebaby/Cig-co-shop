// Live stock for backstock items marked `liveStock: true` in products.js
// (balaclava 0005, ski mask 0008, moto mask 0013). Counts live in Supabase
// (public.live_stock, see supabase/migrations/202610220001_live_stock.sql).
//
// - Checkout creation (Stripe, PayPal): refuse if a line asks for more than
//   the live count (assertLiveStock). Carts with no live-stock items never
//   touch Supabase.
// - Payment confirmed (stripe-webhook, PayPal capture/webhook): decrement once
//   per order (commitOrderStock). The order key ("stripe:<session>",
//   "paypal:<order>") makes replays a no-op. If two buyers pay for the last
//   unit at the same moment the count floors at 0 and the order is logged as
//   oversold so CIG can refund it.
// - The site reads counts from /.netlify/functions/stock to show "Sold out".
// Print-on-demand (Printful) items are never tracked here.
const { createSupabaseClient } = require("./supabase.js");
const { RequestValidationError } = require("./customer-utils.js");

class LiveStockUnavailableError extends Error {
  constructor() {
    super("We couldn't check stock right now. Please try again in a moment.");
    this.name = "LiveStockUnavailableError";
  }
}

function createStockStore(client = createSupabaseClient()) {
  return {
    async getStock() {
      const rows = await client.rpc("cigco_get_live_stock", {});
      return Array.isArray(rows) ? rows : [];
    },
    commitOrder(orderKey, lines) {
      return client.rpc("cigco_commit_stock_order", {
        p_order_key: orderKey,
        p_lines: lines.map((l) => ({ product_id: l.productId, color: l.color || "", size: l.size || "", quantity: l.quantity })),
      });
    },
  };
}

const stockKey = (productId, color, size) => JSON.stringify([productId, color || "", size || ""]);

function stockMap(rows) {
  const map = new Map();
  for (const row of rows) map.set(stockKey(row.product_id, row.color, row.size), Number(row.quantity) || 0);
  return map;
}

function describe(line) {
  return [line.productId, line.color, line.size].filter(Boolean).join(" ");
}

async function assertLiveStock(stockLines, { stockStoreFactory = createStockStore, logger = console } = {}) {
  if (!Array.isArray(stockLines) || stockLines.length === 0) return;
  let counts;
  try {
    counts = stockMap(await stockStoreFactory().getStock());
  } catch (error) {
    logger.error("Live stock lookup failed.", { error: error && (error.code || error.name) });
    throw new LiveStockUnavailableError();
  }
  for (const line of stockLines) {
    const left = counts.get(stockKey(line.productId, line.color, line.size)) || 0;
    if (line.quantity > left) {
      throw new RequestValidationError(
        left > 0
          ? `Only ${left} left of ${describe(line)}. Lower the quantity and try again.`
          : `${describe(line)} just sold out. Remove it from your bag to check out.`,
      );
    }
  }
}

// Stripe metadata values max out at 500 chars, so lines are packed into
// stock_0, stock_1, … as "productId|color|size|qty;…".
const STOCK_META_PREFIX = "stock_";
function encodeStockMetadata(stockLines) {
  const metadata = {};
  if (!stockLines || !stockLines.length) return metadata;
  let chunk = "";
  let index = 0;
  for (const line of stockLines) {
    const part = [line.productId, line.color || "", line.size || "", line.quantity].join("|");
    if (chunk && chunk.length + 1 + part.length > 500) {
      metadata[`${STOCK_META_PREFIX}${index++}`] = chunk;
      chunk = "";
    }
    chunk = chunk ? `${chunk};${part}` : part;
  }
  metadata[`${STOCK_META_PREFIX}${index}`] = chunk;
  return metadata;
}

function parseStockPart(part) {
  const [productId, color, size, qty] = part.split("|");
  const quantity = Number(qty);
  if (!productId || !Number.isInteger(quantity) || quantity < 1) return null;
  return { productId, color: color || "", size: size || "", quantity };
}

function decodeStockMetadata(metadata) {
  if (!metadata) return [];
  return Object.keys(metadata)
    .filter((k) => k.startsWith(STOCK_META_PREFIX))
    .sort((a, b) => Number(a.slice(STOCK_META_PREFIX.length)) - Number(b.slice(STOCK_META_PREFIX.length)))
    .flatMap((k) => String(metadata[k] || "").split(";").map(parseStockPart).filter(Boolean));
}

// PayPal: live-stock lines carry their variant in the item sku.
const PAYPAL_SKU_PREFIX = "stock:";
function payPalStockSku(line) {
  return `${PAYPAL_SKU_PREFIX}${[line.productId, line.color || "", line.size || ""].join("|")}`.slice(0, 127);
}
function payPalStockLines(order) {
  const unit = order && order.purchase_units && order.purchase_units[0];
  const items = (unit && Array.isArray(unit.items)) ? unit.items : [];
  return items
    .filter((item) => typeof item.sku === "string" && item.sku.startsWith(PAYPAL_SKU_PREFIX))
    .map((item) => parseStockPart(`${item.sku.slice(PAYPAL_SKU_PREFIX.length)}|${Number(item.quantity) || 1}`))
    .filter(Boolean);
}

async function commitOrderStock(orderKey, lines, { stockStoreFactory = createStockStore, logger = console } = {}) {
  if (!lines || !lines.length) return { applied: false, skipped: true };
  const result = (await stockStoreFactory().commitOrder(orderKey, lines)) || {};
  if (Array.isArray(result.oversold) && result.oversold.length) {
    logger.error("Order oversold backstock; refund or contact the buyer.", { order: orderKey, oversold: result.oversold });
  }
  return result;
}

module.exports = {
  LiveStockUnavailableError,
  assertLiveStock,
  commitOrderStock,
  createStockStore,
  decodeStockMetadata,
  encodeStockMetadata,
  payPalStockLines,
  payPalStockSku,
  stockKey,
};
