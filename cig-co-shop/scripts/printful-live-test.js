// Live check of the Printful order logic against the real Printful API.
// Creates a DRAFT order (never confirmed, nothing is charged) for an all-over-print
// hoodie with a placeholder image, checks a retry reuses it, then cancels it
// (Printful keeps a "canceled" record; nothing is printed or charged).
// Usage: PRINTFUL_API_TOKEN=... [PRINTFUL_STORE_ID=...] node scripts/printful-live-test.js
const assert = require("node:assert/strict");
const { PRODUCTS } = require("../products.js");
const { createPrintfulClient, printfulItemForLine } = require("../netlify/lib/printful.js");

const PLACEHOLDER_URL = "https://cigcompany.com/assets/og-fw26.jpg";
const AOP_HOODIE_M = 10871; // Printful catalog: All-Over Print Unisex Hoodie (M)

async function main() {
  const product = {
    id: "live-test-pod",
    name: "Live Test Paisley Hoodie",
    colors: [],
    sizes: ["M"],
    pod: {
      files: ["default", "back", "sleeve_left", "sleeve_right"].map((type) => ({ type, url: PLACEHOLDER_URL })),
      options: { stitch_color: "black" },
      variants: { "M": AOP_HOODIE_M },
    },
  };
  PRODUCTS.push(product);

  const environment = { ...process.env, PRINTFUL_AUTO_CONFIRM: "false" };
  const client = createPrintfulClient({ environment });
  const paymentId = `test_${Date.now()}`;
  const order = {
    paymentId,
    recipient: {
      name: "Test Customer",
      address1: "19749 Dearborn St",
      city: "Chatsworth",
      state_code: "CA",
      country_code: "US",
      zip: "91311",
      email: "test@example.com",
    },
    items: [printfulItemForLine({ productId: product.id, size: "M", quantity: 1, retailPrice: "65.00" })],
    confirm: false,
  };

  let created;
  try {
    created = await client.createOrder(order);
    console.log("created:", created.created, "id:", created.order.id, "status:", created.order.status,
      "external_id:", created.order.external_id, "costs:", JSON.stringify(created.order.costs));
    assert.equal(created.created, true);
    assert.equal(created.order.status, "draft");
    assert.equal(created.order.external_id, paymentId);

    const retry = await client.createOrder(order);
    console.log("retry created:", retry.created, "id:", retry.order.id);
    assert.equal(retry.created, false);
    assert.equal(retry.order.id, created.order.id);

    let duplicateRejected = false;
    try {
      const dup = await client.request("POST", "/orders?confirm=false", {
        external_id: paymentId, recipient: order.recipient, items: order.items,
      });
      await client.cancelOrder(dup.id);
    } catch (error) {
      duplicateRejected = true;
      console.log("direct duplicate POST rejected by Printful:", error.status, error.message);
    }
    assert.equal(duplicateRejected, true);
  } finally {
    if (created) {
      const cancelled = await client.cancelOrder(created.order.id);
      console.log("cancelled draft:", created.order.id, "status:", cancelled && cancelled.status);
      const after = await client.getOrderByExternalId(paymentId);
      console.log("lookup after delete:", after ? after.status : "not found");
    }
    PRODUCTS.splice(PRODUCTS.indexOf(product), 1);
  }
  console.log("Printful live test passed.");
}

main().catch((error) => {
  console.error("Printful live test failed:", error.message);
  process.exit(1);
});
