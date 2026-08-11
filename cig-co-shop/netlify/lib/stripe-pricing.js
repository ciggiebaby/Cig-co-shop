const { PRODUCTS } = require("../../products.js");
const { PROMO_CODES } = require("../../promo.js");

const MAX_CART_LINES = 50;
const MAX_QUANTITY_PER_VARIANT = 99;
const MAX_TOTAL_QUANTITY = 200;

class PricingValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "PricingValidationError";
  }
}

function validationError(message) {
  throw new PricingValidationError(message);
}

function normalizeRequiredString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    validationError(`${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

function normalizeOptionalString(value, fieldName) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    validationError(`${fieldName} must be a string when provided.`);
  }
  const normalized = value.trim();
  return normalized || null;
}

function validateSelection(product, fieldName, rawValue, allowedValues) {
  const value = normalizeOptionalString(rawValue, fieldName);
  if (allowedValues.length === 0) {
    if (value !== null) {
      validationError(`${product.id} does not support ${fieldName}.`);
    }
    return null;
  }
  if (value === null) {
    validationError(`${fieldName} is required for product ${product.id}.`);
  }
  if (!allowedValues.includes(value)) {
    validationError(`Invalid ${fieldName} for product ${product.id}.`);
  }
  return value;
}

function validateQuantity(value) {
  if (!Number.isInteger(value) || value < 1) {
    validationError("Quantity must be a positive integer.");
  }
  if (value > MAX_QUANTITY_PER_VARIANT) {
    validationError(`Quantity cannot exceed ${MAX_QUANTITY_PER_VARIANT} per variant.`);
  }
  return value;
}

function priceToCents(value, productId) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid price configuration for product ${productId}.`);
  }
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`Price is outside the supported range for product ${productId}.`);
  }
  return cents;
}

function variantStock(product, style, color, size) {
  if (product.componentStock) {
    const selectedStyle = (product.styles || []).find((entry) => entry.name === style);
    const requirements = selectedStyle && selectedStyle.components;
    const colorComponents = product.componentStock[color];
    if (!requirements || !colorComponents) return 0;
    const availability = Object.entries(requirements).map(([component, required]) => {
      const inStock = colorComponents[component];
      if (!Number.isInteger(required) || required < 1 || !Number.isInteger(inStock) || inStock < 0) {
        throw new Error(`Invalid component stock configuration for product ${product.id}.`);
      }
      return Math.floor(inStock / required);
    });
    return availability.length ? Math.min(...availability) : 0;
  }
  if (!product.stock) return Infinity;

  let stock = product.stock;
  if (product.styles && product.styles.length) stock = stock[style];
  if (stock != null && product.colors.length) stock = stock[color];
  if (stock != null && product.sizes.length) stock = stock[size];

  if (stock == null) return 0;
  if (!Number.isInteger(stock) || stock < 0) {
    throw new Error(`Invalid stock configuration for product ${product.id}.`);
  }
  return stock;
}

function normalizePromoCode(rawCode) {
  if (rawCode == null || rawCode === "") return null;
  if (typeof rawCode !== "string") {
    validationError("Promo code must be a string.");
  }

  const code = rawCode.trim().toUpperCase();
  if (!code) return null;

  const promo = PROMO_CODES[code];
  if (!promo) validationError("Promo code is not valid.");
  if (typeof promo.discount !== "number" || !Number.isFinite(promo.discount) || promo.discount < 0 || promo.discount >= 1) {
    throw new Error(`Invalid discount configuration for promo code ${code}.`);
  }

  const discountBasisPoints = Math.round(promo.discount * 10000);
  return { code, discountBasisPoints };
}

function discountedUnitAmount(unitAmount, promo) {
  if (!promo) return unitAmount;
  return Math.round((unitAmount * (10000 - promo.discountBasisPoints)) / 10000);
}

