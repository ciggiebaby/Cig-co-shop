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
// POD_CARD_ONLY (bottom of this file): while true, carts with any `pod` item can
//   only be paid by card (PayPal and crypto refuse them, on the site and on the
//   server). Flip it to false to allow PayPal/crypto for made-to-order items.

const PRODUCTS = [
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = { POD_CARD_ONLY, PRODUCTS };
}
