// CIG & CO. — product catalog
// Edit this file to add/remove/update backstock. Each product needs a unique id.
// image: put your real product photo in /assets/products/ and reference it here.
// colors/sizes are optional — leave the array empty ([]) if a product has none.
//
// hidden: true  — backstock you hold off-site. The product never renders in the
//   shop grid and the server refuses to price it, so it can't be bought online.
//   Keep it here anyway so all inventory lives in one file. Flip to false (or
//   delete the line) when you're ready to put it on the site.
//
// shipping: the product's shipping class from shipping-rates.js
//   ("bag", "case", "sleeve", or "pillow"). Only bag/case/sleeve can ship
//   internationally; pillows and products with no class ship to the US only.
//   International: CA, GB, DE, AU, JP, KR (rates in shipping-rates.js). For a
//   MagSafe case, add to its description: "Japan & South Korea: allow ~30 days."
//   (checkout also shows this automatically).
//
// pod: { ... } — print-on-demand (made to order by Printful, no stock to track).
//   Leave out `stock` so it never sells out. Paid card orders are sent to
//   Printful automatically (see "Print-on-demand (Printful)" in README.md).
//   Each `variants` key is the buyer's choices joined with " / " — style, then
//   color, then size (e.g. "Black / M"), or "default" if the product has none.
//   The value is either a Printful catalog variant id (printed with `files`)
//   or { syncVariantId: 123 } for a product already designed inside Printful.
//   `options` is only needed for products Printful requires it on (all-over prints).
//
//   pod: {
//     files: [{ type: "default", url: "https://cigcompany.com/assets/pod/paisley-hoodie.png" }],
//     options: { stitch_color: "black" },
//     variants: { "M": 10871, "L": 10872, "XL": { syncVariantId: 1234567890 } },
//   },
//
// Per-option prices (optional): colorPrices: { "Multi": 75 } and/or
//   sizePrices: { "15″": 55 } override `price` for that color/size (size wins
//   over color). The site and the server both use them. Styles keep their own
//   price as before.
// description: short line shown on the product sheet.
// sizeLabel: label for the size picker (default "Size"; the case uses "Model").
// colorSwatches: { color: image URL } — small swatch image on each color button
//   (clicking a color also swaps the product photo via colorImages).
// colorHex: { color: "#rrggbb" } — plain color dot on the button instead of a
//   swatch image.
// photoComingSoon: [color, ...] — colors without a real photo yet: the product
//   view shows a small "Photo coming soon" note while one is selected (point
//   its colorImages entry at a neutral "photo coming soon" image, never another color's photo).
//
// POD_CARD_ONLY (bottom of this file): false since CIG turned PayPal on for the
//   FW26 collection (10/22): made-to-order items take card or PayPal, and paid
//   PayPal orders become Printful drafts like Stripe ones. Set it to true to go
//   back to card only. Crypto never takes made-to-order items.
//
// CRYPTO_ENABLED (bottom of this file): crypto checkout (Coinbase Commerce,
//   20% off) on/off. While false, the "Pay with Crypto" button and every
//   20%-off crypto message are hidden site-wide, and the server refuses
//   crypto checkouts. To turn it on: set COINBASE_COMMERCE_API_KEY and
//   COINBASE_COMMERCE_WEBHOOK_SECRET on Netlify, flip this to true, deploy.

// FW26/27 drop lock. Products with `dropAt: DROP_AT` show on the site with a
// "Drops Oct 30" badge but can't be added to the bag or checked out before this
// time (the server refuses them too), so merging early doesn't open the drop.
// Drop time confirmed by CIG 2026-10-21: Fri Oct 30, 12:00 PM ET (-04:00 = EDT).
// Test order before launch: see DROP_TEST_CODE in README / netlify/lib/drop-lock.js.
const DROP_AT = "2026-10-30T12:00:00-04:00";

