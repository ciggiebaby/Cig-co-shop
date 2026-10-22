// Test-only catalog entries. The old in-house pillow case (0003) and the
// coming-soon puffer jacket (0009) were taken off the site 10/22, but many
// checkout tests used them as a simple in-stock / coming-soon product. These
// stand-ins carry the same shape and prices and only exist inside the test
// process (each test file runs in its own process).
const catalog = require("../products.js");

const TEST_PILLOW = {
  id: "TEST-PILLOW",
  sku: "TEST-PILLOW",
  stock: { "Red": 67, "Blue": 58, "Purple": 67, "Teal": 74, "Black": 0 },
  name: "Test Pillow Case",
  shipping: "pillow", // US only
  price: 20.00,
  salePrice: 10.00,
  image: "",
  colors: ["Red", "Blue", "Purple", "Teal", "Black"],
  sizes: [],
  colorImages: {},
};

const TEST_COMING_SOON = {
  id: "TEST-COMING-SOON",
  sku: "TEST-COMING-SOON",
  comingSoon: true,
  name: "Test Coming Soon Jacket",
  price: 150.00,
  salePrice: null,
  image: "",
  colors: ["Blue"],
  sizes: [],
  colorImages: {},
};

for (const p of [TEST_PILLOW, TEST_COMING_SOON]) {
  if (!catalog.PRODUCTS.some((x) => x.id === p.id)) catalog.PRODUCTS.push(p);
}

module.exports = { TEST_PILLOW, TEST_COMING_SOON };
