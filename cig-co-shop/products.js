// CIG & CO. — product catalog
// Edit this file to add/remove/update backstock. Each product needs a unique id.
// image: put your real product photo in /assets/products/ and reference it here.
// colors/sizes are optional — leave the array empty ([]) if a product has none.

const PRODUCTS = [
  {
    id: "0003",
    sku: "0003",
    stock: { "Red": 67, "Blue": 58, "Purple": 67, "Teal": 74, "Black": 18 },
    name: "CIG Pillow Case",
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
    name: "His and Hers Silky & Bonnet (Single)",
    price: 12.00,
    salePrice: null,
    image: "assets/products/bonnet-blue.jpg",
    colors: ["Blue", "Gold", "Black", "Red", "Pink"],
    sizes: [],
    colorImages: {
      "Blue": "assets/products/bonnet-blue.jpg",
      "Gold": "assets/products/bonnet-gold.jpg",
      "Black": "assets/products/bonnet-black.jpg",
      "Red": "assets/products/bonnet-red.jpg",
      "Pink": "assets/products/bonnet-pink.jpg",
    },
  },
  {
    id: "0005",
    sku: "0005",
    stock: { "Black": 0, "Blue": 68, "Red": 70 },
    name: "CIG Paisley Balaclava",
    price: 50.00,
    salePrice: null,
    image: "assets/products/balaclava-black.jpg",
    colors: ["Black", "Blue", "Red"],
    sizes: [],
    colorImages: {
      "Black": "assets/products/balaclava-black.jpg",
      "Blue": "assets/products/balaclava-blue.jpg",
      "Red": "assets/products/balaclava-red.jpg",
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
      "Green": ["assets/products/skimask-green-back.jpg"],
      "Gold": ["assets/products/skimask-gold-back.jpg"],
    },
  },
  {
    id: "0009",
    sku: "0009",
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
        "Red":   { "XS": 5, "S": 5, "M": 5, "L": 5, "XL": 5 },
        "Pink":  { "XS": 5, "S": 5, "M": 5, "L": 5, "XL": 5 },
        "Green": { "XS": 5, "S": 5, "M": 5, "L": 5, "XL": 5 },
      },
      "Top": {
        "Red":   { "XS": 5, "S": 5, "M": 5, "L": 5, "XL": 5 },
        "Pink":  { "XS": 5, "S": 5, "M": 5, "L": 5, "XL": 5 },
        "Green": { "XS": 5, "S": 5, "M": 5, "L": 5, "XL": 5 },
      },
      "Bottom": {
        "Red":   { "XS": 5, "S": 5, "M": 5, "L": 5, "XL": 5 },
        "Pink":  { "XS": 5, "S": 5, "M": 5, "L": 5, "XL": 5 },
        "Green": { "XS": 5, "S": 5, "M": 5, "L": 5, "XL": 5 },
      },
    },
  },
];
