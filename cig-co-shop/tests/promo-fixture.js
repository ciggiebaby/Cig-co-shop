// promo.js ships with no active codes. Tests that exercise the discount math
// register these sample codes in-process (each test file runs on its own).
const { PROMO_CODES } = require("../promo.js");

Object.assign(PROMO_CODES, {
  CIG5: { discount: 0.05, label: "5% off" },
  CIG10: { discount: 0.10, label: "10% off" },
  CIG20: { discount: 0.20, label: "20% off" },
});

// Promos are masks only (promo.js). The legacy fixture products these tests
// price (TEST-PILLOW, 0011) stand in for masks here so the code/cents
// mechanics stay covered; tests/masks-only-promo.test.js covers the real rule.
const { PROMO_ELIGIBLE_PRODUCT_IDS, MASK_PROMO_PRICE_FLOOR_USD } = require("../promo.js");
for (const id of ["TEST-PILLOW", "0011"]) {
  if (!PROMO_ELIGIBLE_PRODUCT_IDS.includes(id)) PROMO_ELIGIBLE_PRODUCT_IDS.push(id);
  MASK_PROMO_PRICE_FLOOR_USD[id] = 0.01;
}

module.exports = { PROMO_CODES };
