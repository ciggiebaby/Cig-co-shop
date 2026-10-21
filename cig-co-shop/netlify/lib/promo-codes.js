// Resolves a checkout promo code: static codes from promo.js, or a unique
// Arcade code checked in Supabase (must be unused, unexpired, and belong to
// the checkout email). Arcade codes are marked used when the order is recorded.
const { isArcadeCode } = require("../../promo.js");
const { createCustomerStore } = require("./customer-store.js");
const { PricingValidationError, normalizePromoCode } = require("./stripe-pricing.js");

const ARCADE_CODE_MESSAGES = {
  not_found: "Promo code is not valid.",
  used: "This code has already been used.",
  expired: "This code has expired.",
  wrong_email: "This code only works with the email that won it.",
};

// Returns { code, discountBasisPoints } or null. Throws PricingValidationError.
// At checkout (requireOwner) an Arcade code must match the checkout email; the
// storefront's Apply button checks the code without an email.
async function resolvePromo({
  promoCode,
  email = null,
  requireOwner = true,
  storeFactory = createCustomerStore,
}) {
  if (promoCode == null || promoCode === "") return null;
  if (typeof promoCode !== "string") {
    throw new PricingValidationError("Promo code must be a string.");
  }
  const code = promoCode.trim().toUpperCase();
  if (!code) return null;
  if (!isArcadeCode(code)) return normalizePromoCode(code);
  if (requireOwner && !email) {
    throw new PricingValidationError("Enter the email you played the Arcade with to use this code.");
  }

  const result = await storeFactory().checkArcadeCode(code, requireOwner ? email : null);
  if (!result || result.valid !== true) {
    throw new PricingValidationError(
      ARCADE_CODE_MESSAGES[result && result.reason] || ARCADE_CODE_MESSAGES.not_found,
    );
  }
  return { code, discountBasisPoints: result.discountBasisPoints };
}

module.exports = { ARCADE_CODE_MESSAGES, resolvePromo };
