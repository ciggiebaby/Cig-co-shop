// CIG & CO. — product catalog
// Edit this file to add/remove/update backstock. Each product needs a unique id.
// image: put your real product photo in /assets/products/ and reference it here.
// colors/sizes are optional — leave the array empty ([]) if a product has none.

const PRODUCTS = [
  {
    id: "0003",
    sku: "0003",
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
];
