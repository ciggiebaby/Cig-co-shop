(function initializeCheckoutFingerprint(root, factory) {
  const api = factory(root);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.CIGCheckoutFingerprint = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function checkoutFingerprintFactory(root) {
  const FINGERPRINT_PREFIX = "v1:";
  const CANONICAL_VERSION = "cigco-stripe-cart-v1";

  function normalizeRequiredString(value, fieldName) {
    if (typeof value !== "string" || !value.trim()) {
      throw new TypeError(`${fieldName} must be a non-empty string.`);
    }
    return value.trim();
  }

  function normalizeOptionalString(value, fieldName) {
    if (value == null || value === "") return null;
    if (typeof value !== "string") {
      throw new TypeError(`${fieldName} must be a string when provided.`);
    }
    return value.trim() || null;
  }

  function normalizeQuantity(value) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new TypeError("Quantity must be a positive safe integer.");
    }
    return value;
  }

  function normalizePromoCode(value) {
    if (value == null || value === "") return null;
    if (typeof value !== "string") {
      throw new TypeError("Promo code must be a string when provided.");
    }
    return value.trim().toUpperCase() || null;
  }

  function compareVariantTuples(left, right) {
    for (let index = 0; index < 4; index += 1) {
      if (left[index] === right[index]) continue;
      if (left[index] === null) return -1;
      if (right[index] === null) return 1;
      return left[index] < right[index] ? -1 : 1;
    }
    return 0;
  }

  function canonicalizeCheckoutCart(items, promoCode) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new TypeError("Checkout items must be a non-empty array.");
    }

    const variants = new Map();
    items.forEach((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new TypeError("Each checkout item must be an object.");
      }

      const productId = normalizeRequiredString(item.productId, "Product ID");
      const color = normalizeOptionalString(item.color, "Color");
      const size = normalizeOptionalString(item.size, "Size");
      const style = normalizeOptionalString(item.style, "Style");
      const quantity = normalizeQuantity(item.quantity);
      const identity = [productId, color, size, style];
      const key = JSON.stringify(identity);
      const existing = variants.get(key);

      if (existing) {
        const aggregatedQuantity = existing[4] + quantity;
        if (!Number.isSafeInteger(aggregatedQuantity)) {
          throw new TypeError("Aggregated quantity exceeds the safe integer range.");
        }
        existing[4] = aggregatedQuantity;
      } else {
        variants.set(key, [...identity, quantity]);
      }
    });

    const sortedVariantTuples = Array.from(variants.values()).sort(
      compareVariantTuples,
    );

    return [
      CANONICAL_VERSION,
      normalizePromoCode(promoCode),
      sortedVariantTuples,
    ];
  }

  function serializeCheckoutCart(items, promoCode) {
    return JSON.stringify(canonicalizeCheckoutCart(items, promoCode));
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  }

  async function sha256Hex(value) {
    if (typeof module !== "undefined" && module.exports) {
      const { createHash } = require("node:crypto");
      return createHash("sha256").update(value, "utf8").digest("hex");
    }

    if (
      !root.crypto ||
      !root.crypto.subtle ||
      typeof root.crypto.subtle.digest !== "function" ||
      typeof root.TextEncoder !== "function"
    ) {
      throw new Error(
        "Checkout fingerprinting requires browser Web Crypto support.",
      );
    }

    const encoded = new root.TextEncoder().encode(value);
    const digest = await root.crypto.subtle.digest("SHA-256", encoded);
    return bytesToHex(new Uint8Array(digest));
  }

  async function createCheckoutFingerprint(items, promoCode) {
    const serialized = serializeCheckoutCart(items, promoCode);
    return `${FINGERPRINT_PREFIX}${await sha256Hex(serialized)}`;
  }

  return {
    canonicalizeCheckoutCart,
    createCheckoutFingerprint,
    serializeCheckoutCart,
  };
});
