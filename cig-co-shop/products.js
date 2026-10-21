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
//
// POD_CARD_ONLY (bottom of this file): while true, carts with any `pod` item can
//   only be paid by card (PayPal and crypto refuse them, on the site and on the
//   server). Flip it to false to allow PayPal/crypto for made-to-order items.
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
    image: "https://files.cdn.printful.com/files/c1e/c1ec429471b12203f307781760d3d862_preview.png",
    colors: ["Black", "Burgundy", "Navy", "Hunter", "Grape", "Gold", "Burnt Orange", "Espresso", "Multi"],
    sizes: [],
    colorImages: {
      "Black": "https://files.cdn.printful.com/files/c1e/c1ec429471b12203f307781760d3d862_preview.png",
      "Burgundy": "https://files.cdn.printful.com/files/f74/f74238283ae61a408e6308b8375ac52e_preview.png",
      "Navy": "https://files.cdn.printful.com/files/e11/e11ff4fcad42fa3cdb56b5d6650aa04d_preview.png",
      "Hunter": "https://files.cdn.printful.com/files/27e/27ed074cbadcc3220cfe0d6fca28b471_preview.png",
      "Grape": "https://files.cdn.printful.com/files/6bf/6bf59f6ed229c1cca6d85f3f91b694ae_preview.png",
      "Gold": "https://files.cdn.printful.com/files/d38/d38370793971808f55f5748b18e35326_preview.png",
      "Burnt Orange": "https://files.cdn.printful.com/files/3f6/3f6722b47380bb65ba0244cd01a98e06_preview.png",
      "Espresso": "https://files.cdn.printful.com/files/3b9/3b9066c63624c96ec4d31060bc2cfaa2_preview.png",
      "Multi": "https://files.cdn.printful.com/files/6aa/6aac2c3c795d892f99e788ec8dab9eca_preview.png",
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
      "Multi": "https://files.cdn.printful.com/files/6aa/6aac2c3c795d892f99e788ec8dab9eca_thumb.png",
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
    image: "https://files.cdn.printful.com/files/cfe/cfe92b997631c49642cb842a6d911845_preview.png",
    colors: ["Black", "Burgundy", "Navy", "Hunter", "Grape", "Gold", "Burnt Orange", "Espresso"],
    sizes: ["iPhone 14", "iPhone 14 Plus", "iPhone 14 Pro", "iPhone 14 Pro Max", "iPhone 15", "iPhone 15 Plus", "iPhone 15 Pro", "iPhone 15 Pro Max", "iPhone 16", "iPhone 16 Plus", "iPhone 16 Pro", "iPhone 16 Pro Max", "iPhone 17", "iPhone 17 Air", "iPhone 17 Pro", "iPhone 17 Pro Max", "iPhone 18 Pro", "iPhone 18 Pro Max"],
    colorImages: {
      "Black": {
        "iPhone 14": "https://files.cdn.printful.com/files/cfe/cfe92b997631c49642cb842a6d911845_preview.png",
        "iPhone 14 Plus": "https://files.cdn.printful.com/files/fc1/fc18e04d7226558d3e70565257c47362_preview.png",
        "iPhone 14 Pro": "https://files.cdn.printful.com/files/f6c/f6c4a595c312b2424604dab7219fff93_preview.png",
        "iPhone 14 Pro Max": "https://files.cdn.printful.com/files/052/052883001b791df563d24bfc0107c37c_preview.png",
        "iPhone 15": "https://files.cdn.printful.com/files/8df/8dfa6c1d14dd020bdb71b9974e123451_preview.png",
        "iPhone 15 Plus": "https://files.cdn.printful.com/files/f7d/f7dadbdb3c394bd633e8214eaef8a5be_preview.png",
        "iPhone 15 Pro": "https://files.cdn.printful.com/files/a70/a7032ddedb99a6910e9c3049c2a60957_preview.png",
        "iPhone 15 Pro Max": "https://files.cdn.printful.com/files/687/6873d2a2d7a99b1c1861246d8c4463b4_preview.png",
        "iPhone 16": "https://files.cdn.printful.com/files/373/37304f176e1c81a733984e3141432883_preview.png",
        "iPhone 16 Plus": "https://files.cdn.printful.com/files/a1d/a1dca9375bd0bb2aea2b925ee02cee15_preview.png",
        "iPhone 16 Pro": "https://files.cdn.printful.com/files/61e/61e9784d83f1dfbf1c823d8520c02af7_preview.png",
        "iPhone 16 Pro Max": "https://files.cdn.printful.com/files/1e6/1e6041b8e0c4b6eb0401500a6844632e_preview.png",
        "iPhone 17": "https://files.cdn.printful.com/files/36a/36adeb023782352e575d5a4b1a3a2dbe_preview.png",
        "iPhone 17 Air": "https://files.cdn.printful.com/files/abf/abf7605b417e24f116524969462647ca_preview.png",
        "iPhone 17 Pro": "https://files.cdn.printful.com/files/75a/75a1258247d16aaf4adb442503bae18c_preview.png",
        "iPhone 17 Pro Max": "https://files.cdn.printful.com/files/29e/29e88a1d8e39958b4762d428ab4ff603_preview.png",
        "iPhone 18 Pro": "https://files.cdn.printful.com/files/75a/75a1258247d16aaf4adb442503bae18c_preview.png",
        "iPhone 18 Pro Max": "https://files.cdn.printful.com/files/29e/29e88a1d8e39958b4762d428ab4ff603_preview.png",
      },
      "Burgundy": {
        "iPhone 14": "https://files.cdn.printful.com/files/395/395cf528ebb0aaa6fd2530acb087be93_preview.png",
        "iPhone 14 Plus": "https://files.cdn.printful.com/files/6e6/6e6de0aa75aa543d402a430df2da331c_preview.png",
        "iPhone 14 Pro": "https://files.cdn.printful.com/files/c63/c631ee6d81d4d89fdcd3785fe3c1dd10_preview.png",
        "iPhone 14 Pro Max": "https://files.cdn.printful.com/files/083/0833356eee5b144b5ab995f30529637f_preview.png",
        "iPhone 15": "https://files.cdn.printful.com/files/81b/81bce96c970b10a33b6d4f6f52e5874d_preview.png",
        "iPhone 15 Plus": "https://files.cdn.printful.com/files/4e3/4e3b845701b23a0f0f75cb98f55d516f_preview.png",
        "iPhone 15 Pro": "https://files.cdn.printful.com/files/cb4/cb421e7b4ae5e9b87d12e8709252b138_preview.png",
        "iPhone 15 Pro Max": "https://files.cdn.printful.com/files/f00/f00978844003b749ca19ee79c264c98a_preview.png",
        "iPhone 16": "https://files.cdn.printful.com/files/aca/aca9fb09d6e97d9dca05a85b04b57b01_preview.png",
        "iPhone 16 Plus": "https://files.cdn.printful.com/files/da9/da973936cfa823261bac4eab80d46ea5_preview.png",
        "iPhone 16 Pro": "https://files.cdn.printful.com/files/d76/d76942dfebd7c38707216ad83dad6c89_preview.png",
        "iPhone 16 Pro Max": "https://files.cdn.printful.com/files/af1/af166719b953b4f3bf46fbd8766fa19d_preview.png",
        "iPhone 17": "https://files.cdn.printful.com/files/f8b/f8b5552ac9de0ba92467ec04c1fb2dee_preview.png",
        "iPhone 17 Air": "https://files.cdn.printful.com/files/45f/45f037fa6058bf48650aa5047a48110d_preview.png",
        "iPhone 17 Pro": "https://files.cdn.printful.com/files/926/926d2a936c8c828ae861ae7ac8b60d2f_preview.png",
        "iPhone 17 Pro Max": "https://files.cdn.printful.com/files/e91/e9191d6779829fbd4b3a1878e4102ebb_preview.png",
        "iPhone 18 Pro": "https://files.cdn.printful.com/files/926/926d2a936c8c828ae861ae7ac8b60d2f_preview.png",
        "iPhone 18 Pro Max": "https://files.cdn.printful.com/files/e91/e9191d6779829fbd4b3a1878e4102ebb_preview.png",
      },
      "Navy": {
        "iPhone 14": "https://files.cdn.printful.com/files/aaf/aaf5dc8b3ce809705c31300180485796_preview.png",
        "iPhone 14 Plus": "https://files.cdn.printful.com/files/16f/16f965810410aa8159d631331c9c1094_preview.png",
        "iPhone 14 Pro": "https://files.cdn.printful.com/files/7d5/7d586999ec265213666783e0d4c3e466_preview.png",
        "iPhone 14 Pro Max": "https://files.cdn.printful.com/files/f89/f89ce9aecab84314da0ccc0ffdf29d72_preview.png",
        "iPhone 15": "https://files.cdn.printful.com/files/3e3/3e39993d73ac39acd1193d485df16236_preview.png",
        "iPhone 15 Plus": "https://files.cdn.printful.com/files/0f3/0f30dac8c3fb96b4346f598e6b43cf1b_preview.png",
        "iPhone 15 Pro": "https://files.cdn.printful.com/files/ff5/ff5f9d3739d39922dd66706ef2bb2ab5_preview.png",
        "iPhone 15 Pro Max": "https://files.cdn.printful.com/files/440/440adfdc244cb4da7e72446b851bea7f_preview.png",
        "iPhone 16": "https://files.cdn.printful.com/files/ff1/ff14f504f21a8745e02d26cfeafce815_preview.png",
        "iPhone 16 Plus": "https://files.cdn.printful.com/files/3e8/3e810b2c67eb809203c37e8eb81f4ca5_preview.png",
        "iPhone 16 Pro": "https://files.cdn.printful.com/files/b5d/b5d33b77adb1a8af2812c0cdc70ee49a_preview.png",
        "iPhone 16 Pro Max": "https://files.cdn.printful.com/files/6f0/6f02d4948211674294b3708f13883d6b_preview.png",
        "iPhone 17": "https://files.cdn.printful.com/files/b63/b636eacf1e11b6219561a03754b788af_preview.png",
        "iPhone 17 Air": "https://files.cdn.printful.com/files/3cc/3cc9e6d852c4fa8638a92f83414c35b5_preview.png",
        "iPhone 17 Pro": "https://files.cdn.printful.com/files/a6a/a6a9e173c0e09f283b0a9e82720a2942_preview.png",
        "iPhone 17 Pro Max": "https://files.cdn.printful.com/files/568/568d4470247a9c8c83ff67e3e52b1e0d_preview.png",
        "iPhone 18 Pro": "https://files.cdn.printful.com/files/a6a/a6a9e173c0e09f283b0a9e82720a2942_preview.png",
        "iPhone 18 Pro Max": "https://files.cdn.printful.com/files/568/568d4470247a9c8c83ff67e3e52b1e0d_preview.png",
      },
      "Hunter": {
        "iPhone 14": "https://files.cdn.printful.com/files/e0d/e0d531ea691480972949b2cf4cc48408_preview.png",
        "iPhone 14 Plus": "https://files.cdn.printful.com/files/3dc/3dc7925d772845aeb5a036ab4aaba3b6_preview.png",
        "iPhone 14 Pro": "https://files.cdn.printful.com/files/147/14721d1b762ae319725ba414147f0540_preview.png",
        "iPhone 14 Pro Max": "https://files.cdn.printful.com/files/038/038375f9b24eaa13f6e2e1b2999bf367_preview.png",
        "iPhone 15": "https://files.cdn.printful.com/files/73d/73d72710e983800d4c6a451f63611894_preview.png",
        "iPhone 15 Plus": "https://files.cdn.printful.com/files/ef8/ef8ee0ff95e0898ba2a64debbb47ec28_preview.png",
        "iPhone 15 Pro": "https://files.cdn.printful.com/files/238/2383cbafe5d98c46ab0103390b34db40_preview.png",
        "iPhone 15 Pro Max": "https://files.cdn.printful.com/files/b10/b10bcee0e290e986d23eff3fe8751c27_preview.png",
        "iPhone 16": "https://files.cdn.printful.com/files/cce/cce5c736109ded1f87eaebc52cd2ccae_preview.png",
        "iPhone 16 Plus": "https://files.cdn.printful.com/files/ca5/ca547c0a88dc11afe1cf581e986a96c4_preview.png",
        "iPhone 16 Pro": "https://files.cdn.printful.com/files/2f8/2f8964c21d19415408113e2fc46a4dd9_preview.png",
        "iPhone 16 Pro Max": "https://files.cdn.printful.com/files/27d/27db749f59d716324f1b112aa0106067_preview.png",
        "iPhone 17": "https://files.cdn.printful.com/files/083/083a28ad3e0241447ca44c6992fa42bb_preview.png",
        "iPhone 17 Air": "https://files.cdn.printful.com/files/df3/df3a8c52ed7d87c39d6b560b9e977163_preview.png",
        "iPhone 17 Pro": "https://files.cdn.printful.com/files/413/413e5a4af95644ec17decf449cc5a6df_preview.png",
        "iPhone 17 Pro Max": "https://files.cdn.printful.com/files/aba/aba1bfa492958691ef313849a77ca537_preview.png",
        "iPhone 18 Pro": "https://files.cdn.printful.com/files/413/413e5a4af95644ec17decf449cc5a6df_preview.png",
        "iPhone 18 Pro Max": "https://files.cdn.printful.com/files/aba/aba1bfa492958691ef313849a77ca537_preview.png",
      },
      "Grape": {
        "iPhone 14": "https://files.cdn.printful.com/files/1fe/1fe4b88d136827c6f2be81865e2698fd_preview.png",
        "iPhone 14 Plus": "https://files.cdn.printful.com/files/554/554b25c7f88851f3877d39dcabb44429_preview.png",
        "iPhone 14 Pro": "https://files.cdn.printful.com/files/526/526cc88bebdbdaf85d0b06fc20956aaf_preview.png",
        "iPhone 14 Pro Max": "https://files.cdn.printful.com/files/c5d/c5ddbb9057f25c2fe452071f3e14d42e_preview.png",
        "iPhone 15": "https://files.cdn.printful.com/files/217/21768d1feb1a8f42c2c7c6f4816ae2d7_preview.png",
        "iPhone 15 Plus": "https://files.cdn.printful.com/files/908/9081576f24bf7ba8d84576ce328ef827_preview.png",
        "iPhone 15 Pro": "https://files.cdn.printful.com/files/577/5779a5ae847b1645ed554848866170c7_preview.png",
        "iPhone 15 Pro Max": "https://files.cdn.printful.com/files/503/503f2c97bfec74d835e182e5c7a286ac_preview.png",
        "iPhone 16": "https://files.cdn.printful.com/files/243/243d0d64d285f1c1ae0a831dab7f89f5_preview.png",
        "iPhone 16 Plus": "https://files.cdn.printful.com/files/737/737e1202461f945cc0754cdd9b98b7a0_preview.png",
        "iPhone 16 Pro": "https://files.cdn.printful.com/files/c8e/c8ea6066d82f5ab61462392e9293f6cf_preview.png",
        "iPhone 16 Pro Max": "https://files.cdn.printful.com/files/1d0/1d0e0fcc40841035829a831f91179455_preview.png",
        "iPhone 17": "https://files.cdn.printful.com/files/026/0260ec4a34512d393651195d37b21d89_preview.png",
        "iPhone 17 Air": "https://files.cdn.printful.com/files/2ed/2ed1b2566e5b26f00e76a388f2490e9b_preview.png",
        "iPhone 17 Pro": "https://files.cdn.printful.com/files/d67/d6713530bb36924f4e0d0d7cb728d9ed_preview.png",
        "iPhone 17 Pro Max": "https://files.cdn.printful.com/files/574/574fed8ec2e16aa61e5b0afc20631bd3_preview.png",
        "iPhone 18 Pro": "https://files.cdn.printful.com/files/d67/d6713530bb36924f4e0d0d7cb728d9ed_preview.png",
        "iPhone 18 Pro Max": "https://files.cdn.printful.com/files/574/574fed8ec2e16aa61e5b0afc20631bd3_preview.png",
      },
      "Gold": {
        "iPhone 14": "https://files.cdn.printful.com/files/1eb/1ebae1c742f2720d10cee784f36fb174_preview.png",
        "iPhone 14 Plus": "https://files.cdn.printful.com/files/af4/af4d26962a0439b3e37648cc075f6a7e_preview.png",
        "iPhone 14 Pro": "https://files.cdn.printful.com/files/770/770ff6704271533d420008a8038e897e_preview.png",
        "iPhone 14 Pro Max": "https://files.cdn.printful.com/files/ac1/ac1369cf6977f234b68ba355cc347e61_preview.png",
        "iPhone 15": "https://files.cdn.printful.com/files/659/659cf30e16dd33a2066f5b8532018acd_preview.png",
        "iPhone 15 Plus": "https://files.cdn.printful.com/files/04c/04c6b49a69e75f8992304661b17db86d_preview.png",
        "iPhone 15 Pro": "https://files.cdn.printful.com/files/0cf/0cfe48ecb63484e23b51766e3c586709_preview.png",
        "iPhone 15 Pro Max": "https://files.cdn.printful.com/files/169/1692c7f140a90afe223afad3360efba6_preview.png",
        "iPhone 16": "https://files.cdn.printful.com/files/214/21404f1e0f1ef9a0eb1162ee881ffded_preview.png",
        "iPhone 16 Plus": "https://files.cdn.printful.com/files/9c3/9c3b7ad1d61f67caa4bda3d789f1a358_preview.png",
        "iPhone 16 Pro": "https://files.cdn.printful.com/files/5ae/5aec2bf56b41e09712e912a685fe5314_preview.png",
        "iPhone 16 Pro Max": "https://files.cdn.printful.com/files/73f/73ffd4f1c5c86a75ce87c790cd571c80_preview.png",
        "iPhone 17": "https://files.cdn.printful.com/files/a93/a9318e038f71f6e63e674807cb507487_preview.png",
        "iPhone 17 Air": "https://files.cdn.printful.com/files/bfc/bfcc42879187d0938b85e83e3cf11172_preview.png",
        "iPhone 17 Pro": "https://files.cdn.printful.com/files/3d4/3d4452d9f9bdd12455d1bb99a69359a1_preview.png",
        "iPhone 17 Pro Max": "https://files.cdn.printful.com/files/7b5/7b5b0844f854cd79473a2e39c4881e37_preview.png",
        "iPhone 18 Pro": "https://files.cdn.printful.com/files/3d4/3d4452d9f9bdd12455d1bb99a69359a1_preview.png",
        "iPhone 18 Pro Max": "https://files.cdn.printful.com/files/7b5/7b5b0844f854cd79473a2e39c4881e37_preview.png",
      },
      "Burnt Orange": {
        "iPhone 14": "https://files.cdn.printful.com/files/a14/a147f44c0b9475e0f8e6f9a69ca691b5_preview.png",
        "iPhone 14 Plus": "https://files.cdn.printful.com/files/deb/deb73682ac9129119455c6f8a9162688_preview.png",
        "iPhone 14 Pro": "https://files.cdn.printful.com/files/232/232b7cb34d2f1d7abf5043a9862e59c4_preview.png",
        "iPhone 14 Pro Max": "https://files.cdn.printful.com/files/0d3/0d35e30b2a70a98345f2ef165b7316ac_preview.png",
        "iPhone 15": "https://files.cdn.printful.com/files/647/6474e10b1ab58cd4121c127e6361e9ab_preview.png",
        "iPhone 15 Plus": "https://files.cdn.printful.com/files/1fa/1fa19f440cd7870db67b8132c3e69bfe_preview.png",
        "iPhone 15 Pro": "https://files.cdn.printful.com/files/8db/8db1cc2079d303be5d3b6f53004d4ee3_preview.png",
        "iPhone 15 Pro Max": "https://files.cdn.printful.com/files/f67/f67345ca9df316ca603f2ef67254fc5b_preview.png",
        "iPhone 16": "https://files.cdn.printful.com/files/cf1/cf16e62e13583919a6510f4d4d1d26fc_preview.png",
        "iPhone 16 Plus": "https://files.cdn.printful.com/files/a7a/a7a983de4bcd78da2cc7ebd29a6e2439_preview.png",
        "iPhone 16 Pro": "https://files.cdn.printful.com/files/043/043404154d5b212fbad022cf2431591a_preview.png",
        "iPhone 16 Pro Max": "https://files.cdn.printful.com/files/280/2804bdf971f6f62c2bf970ddb413b34b_preview.png",
        "iPhone 17": "https://files.cdn.printful.com/files/a34/a34615f6de1b86c30e97b6697c9c232c_preview.png",
        "iPhone 17 Air": "https://files.cdn.printful.com/files/6e2/6e2efa5c4bb5b618d475d2a1b13f37ac_preview.png",
        "iPhone 17 Pro": "https://files.cdn.printful.com/files/92d/92d0f66c644ebedc61016c08686f3d8f_preview.png",
        "iPhone 17 Pro Max": "https://files.cdn.printful.com/files/b29/b296e2ccf7f4c2bfc95faccc20ecbd17_preview.png",
        "iPhone 18 Pro": "https://files.cdn.printful.com/files/92d/92d0f66c644ebedc61016c08686f3d8f_preview.png",
        "iPhone 18 Pro Max": "https://files.cdn.printful.com/files/b29/b296e2ccf7f4c2bfc95faccc20ecbd17_preview.png",
      },
      "Espresso": {
        "iPhone 14": "https://files.cdn.printful.com/files/6ba/6ba01b06fb44afa5630efafb59059050_preview.png",
        "iPhone 14 Plus": "https://files.cdn.printful.com/files/0b9/0b94d432e3afa480c32553fddb9f16f7_preview.png",
        "iPhone 14 Pro": "https://files.cdn.printful.com/files/908/90845992177d1187e4bd8241bb3e1606_preview.png",
        "iPhone 14 Pro Max": "https://files.cdn.printful.com/files/d57/d57dc58a2cece06e0157ac9af3299ffe_preview.png",
        "iPhone 15": "https://files.cdn.printful.com/files/dfa/dfa2a7b2d4a3c22a98391e7b1a55aa15_preview.png",
        "iPhone 15 Plus": "https://files.cdn.printful.com/files/5c8/5c85445617721689cb6ec8301b681b1e_preview.png",
        "iPhone 15 Pro": "https://files.cdn.printful.com/files/8fd/8fdb1d9c9e671854c4ffbfe3d48b476a_preview.png",
        "iPhone 15 Pro Max": "https://files.cdn.printful.com/files/919/9197a35b55bdabb46ef08c10b3bb2c75_preview.png",
        "iPhone 16": "https://files.cdn.printful.com/files/2c8/2c81b548f07d3910c2242e6dad5f5296_preview.png",
        "iPhone 16 Plus": "https://files.cdn.printful.com/files/ad9/ad92033ebb56c41bf421f83b2f1587df_preview.png",
        "iPhone 16 Pro": "https://files.cdn.printful.com/files/e9f/e9f02131146735b5c40ce5e51eea24f0_preview.png",
        "iPhone 16 Pro Max": "https://files.cdn.printful.com/files/7eb/7ebe83772f5af78f0ded52de0e7f24fa_preview.png",
        "iPhone 17": "https://files.cdn.printful.com/files/6c9/6c9662756fe1d6aea720256ac08179d1_preview.png",
        "iPhone 17 Air": "https://files.cdn.printful.com/files/9d3/9d37fec3154670cfc6f5a916600bd73e_preview.png",
        "iPhone 17 Pro": "https://files.cdn.printful.com/files/5d1/5d112d06f306ac08a14c1ff39e98df67_preview.png",
        "iPhone 17 Pro Max": "https://files.cdn.printful.com/files/ab3/ab388c5c420e4ba6bd843fa93221f401_preview.png",
        "iPhone 18 Pro": "https://files.cdn.printful.com/files/5d1/5d112d06f306ac08a14c1ff39e98df67_preview.png",
        "iPhone 18 Pro Max": "https://files.cdn.printful.com/files/ab3/ab388c5c420e4ba6bd843fa93221f401_preview.png",
      },
    },
    colorSwatches: {
      "Black": "https://files.cdn.printful.com/files/cfe/cfe92b997631c49642cb842a6d911845_thumb.png",
      "Burgundy": "https://files.cdn.printful.com/files/395/395cf528ebb0aaa6fd2530acb087be93_thumb.png",
      "Navy": "https://files.cdn.printful.com/files/aaf/aaf5dc8b3ce809705c31300180485796_thumb.png",
      "Hunter": "https://files.cdn.printful.com/files/e0d/e0d531ea691480972949b2cf4cc48408_thumb.png",
      "Grape": "https://files.cdn.printful.com/files/1fe/1fe4b88d136827c6f2be81865e2698fd_thumb.png",
      "Gold": "https://files.cdn.printful.com/files/1eb/1ebae1c742f2720d10cee784f36fb174_thumb.png",
      "Burnt Orange": "https://files.cdn.printful.com/files/a14/a147f44c0b9475e0f8e6f9a69ca691b5_thumb.png",
      "Espresso": "https://files.cdn.printful.com/files/6ba/6ba01b06fb44afa5630efafb59059050_thumb.png",
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
    image: "https://files.cdn.printful.com/files/ac5/ac5f5ee092884739f208a5b1b8b09537_preview.png",
    colors: ["Black", "Burgundy", "Navy", "Hunter", "Grape", "Gold", "Burnt Orange", "Espresso"],
    sizes: ["13″", "15″"],
    colorImages: {
      "Black": {
        "13″": "https://files.cdn.printful.com/files/ac5/ac5f5ee092884739f208a5b1b8b09537_preview.png",
        "15″": "https://files.cdn.printful.com/files/21a/21a240d7caa5af77f0fea9ef1652ec96_preview.png",
      },
      "Burgundy": {
        "13″": "https://files.cdn.printful.com/files/424/424e3d35abb05da320c39f248b28615c_preview.png",
        "15″": "https://files.cdn.printful.com/files/3df/3dfac0d4256a87ca4d64c73ed17b5268_preview.png",
      },
      "Navy": {
        "13″": "https://files.cdn.printful.com/files/011/011e71ce6761fb20a1130c93a6af7045_preview.png",
        "15″": "https://files.cdn.printful.com/files/1a0/1a0705fa51fd85c3a1af9a02b0e2ab32_preview.png",
      },
      "Hunter": {
        "13″": "https://files.cdn.printful.com/files/fbc/fbc42251e5920b96fd8519c096f7551e_preview.png",
        "15″": "https://files.cdn.printful.com/files/d18/d18ed897a396833efb38942e91d5a69e_preview.png",
      },
      "Grape": {
        "13″": "https://files.cdn.printful.com/files/1d3/1d3412388612b399d9691cf96995f8b5_preview.png",
        "15″": "https://files.cdn.printful.com/files/78e/78e4544457acfd98cb26e0a10d1095d0_preview.png",
      },
      "Gold": {
        "13″": "https://files.cdn.printful.com/files/58b/58bfa62f26170904123d3ae01fc869ca_preview.png",
        "15″": "https://files.cdn.printful.com/files/31f/31f055f40b90225b1655657e80418c83_preview.png",
      },
      "Burnt Orange": {
        "13″": "https://files.cdn.printful.com/files/a36/a360f3ec249f3990c91127c1fc831c86_preview.png",
        "15″": "https://files.cdn.printful.com/files/168/168bd488fc46dd63d1581448739c4caa_preview.png",
      },
      "Espresso": {
        "13″": "https://files.cdn.printful.com/files/c7c/c7caa6e77245c09d4a73f6b583f485e3_preview.png",
        "15″": "https://files.cdn.printful.com/files/43d/43d449049045cdf14eb4391cdcbab79d_preview.png",
      },
    },
    colorSwatches: {
      "Black": "https://files.cdn.printful.com/files/ac5/ac5f5ee092884739f208a5b1b8b09537_thumb.png",
      "Burgundy": "https://files.cdn.printful.com/files/424/424e3d35abb05da320c39f248b28615c_thumb.png",
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
    image: "https://files.cdn.printful.com/files/dfe/dfe0bcb6a65f680f09a3e3d2a66863b6_preview.png",
    colors: ["Black", "Burgundy", "Navy", "Hunter", "Grape", "Gold", "Burnt Orange", "Espresso"],
    sizes: ["14″×14″", "16″×16″", "18″×18″", "20″×12″", "22″×22″"],
    colorImages: {
      "Black": {
        "14″×14″": "https://files.cdn.printful.com/files/dfe/dfe0bcb6a65f680f09a3e3d2a66863b6_preview.png",
        "16″×16″": "https://files.cdn.printful.com/files/60c/60cb2d85fe144d4f166f7b46a3a67c7d_preview.png",
        "18″×18″": "https://files.cdn.printful.com/files/8b4/8b4d020d076d60007a04ac34b01c7f5d_preview.png",
        "20″×12″": "https://files.cdn.printful.com/files/86a/86ab12d3fd00e67f9decdf7d6e6ad6a2_preview.png",
        "22″×22″": "https://files.cdn.printful.com/files/9bf/9bf2f717045c436d7b501c3afdb72a10_preview.png",
      },
      "Burgundy": {
        "14″×14″": "https://files.cdn.printful.com/files/924/9248b6969cc24fac74befbec9f6a081c_preview.png",
        "16″×16″": "https://files.cdn.printful.com/files/307/307d9e3af0d14c61a1759641204d0080_preview.png",
        "18″×18″": "https://files.cdn.printful.com/files/f2c/f2c38da26ffb451591abcfba80a90dc4_preview.png",
        "20″×12″": "https://files.cdn.printful.com/files/3e6/3e6504d56a615900edae1e2143b6db06_preview.png",
        "22″×22″": "https://files.cdn.printful.com/files/ae9/ae9534dee80d3423abd615f7387aea8c_preview.png",
      },
      "Navy": {
        "14″×14″": "https://files.cdn.printful.com/files/033/03371df4f6e13e376b3f4c379ed165cc_preview.png",
        "16″×16″": "https://files.cdn.printful.com/files/782/78230029576968f62438dece6fafd7fe_preview.png",
        "18″×18″": "https://files.cdn.printful.com/files/cb3/cb391ac406394cda7bf0a8bb2bbb1170_preview.png",
        "20″×12″": "https://files.cdn.printful.com/files/e53/e533cdbd4538a427f2a2348cf3e24c96_preview.png",
        "22″×22″": "https://files.cdn.printful.com/files/928/9289e8685e4601d59a8f75b723edb013_preview.png",
      },
      "Hunter": {
        "14″×14″": "https://files.cdn.printful.com/files/312/312509d640b4b7f50c39f0d14cc3ae80_preview.png",
        "16″×16″": "https://files.cdn.printful.com/files/8d7/8d7dc786870d965407134a2ea2057e7b_preview.png",
        "18″×18″": "https://files.cdn.printful.com/files/1fc/1fc69120d0684b86f3983cc9b88ac88f_preview.png",
        "20″×12″": "https://files.cdn.printful.com/files/a95/a95b22d1fb16c1d1c680744caca8d411_preview.png",
        "22″×22″": "https://files.cdn.printful.com/files/e4b/e4b34e39bf4781e4681ea0b097c39e98_preview.png",
      },
      "Grape": {
        "14″×14″": "https://files.cdn.printful.com/files/7ae/7ae5817a10258f88c406e8cc820bc6c4_preview.png",
        "16″×16″": "https://files.cdn.printful.com/files/b7d/b7d4fc2ff7f24caa4dfe5bc910755634_preview.png",
        "18″×18″": "https://files.cdn.printful.com/files/e40/e40e9303dfa61aed7676bbdcfd42581e_preview.png",
        "20″×12″": "https://files.cdn.printful.com/files/26d/26d33926ac040e7c241d6db6bc08b35b_preview.png",
        "22″×22″": "https://files.cdn.printful.com/files/6be/6be2b4e714abae55111d4976ea785bf7_preview.png",
      },
      "Gold": {
        "14″×14″": "https://files.cdn.printful.com/files/d89/d897c361c25fc0c5a0a09c6d7ec22fdd_preview.png",
        "16″×16″": "https://files.cdn.printful.com/files/0c0/0c0bc4406559fe6fd77c0ea3c46c91f8_preview.png",
        "18″×18″": "https://files.cdn.printful.com/files/6d7/6d7743bb574c52136e92b95938bb7212_preview.png",
        "20″×12″": "https://files.cdn.printful.com/files/5a4/5a49fa9526de78223ef09b3d454bdb26_preview.png",
        "22″×22″": "https://files.cdn.printful.com/files/c87/c87700d640680f97ab5c6f843c065ea9_preview.png",
      },
      "Burnt Orange": {
        "14″×14″": "https://files.cdn.printful.com/files/f0a/f0a4290bca25d438bbc61088fb37e8d7_preview.png",
        "16″×16″": "https://files.cdn.printful.com/files/f7a/f7a69455f6837db49d69b2437bf80315_preview.png",
        "18″×18″": "https://files.cdn.printful.com/files/005/005d92536dca23a0ae9c1244146d0146_preview.png",
        "20″×12″": "https://files.cdn.printful.com/files/2b3/2b30f75ddc058a72c6ba585c2155a6c0_preview.png",
        "22″×22″": "https://files.cdn.printful.com/files/887/8876f870f87f4b7eb25c8d4ea926856b_preview.png",
      },
      "Espresso": {
        "14″×14″": "https://files.cdn.printful.com/files/6cc/6cc8d83ce8c0038fd71e9263308a8d79_preview.png",
        "16″×16″": "https://files.cdn.printful.com/files/860/86056fc2526392a8ae54cdc24c21da04_preview.png",
        "18″×18″": "https://files.cdn.printful.com/files/e67/e674ca6fdeb2b3cde16ac8b5d2cad75f_preview.png",
        "20″×12″": "https://files.cdn.printful.com/files/ea4/ea4867296f74bdf43440da1b915aa9ae_preview.png",
        "22″×22″": "https://files.cdn.printful.com/files/d28/d281fc845f09e18a1200c19552011dd2_preview.png",
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
    id: "0003",
    sku: "0003",
    stock: { "Red": 67, "Blue": 58, "Purple": 67, "Teal": 74, "Black": 0 },
    name: "CIG Pillow Case",
    shipping: "pillow", // US only
    price: 20.00,
    salePrice: 10.00,
    image: "assets/products/pillow-black.jpg",
    colors: ["Red", "Blue", "Purple", "Teal", "Black"],
    sizes: [],
    colorImages: {
      "Red": "assets/products/pillow-red.jpg",
      "Blue": "assets/products/pillow-blue.jpg",
      "Purple": "assets/products/pillow-purple.jpg",
      "Teal": "assets/products/pillow-teal.jpg",
      "Black": "assets/products/pillow-black.jpg",
    },
  },
  {
    id: "0004",
    sku: "0004",
    name: "CIG Silky Bonnet & Durag",
    image: "assets/products/bonnet-set-red.jpg",
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
    stock: { "Blue": 30, "Red": 34, "Gold": 22 },
    name: "CIG Paisley Balaclava",
    price: 50.00,
    salePrice: null,
    image: "assets/products/balaclava-blue-front.jpg",
    colors: ["Blue", "Red", "Gold"],
    sizes: [],
    colorImages: {
      "Blue": "assets/products/balaclava-blue-front.jpg",
      "Red": "assets/products/balaclava-red-front-upright.jpg",
      "Gold": "assets/products/balaclava-gold-front-upright.jpg",
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
    stock: {
      "Blue":  { "1-Hole": 51, "3-Hole": 62, "Skully": 0 },
      "Red":   { "1-Hole": 58, "3-Hole": 79, "Skully": 0 },
      "Green": { "1-Hole": 70, "3-Hole": 74, "Skully": 0 },
      "Gold":  { "1-Hole": 70, "3-Hole": 80, "Skully": 0 },
    },
    name: "CIG Acrylic Ski Mask",
    price: 50.00,
    salePrice: null,
    image: "assets/products/skimask-blue-1hole.jpg",
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
    id: "0009",
    sku: "0009",
    comingSoon: true,
    name: "CIG Metallic Puffer Jacket",
    price: 150.00,
    salePrice: null,
    image: "assets/products/puffer-jacket-front.jpg",
    colors: ["Blue"],
    sizes: [],
    colorImages: {
      "Blue": "assets/products/puffer-jacket-front.jpg",
    },
    gallery: {
      "Blue": ["assets/products/puffer-jacket-back.jpg", "assets/products/puffer-jacket-lining.jpg"],
    },
  },
  {
    id: "0010",
    sku: "0010",
    stock: { "Blue": 2, "Green": 0, "Red": 2, "Rainbow": 6 },
    name: "CIG Toile Umbrella",
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
    name: "CIG Paisley Bikini",
    image: "assets/products/bandana-top-red-front.jpg",
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
const POD_CARD_ONLY = true;

// Crypto checkout (Coinbase Commerce) is off: CIG decided 2026-10-21 to set
// it up later under a new LLC. One switch for the site and the server.
const CRYPTO_ENABLED = false;

if (typeof module !== "undefined" && module.exports) {
  module.exports = { CRYPTO_ENABLED, DROP_AT, POD_CARD_ONLY, PRODUCTS };
}
