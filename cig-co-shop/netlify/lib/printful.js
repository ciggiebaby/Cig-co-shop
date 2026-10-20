// Printful print-on-demand helpers: maps paid cart lines to Printful order items
// and creates the Printful order (as a draft unless PRINTFUL_AUTO_CONFIRM=true).
// Requires env var: PRINTFUL_API_TOKEN (Printful > Settings > API / Developers)
// Optional: PRINTFUL_STORE_ID, PRINTFUL_AUTO_CONFIRM, PRINTFUL_API_BASE
const crypto = require("node:crypto");
const { PRODUCTS } = require("../../products.js");

const DEFAULT_PRINTFUL_API_BASE = "https://api.printful.com";
const MAX_EXTERNAL_ID_LENGTH = 32;

class PrintfulError extends Error {
  constructor(message, { status = null, code = null } = {}) {
    super(message);
    this.name = "PrintfulError";
    this.status = status;
    this.code = code;
  }
}

// products.js `pod.variants` keys: the buyer's selections joined with " / "
// (style, then color, then size), or "default" for a product with no options.
function podVariantKey({ style, color, size } = {}) {
  return [style, color, size].filter(Boolean).join(" / ") || "default";
}

function findPodProduct(productId) {
  const product = PRODUCTS.find((entry) => entry.id === productId);
  return product && product.pod ? product : null;
}

function isPodProduct(productId) {
  return !!findPodProduct(productId);
}

// Returns the Printful order item for one paid line, or throws if products.js
// doesn't map this selection to a Printful variant.
function printfulItemForLine({ productId, style, color, size, quantity, retailPrice }) {
  const product = findPodProduct(productId);
  if (!product) {
    throw new PrintfulError(`Product ${productId} is not print-on-demand.`);
  }
  const key = podVariantKey({ style, color, size });
  const mapping = product.pod.variants && product.pod.variants[key];
  if (mapping == null) {
    throw new PrintfulError(`No Printful variant mapped for product ${productId} (${key}).`);
  }

  const item = {
    quantity,
    name: [product.name, style, color, size].filter(Boolean).join(" — "),
  };
  if (typeof retailPrice === "string") item.retail_price = retailPrice;

  if (typeof mapping === "object" && Number.isInteger(mapping.syncVariantId)) {
    // A product designed and saved inside Printful — the design lives there.
    item.sync_variant_id = mapping.syncVariantId;
    return item;
  }

  const variantId = typeof mapping === "object" ? mapping.variantId : mapping;
  const files = (typeof mapping === "object" && mapping.files) || product.pod.files;
  if (!Number.isInteger(variantId)) {
    throw new PrintfulError(`Invalid Printful variant for product ${productId} (${key}).`);
  }
  if (!Array.isArray(files) || files.length === 0) {
    throw new PrintfulError(`No design files configured for product ${productId}.`);
  }
  item.variant_id = variantId;
  item.files = files.map((file) => ({ type: file.type || "default", url: file.url }));
  // Some products need extra options, e.g. { stitch_color: "black" } on all-over prints.
  const options = (typeof mapping === "object" && mapping.options) || product.pod.options;
  if (options) {
    item.options = Object.entries(options).map(([id, value]) => ({ id, value }));
  }
  return item;
}

// Printful external_id must be short; Stripe PaymentIntent ids fit (pi_…).
function printfulExternalId(paymentId) {
  const id = String(paymentId || "");
  if (!id) throw new PrintfulError("A payment id is required.");
  if (id.length <= MAX_EXTERNAL_ID_LENGTH && /^[A-Za-z0-9_-]+$/.test(id)) return id;
  return `h_${crypto.createHash("sha256").update(id).digest("hex").slice(0, MAX_EXTERNAL_ID_LENGTH - 2)}`;
}

function autoConfirmEnabled(environment = process.env) {
  return String(environment.PRINTFUL_AUTO_CONFIRM || "").trim().toLowerCase() === "true";
}

function createPrintfulClient({
  environment = process.env,
  fetchImpl = fetch,
} = {}) {
  const token = environment.PRINTFUL_API_TOKEN;
  const base = (environment.PRINTFUL_API_BASE || DEFAULT_PRINTFUL_API_BASE).replace(/\/+$/, "");

  async function request(method, path, body) {
    if (!token) throw new PrintfulError("PRINTFUL_API_TOKEN is not configured.");
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    if (environment.PRINTFUL_STORE_ID) headers["X-PF-Store-Id"] = String(environment.PRINTFUL_STORE_ID);

    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const message = (data && data.error && data.error.message)
        || (data && typeof data.result === "string" && data.result)
        || `Printful request failed (${res.status}).`;
      throw new PrintfulError(message, { status: res.status, code: data && data.code });
    }
    return data ? data.result : null;
  }

  async function getOrderByExternalId(externalId) {
    try {
      return await request("GET", `/orders/@${encodeURIComponent(externalId)}`);
    } catch (error) {
      if (error instanceof PrintfulError && error.status === 404) return null;
      throw error;
    }
  }

  // Idempotent: the payment id is the Printful external_id, so a retried or
  // duplicated webhook finds the existing order instead of creating another.
  async function createOrder({ paymentId, recipient, items, confirm = autoConfirmEnabled(environment) }) {
    const externalId = printfulExternalId(paymentId);
    const existing = await getOrderByExternalId(externalId);
    if (existing) return { order: existing, created: false };

    try {
      const order = await request("POST", `/orders?confirm=${confirm ? "true" : "false"}`, {
        external_id: externalId,
        shipping: "STANDARD",
        recipient,
        items,
      });
      return { order, created: true };
    } catch (error) {
      // A concurrent delivery may have created it between the lookup and here.
      const raced = await getOrderByExternalId(externalId).catch(() => null);
      if (raced) return { order: raced, created: false };
      throw error;
    }
  }

  function cancelOrder(orderId) {
    return request("DELETE", `/orders/${encodeURIComponent(orderId)}`);
  }

  return { request, getOrderByExternalId, createOrder, cancelOrder };
}

module.exports = {
  PrintfulError,
  autoConfirmEnabled,
  createPrintfulClient,
  findPodProduct,
  isPodProduct,
  podVariantKey,
  printfulExternalId,
  printfulItemForLine,
};
