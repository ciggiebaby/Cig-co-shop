// promo.js ships with no active codes. Tests that exercise the discount math
// register these sample codes in-process (each test file runs on its own).
const { PROMO_CODES } = require("../promo.js");

Object.assign(PROMO_CODES, {
  CIG5: { discount: 0.05, label: "5% off" },
  CIG10: { discount: 0.10, label: "10% off" },
  CIG20: { discount: 0.20, label: "20% off" },
});

module.exports = { PROMO_CODES };
