// The FW26/27 pieces that can ship internationally aren't in products.js yet,
// so tests register stand-ins with those shipping classes in-process.
const { PRODUCTS } = require("../products.js");

const FIXTURE_PRODUCTS = [
  { id: "T-BAG", sku: "T-BAG", name: "Test Crossbody Bag", shipping: "bag", price: 45, image: "", colors: [], sizes: [] },
  { id: "T-CASE", sku: "T-CASE", name: "Test MagSafe Case", shipping: "case", price: 30, image: "", colors: [], sizes: [] },
  { id: "T-SLEEVE", sku: "T-SLEEVE", name: "Test Laptop Sleeve", shipping: "sleeve", price: 35, image: "", colors: [], sizes: [] },
];

FIXTURE_PRODUCTS.forEach((product) => {
  if (!PRODUCTS.some((entry) => entry.id === product.id)) PRODUCTS.push(product);
});

module.exports = { FIXTURE_PRODUCTS };