const PRODUCTS = [
  // ---------- FW26/27 drop (made to order by Printful, store 18936848) ----------
  // One site product per item type; each color (and size/model) maps to its own
  // Printful sync variant. Images are Printful mockups until CIG's photos land.
  // Inventory + ids: /workspace/fw26-inventory.md
  {
    id: "FW26-BAG",
    sku: "FW26-BAG",
    dropAt: DROP_AT,
    name: "Crossbody Bag",
    shipping: "bag",
    // Approved by CIG: solids $65, Multi $75.
    price: 65.00,
    salePrice: null,
    colorPrices: { "Multi": 75.00 },
    description: "Made to order.",
    // Card photo and the color preselected when the product opens (CIG 10/22).
    defaultColor: "Navy",
    image: "assets/products/fw26/crossbody_navy_front.webp",
    colors: ["Black", "Burgundy", "Navy", "Hunter", "Grape", "Gold", "Burnt Orange", "Espresso", "Multi"],
    sizes: [],
    // 2000px Printful Mockup Generator renders, web-optimized to 1600px WebP.
    colorImages: {
      "Black": "assets/products/fw26/crossbody_black_front.webp",
      "Burgundy": "assets/products/fw26/crossbody_burgundy_front.webp",
      "Navy": "assets/products/fw26/crossbody_navy_front.webp",
      "Hunter": "assets/products/fw26/crossbody_hunter_front.webp",
      "Grape": "assets/products/fw26/crossbody_grape_front.webp",
      "Gold": "assets/products/fw26/crossbody_gold_front.webp",
      "Burnt Orange": "assets/products/fw26/crossbody_burnt-orange_front.webp",
      "Espresso": "assets/products/fw26/crossbody_espresso_front.webp",
      "Multi": "assets/products/fw26/crossbody_multi_front.webp",
    },
    gallery: {
      "Black": ["assets/products/fw26/crossbody_black_right.webp", "assets/products/fw26/crossbody_black_left.webp", "assets/products/fw26/crossbody_black_back.webp"],
      "Burgundy": ["assets/products/fw26/crossbody_burgundy_right.webp", "assets/products/fw26/crossbody_burgundy_left.webp", "assets/products/fw26/crossbody_burgundy_back.webp"],
      "Navy": ["assets/products/fw26/crossbody_navy_right.webp", "assets/products/fw26/crossbody_navy_left.webp", "assets/products/fw26/crossbody_navy_back.webp"],
      "Hunter": ["assets/products/fw26/crossbody_hunter_right.webp", "assets/products/fw26/crossbody_hunter_left.webp", "assets/products/fw26/crossbody_hunter_back.webp"],
      "Grape": ["assets/products/fw26/crossbody_grape_right.webp", "assets/products/fw26/crossbody_grape_left.webp", "assets/products/fw26/crossbody_grape_back.webp"],
      "Gold": ["assets/products/fw26/crossbody_gold_right.webp", "assets/products/fw26/crossbody_gold_left.webp", "assets/products/fw26/crossbody_gold_back.webp"],
      "Burnt Orange": ["assets/products/fw26/crossbody_burnt-orange_right.webp", "assets/products/fw26/crossbody_burnt-orange_left.webp", "assets/products/fw26/crossbody_burnt-orange_back.webp"],
      "Espresso": ["assets/products/fw26/crossbody_espresso_right.webp", "assets/products/fw26/crossbody_espresso_left.webp", "assets/products/fw26/crossbody_espresso_back.webp"],
      "Multi": ["assets/products/fw26/crossbody_multi_right.webp", "assets/products/fw26/crossbody_multi_left.webp", "assets/products/fw26/crossbody_multi_back.webp"],
    },
    colorSwatches: {
      "Black": "https://files.cdn.printful.com/files/c1e/c1ec429471b12203f307781760d3d862_thumb.png",
      "Burgundy": "https://files.cdn.printful.com/files/f74/f74238283ae61a408e6308b8375ac52e_thumb.png",
      "Navy": "https://files.cdn.printful.com/files/e11/e11ff4fcad42fa3cdb56b5d6650aa04d_thumb.png",
      "Hunter": "https://files.cdn.printful.com/files/27e/27ed074cbadcc3220cfe0d6fca28b471_thumb.png",
      "Grape": "https://files.cdn.printful.com/files/6bf/6bf59f6ed229c1cca6d85f3f91b694ae_thumb.png",
      "Gold": "https://files.cdn.printful.com/files/d38/d38370793971808f55f5748b18e35326_thumb.png",
      "Burnt Orange": "https://files.cdn.printful.com/files/3f6/3f6722b47380bb65ba0244cd01a98e06_thumb.png",
      "Espresso": "https://files.cdn.printful.com/files/3b9/3b9066c63624c96ec4d31060bc2cfaa2_thumb.png",
      "Multi": "assets/products/fw26/crossbody_multi_swatch.webp",
    },
    pod: {
      variants: {
        "Black": { syncVariantId: 5586102158 }, // sync product 483549179
        "Burgundy": { syncVariantId: 5586100744 }, // sync product 483548633
        "Navy": { syncVariantId: 5586097945 }, // sync product 483547700
        "Hunter": { syncVariantId: 5586109178 }, // sync product 483551001
        "Grape": { syncVariantId: 5586102822 }, // sync product 483549269
        "Gold": { syncVariantId: 5586103627 }, // sync product 483549496
        "Burnt Orange": { syncVariantId: 5586106870 }, // sync product 483550614
        "Espresso": { syncVariantId: 5586104580 }, // sync product 483549750
        "Multi": { syncVariantId: 5586110183 }, // sync product 483551157
      },
    },
  },
  {
    id: "FW26-CASE",
    sku: "FW26-CASE",
    dropAt: DROP_AT,
    // Prices approved by CIG 10/21: $40 every model.
    name: "MagSafe Case",
    shipping: "case",
    price: 40.00,
    sizeLabel: "Model",
    salePrice: null,
    description: "Made to order. MagSafe compatible. Shipping to Japan & South Korea takes about 30 days.",
    // Card photo and the color preselected when the product opens (CIG 10/22).
    defaultColor: "Burgundy",
    image: "assets/products/fw26/case_burgundy.webp",
    colors: ["Black", "Burgundy", "Navy", "Hunter", "Grape", "Gold", "Burnt Orange", "Espresso"],
    sizes: ["iPhone 14", "iPhone 14 Plus", "iPhone 14 Pro", "iPhone 14 Pro Max", "iPhone 15", "iPhone 15 Plus", "iPhone 15 Pro", "iPhone 15 Pro Max", "iPhone 16", "iPhone 16 Plus", "iPhone 16 Pro", "iPhone 16 Pro Max", "iPhone 17", "iPhone 17 Air", "iPhone 17 Pro", "iPhone 17 Pro Max", "iPhone 18 Pro", "iPhone 18 Pro Max"],
    // 2000px Printful Mockup Generator renders, web-optimized to 1600px WebP.
    colorImages: {
      "Black": "assets/products/fw26/case_black.webp",
      "Burgundy": "assets/products/fw26/case_burgundy.webp",
      "Navy": "assets/products/fw26/case_navy.webp",
      "Hunter": "assets/products/fw26/case_hunter.webp",
      "Grape": "assets/products/fw26/case_grape.webp",
      "Gold": "assets/products/fw26/case_gold.webp",
      "Burnt Orange": "assets/products/fw26/case_burnt-orange.webp",
      "Espresso": "assets/products/fw26/case_espresso.webp",
    },
    colorSwatches: {
      "Black": "https://files.cdn.printful.com/files/cfe/cfe92b997631c49642cb842a6d911845_thumb.png",
      "Burgundy": "https://files.cdn.printful.com/files/395/395cf528ebb0aaa6fd2530acb087be93_thumb.png",
      "Navy": "https://files.cdn.printful.com/files/aaf/aaf5dc8b3ce809705c31300180485796_thumb.png",
      "Hunter": "https://files.cdn.printful.com/files/e0d/e0d531ea691480972949b2cf4cc48408_thumb.png",
      "Grape": "assets/products/fw26/case_grape_swatch.webp",
      "Gold": "https://files.cdn.printful.com/files/1eb/1ebae1c742f2720d10cee784f36fb174_thumb.png",
      "Burnt Orange": "https://files.cdn.printful.com/files/a14/a147f44c0b9475e0f8e6f9a69ca691b5_thumb.png",
      "Espresso": "assets/products/fw26/case_espresso_swatch.webp",
    },
    pod: {
      variants: {
        // Black: sync product 483543365
        "Black / iPhone 14": { syncVariantId: 5586083593 },
        "Black / iPhone 14 Plus": { syncVariantId: 5586083594 },
        "Black / iPhone 14 Pro": { syncVariantId: 5586083595 },
        "Black / iPhone 14 Pro Max": { syncVariantId: 5586083596 },
        "Black / iPhone 15": { syncVariantId: 5586083597 },
        "Black / iPhone 15 Plus": { syncVariantId: 5586083598 },
        "Black / iPhone 15 Pro": { syncVariantId: 5586083599 },
        "Black / iPhone 15 Pro Max": { syncVariantId: 5586083600 },
        "Black / iPhone 16": { syncVariantId: 5586083601 },
        "Black / iPhone 16 Plus": { syncVariantId: 5586083602 },
        "Black / iPhone 16 Pro": { syncVariantId: 5586083603 },
        "Black / iPhone 16 Pro Max": { syncVariantId: 5586083604 },
        "Black / iPhone 17": { syncVariantId: 5586083605 },
        "Black / iPhone 17 Air": { syncVariantId: 5586083606 },
        "Black / iPhone 17 Pro": { syncVariantId: 5586083607 },
        "Black / iPhone 17 Pro Max": { syncVariantId: 5586083608 },
        "Black / iPhone 18 Pro": { syncVariantId: 5586083609 },
        "Black / iPhone 18 Pro Max": { syncVariantId: 5586083610 },
        // Burgundy: sync product 483542130
        "Burgundy / iPhone 14": { syncVariantId: 5586080273 },
        "Burgundy / iPhone 14 Plus": { syncVariantId: 5586080274 },
        "Burgundy / iPhone 14 Pro": { syncVariantId: 5586080275 },
        "Burgundy / iPhone 14 Pro Max": { syncVariantId: 5586080276 },
        "Burgundy / iPhone 15": { syncVariantId: 5586080277 },
        "Burgundy / iPhone 15 Plus": { syncVariantId: 5586080278 },
        "Burgundy / iPhone 15 Pro": { syncVariantId: 5586080279 },
        "Burgundy / iPhone 15 Pro Max": { syncVariantId: 5586080280 },
        "Burgundy / iPhone 16": { syncVariantId: 5586080281 },
        "Burgundy / iPhone 16 Plus": { syncVariantId: 5586080282 },
        "Burgundy / iPhone 16 Pro": { syncVariantId: 5586080283 },
        "Burgundy / iPhone 16 Pro Max": { syncVariantId: 5586080284 },
        "Burgundy / iPhone 17": { syncVariantId: 5586080285 },
        "Burgundy / iPhone 17 Air": { syncVariantId: 5586080286 },
        "Burgundy / iPhone 17 Pro": { syncVariantId: 5586080287 },
        "Burgundy / iPhone 17 Pro Max": { syncVariantId: 5586080288 },
        "Burgundy / iPhone 18 Pro": { syncVariantId: 5586080289 },
        "Burgundy / iPhone 18 Pro Max": { syncVariantId: 5586080290 },
        // Navy: sync product 483542908
        "Navy / iPhone 14": { syncVariantId: 5586082391 },
        "Navy / iPhone 14 Plus": { syncVariantId: 5586082392 },
        "Navy / iPhone 14 Pro": { syncVariantId: 5586082393 },
        "Navy / iPhone 14 Pro Max": { syncVariantId: 5586082394 },
        "Navy / iPhone 15": { syncVariantId: 5586082395 },
        "Navy / iPhone 15 Plus": { syncVariantId: 5586082397 },
        "Navy / iPhone 15 Pro": { syncVariantId: 5586082398 },
        "Navy / iPhone 15 Pro Max": { syncVariantId: 5586082399 },
        "Navy / iPhone 16": { syncVariantId: 5586082400 },
        "Navy / iPhone 16 Plus": { syncVariantId: 5586082401 },
        "Navy / iPhone 16 Pro": { syncVariantId: 5586082402 },
        "Navy / iPhone 16 Pro Max": { syncVariantId: 5586082403 },
        "Navy / iPhone 17": { syncVariantId: 5586082404 },
        "Navy / iPhone 17 Air": { syncVariantId: 5586082405 },
        "Navy / iPhone 17 Pro": { syncVariantId: 5586082406 },
        "Navy / iPhone 17 Pro Max": { syncVariantId: 5586082407 },
        "Navy / iPhone 18 Pro": { syncVariantId: 5586082408 },
        "Navy / iPhone 18 Pro Max": { syncVariantId: 5586082409 },
        // Hunter: sync product 483543754
        "Hunter / iPhone 14": { syncVariantId: 5586085104 },
        "Hunter / iPhone 14 Plus": { syncVariantId: 5586085105 },
        "Hunter / iPhone 14 Pro": { syncVariantId: 5586085107 },
        "Hunter / iPhone 14 Pro Max": { syncVariantId: 5586085111 },
        "Hunter / iPhone 15": { syncVariantId: 5586085112 },
        "Hunter / iPhone 15 Plus": { syncVariantId: 5586085114 },
        "Hunter / iPhone 15 Pro": { syncVariantId: 5586085115 },
        "Hunter / iPhone 15 Pro Max": { syncVariantId: 5586085116 },
        "Hunter / iPhone 16": { syncVariantId: 5586085117 },
        "Hunter / iPhone 16 Plus": { syncVariantId: 5586085118 },
        "Hunter / iPhone 16 Pro": { syncVariantId: 5586085119 },
        "Hunter / iPhone 16 Pro Max": { syncVariantId: 5586085120 },
        "Hunter / iPhone 17": { syncVariantId: 5586085121 },
        "Hunter / iPhone 17 Air": { syncVariantId: 5586085122 },
        "Hunter / iPhone 17 Pro": { syncVariantId: 5586085123 },
        "Hunter / iPhone 17 Pro Max": { syncVariantId: 5586085125 },
        "Hunter / iPhone 18 Pro": { syncVariantId: 5586085126 },
        "Hunter / iPhone 18 Pro Max": { syncVariantId: 5586085129 },
        // Grape: sync product 483544433
        "Grape / iPhone 14": { syncVariantId: 5586086617 },
        "Grape / iPhone 14 Plus": { syncVariantId: 5586086619 },
        "Grape / iPhone 14 Pro": { syncVariantId: 5586086621 },
        "Grape / iPhone 14 Pro Max": { syncVariantId: 5586086622 },
        "Grape / iPhone 15": { syncVariantId: 5586086624 },
        "Grape / iPhone 15 Plus": { syncVariantId: 5586086625 },
        "Grape / iPhone 15 Pro": { syncVariantId: 5586086627 },
        "Grape / iPhone 15 Pro Max": { syncVariantId: 5586086628 },
        "Grape / iPhone 16": { syncVariantId: 5586086630 },
        "Grape / iPhone 16 Plus": { syncVariantId: 5586086632 },
        "Grape / iPhone 16 Pro": { syncVariantId: 5586086633 },
        "Grape / iPhone 16 Pro Max": { syncVariantId: 5586086634 },
        "Grape / iPhone 17": { syncVariantId: 5586086635 },
        "Grape / iPhone 17 Air": { syncVariantId: 5586086636 },
        "Grape / iPhone 17 Pro": { syncVariantId: 5586086637 },
        "Grape / iPhone 17 Pro Max": { syncVariantId: 5586086638 },
        "Grape / iPhone 18 Pro": { syncVariantId: 5586086639 },
        "Grape / iPhone 18 Pro Max": { syncVariantId: 5586086640 },
        // Gold: sync product 483545240
        "Gold / iPhone 14": { syncVariantId: 5586088838 },
        "Gold / iPhone 14 Plus": { syncVariantId: 5586088839 },
        "Gold / iPhone 14 Pro": { syncVariantId: 5586088840 },
        "Gold / iPhone 14 Pro Max": { syncVariantId: 5586088841 },
        "Gold / iPhone 15": { syncVariantId: 5586088842 },
        "Gold / iPhone 15 Plus": { syncVariantId: 5586088843 },
        "Gold / iPhone 15 Pro": { syncVariantId: 5586088844 },
        "Gold / iPhone 15 Pro Max": { syncVariantId: 5586088845 },
        "Gold / iPhone 16": { syncVariantId: 5586088846 },
        "Gold / iPhone 16 Plus": { syncVariantId: 5586088847 },
        "Gold / iPhone 16 Pro": { syncVariantId: 5586088848 },
        "Gold / iPhone 16 Pro Max": { syncVariantId: 5586088849 },
        "Gold / iPhone 17": { syncVariantId: 5586088850 },
        "Gold / iPhone 17 Air": { syncVariantId: 5586088851 },
        "Gold / iPhone 17 Pro": { syncVariantId: 5586088852 },
        "Gold / iPhone 17 Pro Max": { syncVariantId: 5586088853 },
        "Gold / iPhone 18 Pro": { syncVariantId: 5586088854 },
        "Gold / iPhone 18 Pro Max": { syncVariantId: 5586088855 },
        // Burnt Orange: sync product 483544889
        "Burnt Orange / iPhone 14": { syncVariantId: 5586087697 },
        "Burnt Orange / iPhone 14 Plus": { syncVariantId: 5586087698 },
        "Burnt Orange / iPhone 14 Pro": { syncVariantId: 5586087699 },
        "Burnt Orange / iPhone 14 Pro Max": { syncVariantId: 5586087700 },
        "Burnt Orange / iPhone 15": { syncVariantId: 5586087701 },
        "Burnt Orange / iPhone 15 Plus": { syncVariantId: 5586087702 },
        "Burnt Orange / iPhone 15 Pro": { syncVariantId: 5586087703 },
        "Burnt Orange / iPhone 15 Pro Max": { syncVariantId: 5586087704 },
        "Burnt Orange / iPhone 16": { syncVariantId: 5586087705 },
        "Burnt Orange / iPhone 16 Plus": { syncVariantId: 5586087706 },
        "Burnt Orange / iPhone 16 Pro": { syncVariantId: 5586087707 },
        "Burnt Orange / iPhone 16 Pro Max": { syncVariantId: 5586087708 },
        "Burnt Orange / iPhone 17": { syncVariantId: 5586087709 },
        "Burnt Orange / iPhone 17 Air": { syncVariantId: 5586087710 },
        "Burnt Orange / iPhone 17 Pro": { syncVariantId: 5586087711 },
        "Burnt Orange / iPhone 17 Pro Max": { syncVariantId: 5586087712 },
        "Burnt Orange / iPhone 18 Pro": { syncVariantId: 5586087713 },
        "Burnt Orange / iPhone 18 Pro Max": { syncVariantId: 5586087714 },
        // Espresso: sync product 483545530
        "Espresso / iPhone 14": { syncVariantId: 5586089719 },
        "Espresso / iPhone 14 Plus": { syncVariantId: 5586089720 },
        "Espresso / iPhone 14 Pro": { syncVariantId: 5586089721 },
        "Espresso / iPhone 14 Pro Max": { syncVariantId: 5586089722 },
        "Espresso / iPhone 15": { syncVariantId: 5586089723 },
        "Espresso / iPhone 15 Plus": { syncVariantId: 5586089724 },
        "Espresso / iPhone 15 Pro": { syncVariantId: 5586089725 },
        "Espresso / iPhone 15 Pro Max": { syncVariantId: 5586089726 },
        "Espresso / iPhone 16": { syncVariantId: 5586089727 },
        "Espresso / iPhone 16 Plus": { syncVariantId: 5586089728 },
        "Espresso / iPhone 16 Pro": { syncVariantId: 5586089729 },
        "Espresso / iPhone 16 Pro Max": { syncVariantId: 5586089730 },
        "Espresso / iPhone 17": { syncVariantId: 5586089731 },
        "Espresso / iPhone 17 Air": { syncVariantId: 5586089732 },
        "Espresso / iPhone 17 Pro": { syncVariantId: 5586089733 },
        "Espresso / iPhone 17 Pro Max": { syncVariantId: 5586089734 },
        "Espresso / iPhone 18 Pro": { syncVariantId: 5586089735 },
        "Espresso / iPhone 18 Pro Max": { syncVariantId: 5586089736 },
      },
    },
  },
  {
    id: "FW26-SLEEVE",
    sku: "FW26-SLEEVE",
    dropAt: DROP_AT,
    // Prices approved by CIG 10/21: 13″ $50, 15″ $55.
    name: "Laptop Sleeve",
    shipping: "sleeve",
    price: 50.00,
    sizePrices: { "13″": 50.00, "15″": 55.00 },
    salePrice: null,
    description: "Made to order.",
    // Card photo and the color preselected when the product opens (CIG 10/22).
    defaultColor: "Grape",
    image: "assets/products/fw26/sleeve_grape.webp",
    colors: ["Black", "Burgundy", "Navy", "Hunter", "Grape", "Gold", "Burnt Orange", "Espresso"],
    sizes: ["13″", "15″"],
    // 2000px Printful Mockup Generator renders, web-optimized to 1600px WebP.
    colorImages: {
      "Black": "assets/products/fw26/sleeve_black.webp",
      "Burgundy": "assets/products/fw26/sleeve_burgundy.webp",
      "Navy": "assets/products/fw26/sleeve_navy.webp",
      "Hunter": "assets/products/fw26/sleeve_hunter.webp",
      "Grape": "assets/products/fw26/sleeve_grape.webp",
      "Gold": "assets/products/fw26/sleeve_gold.webp",
      "Burnt Orange": "assets/products/fw26/sleeve_burnt-orange.webp",
      "Espresso": "assets/products/fw26/sleeve_espresso.webp",
    },
    colorSwatches: {
      "Black": "https://files.cdn.printful.com/files/ac5/ac5f5ee092884739f208a5b1b8b09537_thumb.png",
      "Burgundy": "assets/products/fw26/sleeve_burgundy_swatch.webp",
      "Navy": "https://files.cdn.printful.com/files/011/011e71ce6761fb20a1130c93a6af7045_thumb.png",
      "Hunter": "https://files.cdn.printful.com/files/fbc/fbc42251e5920b96fd8519c096f7551e_thumb.png",
      "Grape": "https://files.cdn.printful.com/files/1d3/1d3412388612b399d9691cf96995f8b5_thumb.png",
      "Gold": "https://files.cdn.printful.com/files/58b/58bfa62f26170904123d3ae01fc869ca_thumb.png",
      "Burnt Orange": "https://files.cdn.printful.com/files/a36/a360f3ec249f3990c91127c1fc831c86_thumb.png",
      "Espresso": "https://files.cdn.printful.com/files/c7c/c7caa6e77245c09d4a73f6b583f485e3_thumb.png",
    },
    pod: {
      variants: {
        // Black: sync product 483546831
        "Black / 13″": { syncVariantId: 5586094129 },
        "Black / 15″": { syncVariantId: 5586094130 },
        // Burgundy: sync product 483546464
        "Burgundy / 13″": { syncVariantId: 5586092472 },
        "Burgundy / 15″": { syncVariantId: 5586092473 },
        // Navy: sync product 483546575
        "Navy / 13″": { syncVariantId: 5586092993 },
        "Navy / 15″": { syncVariantId: 5586092994 },
        // Hunter: sync product 483547075
        "Hunter / 13″": { syncVariantId: 5586095547 },
        "Hunter / 15″": { syncVariantId: 5586095548 },
        // Grape: sync product 483547017
        "Grape / 13″": { syncVariantId: 5586095103 },
        "Grape / 15″": { syncVariantId: 5586095104 },
        // Gold: sync product 483546074
        "Gold / 13″": { syncVariantId: 5586091630 },
        "Gold / 15″": { syncVariantId: 5586091631 },
        // Burnt Orange: sync product 483547413
        "Burnt Orange / 13″": { syncVariantId: 5586096985 },
        "Burnt Orange / 15″": { syncVariantId: 5586096986 },
        // Espresso: sync product 483547234
        "Espresso / 13″": { syncVariantId: 5586096134 },
        "Espresso / 15″": { syncVariantId: 5586096135 },
      },
    },
  },
  {
    id: "FW26-PILLOW",
    sku: "FW26-PILLOW",
    dropAt: DROP_AT,
    // Prices approved by CIG 10/21 (by size). US only.
    name: "Throw Pillow",
    shipping: "pillow",
    price: 45.00,
    sizePrices: { "14″×14″": 45.00, "16″×16″": 48.00, "18″×18″": 52.00, "20″×12″": 48.00, "22″×22″": 58.00 },
    salePrice: null,
    description: "Made to order. Ships to the US only.",
    // Card photo and the color preselected when the product opens (CIG 10/22).
    defaultColor: "Black",
    image: "assets/products/fw26/pillow_black_front.webp",
    colors: ["Black", "Burgundy", "Navy", "Hunter", "Grape", "Gold", "Burnt Orange", "Espresso"],
    sizes: ["14″×14″", "16″×16″", "18″×18″", "20″×12″", "22″×22″"],
    // 2000px Printful Mockup Generator renders, web-optimized to 1600px WebP, one per
    // color and size (CIG 10/22: "add the pics for the different sizes"). Printful renders
    // every size at the same real-world scale (22″ fills ~88% of the frame, 14″ ~58%), so
    // bigger pillows read bigger and the 20″×12″ reads as a lumbar. 18″×18″ is the
    // original _front render, which is also the card photo.
    colorImages: {
      "Black": {
        "14″×14″": "assets/products/fw26/pillow_black_14x14.webp",
        "16″×16″": "assets/products/fw26/pillow_black_16x16.webp",
        "18″×18″": "assets/products/fw26/pillow_black_front.webp",
        "20″×12″": "assets/products/fw26/pillow_black_20x12.webp",
        "22″×22″": "assets/products/fw26/pillow_black_22x22.webp",
      },
      "Burgundy": {
        "14″×14″": "assets/products/fw26/pillow_burgundy_14x14.webp",
        "16″×16″": "assets/products/fw26/pillow_burgundy_16x16.webp",
        "18″×18″": "assets/products/fw26/pillow_burgundy_front.webp",
        "20″×12″": "assets/products/fw26/pillow_burgundy_20x12.webp",
        "22″×22″": "assets/products/fw26/pillow_burgundy_22x22.webp",
      },
      "Navy": {
        "14″×14″": "assets/products/fw26/pillow_navy_14x14.webp",
        "16″×16″": "assets/products/fw26/pillow_navy_16x16.webp",
        "18″×18″": "assets/products/fw26/pillow_navy_front.webp",
        "20″×12″": "assets/products/fw26/pillow_navy_20x12.webp",
        "22″×22″": "assets/products/fw26/pillow_navy_22x22.webp",
      },
      "Hunter": {
        "14″×14″": "assets/products/fw26/pillow_hunter_14x14.webp",
        "16″×16″": "assets/products/fw26/pillow_hunter_16x16.webp",
        "18″×18″": "assets/products/fw26/pillow_hunter_front.webp",
        "20″×12″": "assets/products/fw26/pillow_hunter_20x12.webp",
        "22″×22″": "assets/products/fw26/pillow_hunter_22x22.webp",
      },
      "Grape": {
        "14″×14″": "assets/products/fw26/pillow_grape_14x14.webp",
        "16″×16″": "assets/products/fw26/pillow_grape_16x16.webp",
        "18″×18″": "assets/products/fw26/pillow_grape_front.webp",
        "20″×12″": "assets/products/fw26/pillow_grape_20x12.webp",
        "22″×22″": "assets/products/fw26/pillow_grape_22x22.webp",
      },
      "Gold": {
        "14″×14″": "assets/products/fw26/pillow_gold_14x14.webp",
        "16″×16″": "assets/products/fw26/pillow_gold_16x16.webp",
        "18″×18″": "assets/products/fw26/pillow_gold_front.webp",
        "20″×12″": "assets/products/fw26/pillow_gold_20x12.webp",
        "22″×22″": "assets/products/fw26/pillow_gold_22x22.webp",
      },
      "Burnt Orange": {
        "14″×14″": "assets/products/fw26/pillow_burnt-orange_14x14.webp",
        "16″×16″": "assets/products/fw26/pillow_burnt-orange_16x16.webp",
        "18″×18″": "assets/products/fw26/pillow_burnt-orange_front.webp",
        "20″×12″": "assets/products/fw26/pillow_burnt-orange_20x12.webp",
        "22″×22″": "assets/products/fw26/pillow_burnt-orange_22x22.webp",
      },
      "Espresso": {
        "14″×14″": "assets/products/fw26/pillow_espresso_14x14.webp",
        "16″×16″": "assets/products/fw26/pillow_espresso_16x16.webp",
        "18″×18″": "assets/products/fw26/pillow_espresso_front.webp",
        "20″×12″": "assets/products/fw26/pillow_espresso_20x12.webp",
        "22″×22″": "assets/products/fw26/pillow_espresso_22x22.webp",
      },
    },
    colorSwatches: {
      "Black": "https://files.cdn.printful.com/files/dfe/dfe0bcb6a65f680f09a3e3d2a66863b6_thumb.png",
      "Burgundy": "https://files.cdn.printful.com/files/924/9248b6969cc24fac74befbec9f6a081c_thumb.png",
      "Navy": "https://files.cdn.printful.com/files/033/03371df4f6e13e376b3f4c379ed165cc_thumb.png",
      "Hunter": "https://files.cdn.printful.com/files/312/312509d640b4b7f50c39f0d14cc3ae80_thumb.png",
      "Grape": "https://files.cdn.printful.com/files/7ae/7ae5817a10258f88c406e8cc820bc6c4_thumb.png",
      "Gold": "https://files.cdn.printful.com/files/d89/d897c361c25fc0c5a0a09c6d7ec22fdd_thumb.png",
      "Burnt Orange": "https://files.cdn.printful.com/files/f0a/f0a4290bca25d438bbc61088fb37e8d7_thumb.png",
      "Espresso": "https://files.cdn.printful.com/files/6cc/6cc8d83ce8c0038fd71e9263308a8d79_thumb.png",
    },
    pod: {
      variants: {
        // Black: sync product 483551772
        "Black / 14″×14″": { syncVariantId: 5586112631 },
        "Black / 16″×16″": { syncVariantId: 5586112632 },
        "Black / 18″×18″": { syncVariantId: 5586112633 },
        "Black / 20″×12″": { syncVariantId: 5586112635 },
        "Black / 22″×22″": { syncVariantId: 5586112634 },
        // Burgundy: sync product 483551551
        "Burgundy / 14″×14″": { syncVariantId: 5586111645 },
        "Burgundy / 16″×16″": { syncVariantId: 5586111646 },
        "Burgundy / 18″×18″": { syncVariantId: 5586111647 },
        "Burgundy / 20″×12″": { syncVariantId: 5586111649 },
        "Burgundy / 22″×22″": { syncVariantId: 5586111648 },
        // Navy: sync product 483552478
        "Navy / 14″×14″": { syncVariantId: 5586115686 },
        "Navy / 16″×16″": { syncVariantId: 5586115687 },
        "Navy / 18″×18″": { syncVariantId: 5586115688 },
        "Navy / 20″×12″": { syncVariantId: 5586115690 },
        "Navy / 22″×22″": { syncVariantId: 5586115689 },
        // Hunter: sync product 483553018
        "Hunter / 14″×14″": { syncVariantId: 5586118515 },
        "Hunter / 16″×16″": { syncVariantId: 5586118516 },
        "Hunter / 18″×18″": { syncVariantId: 5586118517 },
        "Hunter / 20″×12″": { syncVariantId: 5586118519 },
        "Hunter / 22″×22″": { syncVariantId: 5586118518 },
        // Grape: sync product 483553056
        "Grape / 14″×14″": { syncVariantId: 5586119093 },
        "Grape / 16″×16″": { syncVariantId: 5586119094 },
        "Grape / 18″×18″": { syncVariantId: 5586119095 },
        "Grape / 20″×12″": { syncVariantId: 5586119097 },
        "Grape / 22″×22″": { syncVariantId: 5586119096 },
        // Gold: sync product 483552685
        "Gold / 14″×14″": { syncVariantId: 5586116294 },
        "Gold / 16″×16″": { syncVariantId: 5586116295 },
        "Gold / 18″×18″": { syncVariantId: 5586116296 },
        "Gold / 20″×12″": { syncVariantId: 5586116298 },
        "Gold / 22″×22″": { syncVariantId: 5586116297 },
        // Burnt Orange: sync product 483553115
        "Burnt Orange / 14″×14″": { syncVariantId: 5586119587 },
        "Burnt Orange / 16″×16″": { syncVariantId: 5586119588 },
        "Burnt Orange / 18″×18″": { syncVariantId: 5586119589 },
        "Burnt Orange / 20″×12″": { syncVariantId: 5586119591 },
        "Burnt Orange / 22″×22″": { syncVariantId: 5586119590 },
        // Espresso: sync product 483553235
        "Espresso / 14″×14″": { syncVariantId: 5586120150 },
        "Espresso / 16″×16″": { syncVariantId: 5586120151 },
        "Espresso / 18″×18″": { syncVariantId: 5586120152 },
        "Espresso / 20″×12″": { syncVariantId: 5586120154 },
        "Espresso / 22″×22″": { syncVariantId: 5586120153 },
      },
    },
  },
  {
    id: "FW26-TOTE",
    sku: "FW26-TOTE",
    dropAt: DROP_AT,
    // Last product in the FW26/27 collection (CIG 10/22). Printful product 274
    // (All-Over Print Large Tote Bag w/ Pocket, 16″×20″, black handles).
    name: "Tote Bag",
    shipping: "bag",
    // CIG set $35 (10/22 4:22 PM ET). Printful cost 10/22: $15.86 + $5.09 US
    // shipping (US shipping is free to the customer).
    price: 35.00,
    salePrice: null,
    description: "Made to order.",
    // Card photo and the color preselected when the product opens: green, i.e.
    // the collection's "Hunter" colorway (CIG 10/22: "make it green").
    defaultColor: "Hunter",
    image: "assets/products/fw26/tote_hunter_front.webp",
    colors: ["Black", "Burgundy", "Navy", "Hunter", "Grape", "Gold", "Burnt Orange", "Espresso"],
    sizes: [],
    // Printful Mockup Generator renders (transparent, shown on the site's black
    // background): front, then the angled "Standing" 3/4 view, back, a close-up
    // and the inside pocket.
    colorImages: {
      "Black": "assets/products/fw26/tote_black_front.webp",
      "Burgundy": "assets/products/fw26/tote_burgundy_front.webp",
      "Navy": "assets/products/fw26/tote_navy_front.webp",
      "Hunter": "assets/products/fw26/tote_hunter_front.webp",
      "Grape": "assets/products/fw26/tote_grape_front.webp",
      "Gold": "assets/products/fw26/tote_gold_front.webp",
      "Burnt Orange": "assets/products/fw26/tote_burnt-orange_front.webp",
      "Espresso": "assets/products/fw26/tote_espresso_front.webp",
    },
    gallery: {
      "Black": ["assets/products/fw26/tote_black_angle.webp", "assets/products/fw26/tote_black_back.webp", "assets/products/fw26/tote_black_detail.webp", "assets/products/fw26/tote_black_pocket.webp"],
      "Burgundy": ["assets/products/fw26/tote_burgundy_angle.webp", "assets/products/fw26/tote_burgundy_back.webp", "assets/products/fw26/tote_burgundy_detail.webp", "assets/products/fw26/tote_burgundy_pocket.webp"],
      "Navy": ["assets/products/fw26/tote_navy_angle.webp", "assets/products/fw26/tote_navy_back.webp", "assets/products/fw26/tote_navy_detail.webp", "assets/products/fw26/tote_navy_pocket.webp"],
      "Hunter": ["assets/products/fw26/tote_hunter_angle.webp", "assets/products/fw26/tote_hunter_back.webp", "assets/products/fw26/tote_hunter_detail.webp", "assets/products/fw26/tote_hunter_pocket.webp"],
      "Grape": ["assets/products/fw26/tote_grape_angle.webp", "assets/products/fw26/tote_grape_back.webp", "assets/products/fw26/tote_grape_detail.webp", "assets/products/fw26/tote_grape_pocket.webp"],
      "Gold": ["assets/products/fw26/tote_gold_angle.webp", "assets/products/fw26/tote_gold_back.webp", "assets/products/fw26/tote_gold_detail.webp", "assets/products/fw26/tote_gold_pocket.webp"],
      "Burnt Orange": ["assets/products/fw26/tote_burnt-orange_angle.webp", "assets/products/fw26/tote_burnt-orange_back.webp", "assets/products/fw26/tote_burnt-orange_detail.webp", "assets/products/fw26/tote_burnt-orange_pocket.webp"],
      "Espresso": ["assets/products/fw26/tote_espresso_angle.webp", "assets/products/fw26/tote_espresso_back.webp", "assets/products/fw26/tote_espresso_detail.webp", "assets/products/fw26/tote_espresso_pocket.webp"],
    },
    colorSwatches: {
      "Black": "assets/products/fw26/tote_black_swatch.webp",
      "Burgundy": "assets/products/fw26/tote_burgundy_swatch.webp",
      "Navy": "assets/products/fw26/tote_navy_swatch.webp",
      "Hunter": "assets/products/fw26/tote_hunter_swatch.webp",
      "Grape": "assets/products/fw26/tote_grape_swatch.webp",
      "Gold": "assets/products/fw26/tote_gold_swatch.webp",
      "Burnt Orange": "assets/products/fw26/tote_burnt-orange_swatch.webp",
      "Espresso": "assets/products/fw26/tote_espresso_swatch.webp",
    },
    pod: {
      variants: {
        "Black": { syncVariantId: 5589500592 }, // sync product 484114597
        "Burgundy": { syncVariantId: 5589484773 }, // sync product 484110956
        "Navy": { syncVariantId: 5589494794 }, // sync product 484113383
        "Hunter": { syncVariantId: 5589489621 }, // sync product 484112212
        "Grape": { syncVariantId: 5589495970 }, // sync product 484113661
        "Gold": { syncVariantId: 5589508290 }, // sync product 484115612 (named "CIG Tote Bag [Espresso] copy" in Printful; its print file is the Gold design)
        "Burnt Orange": { syncVariantId: 5589486261 }, // sync product 484111399
        "Espresso": { syncVariantId: 5589504563 }, // sync product 484115025
      },
    },
  },
  {
    id: "0004",
    sku: "0004",
    name: "Silky Bonnet & Durag",
    // CIG 10/22: sold out (whole product). Counts below are left as-is.
    soldOut: true,
    // CIG 10/22 4:56 PM: card and product view open on Blue (sold out, shows the blue photo).
    defaultColor: "Blue",
    image: "assets/products/bonnet-blue.jpg",
    colors: ["Red", "Gold", "Black", "Pink", "Blue"],
    sizes: [],
    styles: [
      { name: "Set", price: 20.00, components: { "Bonnet": 1, "Durag": 1 } },
      { name: "Bonnet", price: 12.00, components: { "Bonnet": 1 } },
      { name: "Durag", price: 12.00, components: { "Durag": 1 } },
    ],
    // Bonnets, Durags, and Sets share these physical component counts.
    componentStock: {
      "Red":   { "Bonnet": 0, "Durag": 2 },
      "Gold":  { "Bonnet": 0, "Durag": 1 },
      "Black": { "Bonnet": 0, "Durag": 0 },
      "Pink":  { "Bonnet": 3, "Durag": 2 },
      "Blue":  { "Bonnet": 1, "Durag": 1 },
    },
    styleImages: {
      "Set": {
        "Red": "assets/products/bonnet-set-red.jpg",
        "Gold": "assets/products/bonnet-set-gold.jpg",
        "Black": "assets/products/bonnet-set-black.jpg",
        "Pink": "assets/products/bonnet-set-pink.jpg",
        "Blue": "assets/products/bonnet-blue.jpg",
      },
      "Bonnet": {
        "Red": "assets/products/bonnet-solo-red.jpg",
        "Gold": "assets/products/bonnet-solo-gold.jpg",
        "Black": "assets/products/bonnet-solo-black.jpg",
        "Pink": "assets/products/bonnet-solo-pink.jpg",
        "Blue": "assets/products/bonnet-blue.jpg",
      },
      "Durag": {
        "Red": "assets/products/durag-folded-red.jpg",
        "Gold": "assets/products/bonnet-set-gold.jpg",
        "Black": "assets/products/bonnet-set-black.jpg",
        "Pink": "assets/products/bonnet-set-pink.jpg",
        "Blue": "assets/products/bonnet-blue.jpg",
      },
    },
    styleGallery: {
      "Set": {
        "Red": ["assets/products/bonnet-solo-red.jpg", "assets/products/durag-folded-red.jpg"],
        "Gold": ["assets/products/bonnet-solo-gold.jpg"],
        "Black": ["assets/products/bonnet-solo-black.jpg"],
        "Pink": ["assets/products/bonnet-solo-pink.jpg"],
      },
      "Bonnet": {},
      "Durag": {},
    },
  },
  {
    id: "0005",
    sku: "0005",
    // Live count in Supabase (live_stock table); `stock` below is the seed/cap.
    liveStock: true,
    // Backstock count 10/21 (bg/backstock_2026-10-21.csv); price approved by CIG 10/22.
    // CIG's names: "Gold" = black balaclava with yellow/gold print; "Black" =
    // black balaclava with white print. CIG confirmed 10/22: BG's 24 are Gold;
    // Black (white print) is sold out. Supabase gets the same numbers from
    // supabase/migrations/202610220001_live_stock.sql.
    stock: { "Red": 70, "Blue": 68, "Gold": 24, "Black": 0 },
    name: "CIG Balaclava",
    price: 25.00,
    salePrice: null,
    // CIG 10/22: card and product view open on the black-and-gold balaclava.
    defaultColor: "Gold",
    image: "assets/products/balaclava-gold-front-upright.jpg",
    colors: ["Red", "Blue", "Gold", "Black"],
    sizes: [],
    colorImages: {
      "Blue": "assets/products/balaclava-blue-front.jpg",
      "Red": "assets/products/balaclava-red-front-upright.jpg",
      "Gold": "assets/products/balaclava-gold-front-upright.jpg",
      // Only Black (white-print) photo on hand is a back view.
      "Black": "assets/products/balaclava-black.jpg",
    },
    gallery: {
      "Blue": ["assets/products/balaclava-blue-back.jpg"],
      "Red": ["assets/products/balaclava-red-back-upright.jpg"],
      "Gold": ["assets/products/balaclava-gold-back-upright.jpg"],
    },
  },
  {
    id: "0008",
    sku: "0008",
    // Live count in Supabase (live_stock table); `stock` below is the seed/cap.
    liveStock: true,
    // Backstock count 10/21 (bg/backstock_2026-10-21.csv); price approved by CIG 10/22.
    // BG's "Yellow" is the site's "Gold" (photos are skimask-gold-*). Stock is a
    // static cap: it isn't decremented on sale.
    stock: {
      "Blue":  { "1-Hole": 56, "3-Hole": 70, "Skully": 0 },
      "Red":   { "1-Hole": 59, "3-Hole": 80, "Skully": 0 },
      "Green": { "1-Hole": 71, "3-Hole": 77, "Skully": 0 },
      "Gold":  { "1-Hole": 73, "3-Hole": 81, "Skully": 0 },
    },
    name: "CIG Ski Mask",
    price: 30.00,
    salePrice: null,
    // CIG 10/22 4:56 PM: card and product view open on Red (1-Hole).
    defaultColor: "Red",
    image: "assets/products/skimask-red-1hole.jpg",
    colors: ["Blue", "Red", "Green", "Gold"],
    sizes: ["1-Hole", "3-Hole", "Skully"],
    // Note: Green has no 1-Hole photo yet — it'll fall back to Green's 3-Hole shot until you send one.
    colorImages: {
      "Blue": {
        "1-Hole": "assets/products/skimask-blue-1hole.jpg",
        "3-Hole": "assets/products/skimask-blue-3hole.jpg",
        "Skully": "assets/products/skimask-blue-skully.jpg",
      },
      "Red": {
        "1-Hole": "assets/products/skimask-red-1hole.jpg",
        "3-Hole": "assets/products/skimask-red-3hole.jpg",
        "Skully": "assets/products/skimask-red-skully.jpg",
      },
      "Green": {
        "3-Hole": "assets/products/skimask-green-3hole.jpg",
        "Skully": "assets/products/skimask-green-skully.jpg",
      },
      "Gold": {
        "1-Hole": "assets/products/skimask-gold-1hole.jpg",
        "3-Hole": "assets/products/skimask-gold-3hole.jpg",
        "Skully": "assets/products/skimask-gold-skully.jpg",
      },
    },
    // Extra angle photos shown in the photo slider alongside the front-of-mask shot.
    gallery: {
      "Blue": ["assets/products/skimask-blue-back.jpg"],
      "Red": ["assets/products/skimask-red-back.jpg"],
      "Gold": ["assets/products/skimask-gold-back.jpg"],
      "Green": ["assets/products/skimask-green-back.jpg"],
    },
  },
  {
    id: "0013",
    sku: "0013",
    // Live count in Supabase (live_stock table); `stock` below is the seed/cap.
    liveStock: true,
    // Moto mask backstock (bg/backstock_2026-10-21.csv, CIG counts 10/21 PM);
    // $15 approved by CIG 10/22. Name is a DRAFT pending CIG.
    // Sold out per BG and left off: Red, Black, Blue, Rainbow.
    // Not the same listing as 0012 "CIG Corona Masks" as far as the data shows
    // (different colors and counts); CIG to confirm.
    // LISTED 10/22 5:27 PM in the umbrella's old spot (CIG: "we're gonna
    // replace [the umbrella] with moto masks"), with CIG's new photos (IMG_2592-2597,
    // all turned strap-right, background removed, on black 1600x1600).
    // Photo -> color: the pinkish-red mask is "Pink" and the orange-red one is
    // "Orange" (per CIG's brief; CIG to confirm), the gold/tan one is "Yellow".
    stock: { "Yellow": 17, "Pink": 22, "Brown": 16, "Purple": 14, "Green": 13, "Orange": 12 },
    name: "Moto Mask",
    price: 15.00,
    salePrice: null,
    // CIG 10/22 5:07 PM: "Make the first one the purple one".
    defaultColor: "Purple",
    image: "assets/products/moto-purple.jpg",
    colors: ["Purple", "Green", "Brown", "Yellow", "Pink", "Orange"],
    sizes: [],
    colorImages: {
      "Purple": "assets/products/moto-purple.jpg",
      "Green": "assets/products/moto-green.jpg",
      "Brown": "assets/products/moto-brown.jpg",
      "Yellow": "assets/products/moto-yellow.jpg",
      "Pink": "assets/products/moto-pink.jpg",
      "Orange": "assets/products/moto-orange.jpg",
    },
    // Plain color dots on the color buttons, sampled from the new photos.
    colorHex: {
      "Purple": "#5d314e", "Green": "#79b06b", "Brown": "#b57f5b",
      "Yellow": "#edc07d", "Pink": "#d6394e", "Orange": "#e24d3b",
    },
  },
  {
    id: "0010",
    sku: "0010",
    stock: { "Blue": 2, "Green": 0, "Red": 2, "Rainbow": 6 },
    name: "Toile Umbrella",
    // CIG 10/22: sold out (whole product). Counts below are left as-is.
    soldOut: true,
    // HIDDEN 10/22 4:59 PM (CIG: "take the umbrella out we're gonna replace
    // with moto masks"). Data, photos and stock are kept so it can come back:
    // flip to false (or delete this line) to relist it.
    hidden: true,
    price: 35.00,
    salePrice: null,
    image: "assets/products/umbrella-blue-open.jpg",
    colors: ["Blue", "Green", "Red", "Rainbow"],
    sizes: [],
    colorImages: {
      "Blue": "assets/products/umbrella-blue-open.jpg",
      "Green": "assets/products/umbrella-green-open.jpg",
      "Red": "assets/products/umbrella-red-open.jpg",
      "Rainbow": "assets/products/umbrella-rainbow-open.jpg",
    },
    gallery: {
      "Blue": ["assets/products/umbrella-blue.jpg"],
      "Green": ["assets/products/umbrella-green.jpg"],
      "Red": ["assets/products/umbrella-red.jpg"],
      "Rainbow": ["assets/products/umbrella-rainbow.jpg"],
    },
  },
  {
    id: "0011",
    sku: "0011",
    name: "Paisley Bikini",
    // CIG 10/22: sold out (whole product). Counts below are left as-is.
    soldOut: true,
    // CIG 10/22 4:58 PM: card and product view open on Pink (sold out, shows the pink photo).
    defaultColor: "Pink",
    image: "assets/products/bandana-top-pink-front.jpg",
    colors: ["Red", "Pink", "Green"],
    sizes: ["XS", "S", "M", "L", "XL"],
    // Shoppers pick Top, Bottom, or the full Set — price changes with the choice.
    styles: [
      { name: "Set", price: 45.00 },
      { name: "Top", price: 30.00 },
      { name: "Bottom", price: 20.00 },
    ],
    // Main photo shown for each Style + Color.
    styleImages: {
      "Set":    { "Red": "assets/products/bandana-top-red-front.jpg", "Pink": "assets/products/bandana-top-pink-front.jpg", "Green": "assets/products/bandana-top-green-back.jpg" },
      "Top":    { "Red": "assets/products/bandana-top-red-front.jpg", "Pink": "assets/products/bandana-top-pink-front.jpg", "Green": "assets/products/bandana-top-green-back.jpg" },
      "Bottom": { "Red": "assets/products/bandana-thong-red.jpg",     "Pink": "assets/products/bandana-thong-pink.jpg",     "Green": "assets/products/bandana-thong-green.jpg" },
    },
    // Extra angle photos in the slider for each Style + Color.
    styleGallery: {
      "Set": {
        "Red":   ["assets/products/bandana-thong-red.jpg", "assets/products/bandana-top-red-back.jpg", "assets/products/bandana-label-red.jpg"],
        "Pink":  ["assets/products/bandana-thong-pink.jpg", "assets/products/bandana-top-pink-back.jpg", "assets/products/bandana-top-pink-alt.jpg"],
        "Green": ["assets/products/bandana-thong-green.jpg"],
      },
      "Top": {
        "Red":  ["assets/products/bandana-top-red-back.jpg", "assets/products/bandana-label-red.jpg"],
        "Pink": ["assets/products/bandana-top-pink-alt.jpg", "assets/products/bandana-top-pink-back.jpg"],
      },
      "Bottom": {},
    },
    // STOCK — how many you have. Set to 0 when sold out. Keyed by Style > Color > Size.
    stock: {
      "Set": {
        "Red":   { "XS": 0, "S": 0, "M": 0, "L": 3, "XL": 6 },
        "Pink":  { "XS": 0, "S": 0, "M": 1, "L": 2, "XL": 8 },
        "Green": { "XS": 0, "S": 0, "M": 0, "L": 4, "XL": 6 },
      },
      "Top": {
        "Red":   { "XS": 0, "S": 0, "M": 0, "L": 3, "XL": 6 },
        "Pink":  { "XS": 0, "S": 0, "M": 1, "L": 2, "XL": 8 },
        "Green": { "XS": 0, "S": 0, "M": 0, "L": 4, "XL": 6 },
      },
      "Bottom": {
        "Red":   { "XS": 0, "S": 0, "M": 0, "L": 3, "XL": 6 },
        "Pink":  { "XS": 0, "S": 0, "M": 1, "L": 2, "XL": 8 },
        "Green": { "XS": 0, "S": 0, "M": 0, "L": 4, "XL": 6 },
      },
    },
  },
  {
    id: "0012",
    sku: "0012",
    // Off-site backstock — held ready, not sold on the site.
    // BEFORE setting hidden to false: fill in price and add photos to
    // assets/products/. Both are blank below, and the grid needs them.
    hidden: true,
    stock: { "Blue": 17, "Red": 27, "Black/Rainbow": 7, "White/Rainbow": 20 },
    name: "CIG Corona Masks",
    price: null,
    salePrice: null,
    image: "",
    colors: ["Blue", "Red", "Black/Rainbow", "White/Rainbow"],
    sizes: [],
    colorImages: {},
  },
];

// Made-to-order (`pod`) items can only be paid by card while this is true.
// One switch for the checkout page and the server. See the note at the top.
// CIG 10/22 4:34 PM ET: "Turn on PayPal for the FW26 collection".
const POD_CARD_ONLY = false;

// Crypto checkout (Coinbase Commerce) is off: CIG decided 2026-10-21 to set
// it up later under a new LLC. One switch for the site and the server.
const CRYPTO_ENABLED = false;

if (typeof module !== "undefined" && module.exports) {
  module.exports = { CRYPTO_ENABLED, DROP_AT, POD_CARD_ONLY, PRODUCTS };
}