function resolveRequestedItem(rawItem) {
  if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
    validationError("Each cart item must be an object.");
  }

  const productId = normalizeRequiredString(rawItem.productId, "Product ID");
  const product = PRODUCTS.find((entry) => entry.id === productId);
  if (!product) validationError(`Unknown product ID: ${productId}.`);
  if (product.comingSoon) validationError(`Product ${productId} is not available for purchase.`);

  const styles = product.styles || [];
  const style = validateSelection(product, "style", rawItem.style, styles.map((entry) => entry.name));
  const color = validateSelection(product, "color", rawItem.color, product.colors || []);
  const size = validateSelection(product, "size", rawItem.size, product.sizes || []);
  const quantity = validateQuantity(rawItem.quantity);

  const selectedStyle = style ? styles.find((entry) => entry.name === style) : null;
  const catalogPrice = selectedStyle
    ? selectedStyle.price
    : product.salePrice != null
    ? product.salePrice
    : product.price;
  const unitAmount = priceToCents(catalogPrice, productId);
  const availableStock = variantStock(product, style, color, size);
  const componentRequirements = product.componentStock && selectedStyle
    ? selectedStyle.components
    : null;
  const componentAvailability = componentRequirements
    ? product.componentStock[color]
    : null;
  const productName = selectedStyle ? `${product.name} (${selectedStyle.name})` : product.name;
  const stripeName = [productName, color, size].filter(Boolean).join(" — ");

  return {
    key: JSON.stringify([productId, style, color, size]),
    productId,
    style,
    color,
    size,
    quantity,
    unitAmount,
    availableStock,
    componentRequirements,
    componentAvailability,
    stripeName,
  };
}

function priceCartForStripe(rawItems, rawPromoCode) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    validationError("Cart must contain at least one item.");
  }
  if (rawItems.length > MAX_CART_LINES) {
    validationError(`Cart cannot contain more than ${MAX_CART_LINES} lines.`);
  }

  const promo = normalizePromoCode(rawPromoCode);
  const variants = new Map();
  let totalQuantity = 0;

  rawItems.forEach((rawItem) => {
    const resolved = resolveRequestedItem(rawItem);
    totalQuantity += resolved.quantity;
    if (totalQuantity > MAX_TOTAL_QUANTITY) {
      validationError(`Cart quantity cannot exceed ${MAX_TOTAL_QUANTITY} items.`);
    }

    const existing = variants.get(resolved.key);
    if (existing) {
      existing.quantity += resolved.quantity;
      if (existing.quantity > MAX_QUANTITY_PER_VARIANT) {
        validationError(`Quantity cannot exceed ${MAX_QUANTITY_PER_VARIANT} per variant.`);
      }
    } else {
      variants.set(resolved.key, resolved);
    }
  });

  const resolvedItems = Array.from(variants.values());
  const componentUsage = new Map();
  resolvedItems.forEach((item) => {
    if (!item.componentRequirements) return;
    Object.entries(item.componentRequirements).forEach(([component, required]) => {
      const key = JSON.stringify([item.productId, item.color, component]);
      const used = (componentUsage.get(key) || 0) + required * item.quantity;
      componentUsage.set(key, used);
      if (used > item.componentAvailability[component]) {
        validationError(`Requested quantity is unavailable for product ${item.productId}.`);
      }
    });
  });

  let subtotalCents = 0;
  let totalCents = 0;
  const lineItems = resolvedItems.map((item) => {
    if (item.quantity > item.availableStock) {
      validationError(`Requested quantity is unavailable for product ${item.productId}.`);
    }

    const chargedUnitAmount = discountedUnitAmount(item.unitAmount, promo);
    subtotalCents += item.unitAmount * item.quantity;
    totalCents += chargedUnitAmount * item.quantity;

    return {
      price_data: {
        currency: "usd",
        product_data: { name: item.stripeName },
        unit_amount: chargedUnitAmount,
      },
      quantity: item.quantity,
    };
  });

  if (!Number.isSafeInteger(subtotalCents) || !Number.isSafeInteger(totalCents)) {
    throw new Error("Cart total is outside the supported range.");
  }

  return {
    lineItems,
    promoCode: promo ? promo.code : null,
    subtotalCents,
    discountCents: subtotalCents - totalCents,
    totalCents,
  };
}

module.exports = {
  MAX_CART_LINES,
  MAX_QUANTITY_PER_VARIANT,
  MAX_TOTAL_QUANTITY,
  PricingValidationError,
  normalizePromoCode,
  priceCartForStripe,
};
