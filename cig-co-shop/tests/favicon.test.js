// Favicon (CIG 10/22: browser tab icon from the CIG logo). The official CIG badge
// (vector trace of CIG's cig-transparent.png) as a yellow tile with a black outline, on every page.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f));
const pages = fs.readdirSync(root).filter((f) => f.endsWith(".html"));

function pngSize(buf) {
  assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "PNG signature");
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

const TAGS = [
  '<link rel="icon" href="/favicon.ico" sizes="48x48" />',
  '<link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
  '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />',
  '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />',
  '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
  '<link rel="manifest" href="/site.webmanifest" />',
];

test("every page links the favicon set in its <head>", () => {
  assert.deepEqual(pages.sort(), ["arcade.html", "faq.html", "gallery.html", "index.html", "shipping-returns.html"]);
  for (const f of pages) {
    const html = read(f).toString("utf8");
    const head = html.slice(0, html.indexOf("</head>"));
    for (const tag of TAGS) assert.equal(head.split(tag).length - 1, 1, `${f}: ${tag}`);
  }
});

test("the policy page generator keeps the favicon tags", () => {
  const script = read("scripts/build-policy-pages.py").toString("utf8");
  for (const tag of TAGS) assert.ok(script.includes(tag), tag);
});

test("favicon PNGs exist at the right sizes", () => {
  const want = { "favicon-16x16.png": 16, "favicon-32x32.png": 32, "apple-touch-icon.png": 180, "android-chrome-192x192.png": 192, "android-chrome-512x512.png": 512 };
  for (const [f, s] of Object.entries(want)) assert.deepEqual(pngSize(read(f)), [s, s], f);
});

test("favicon.ico holds 16, 32 and 48 px icons", () => {
  const buf = read("favicon.ico");
  assert.equal(buf.readUInt16LE(0), 0);
  assert.equal(buf.readUInt16LE(2), 1, "icon type");
  const n = buf.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < n; i++) sizes.push(buf[6 + i * 16] || 256);
  assert.deepEqual(sizes.sort((a, b) => a - b), [16, 32, 48]);
});

test("favicon.svg is the official yellow CIG badge (black outline, real lettering)", () => {
  const svg = read("favicon.svg").toString("utf8");
  assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 512 512">/);
  assert.match(svg, /fill="#FBCC2A"/);
  assert.match(svg, /fill="#09090A"/);
  assert.match(svg, /<path /);
  assert.ok(svg.length < 10 * 1024);
});

test("site.webmanifest is valid and its icons exist", () => {
  const m = JSON.parse(read("site.webmanifest").toString("utf8"));
  assert.equal(m.name, "CIG & CO.");
  assert.deepEqual(m.icons.map((i) => i.sizes), ["192x192", "512x512"]);
  for (const icon of m.icons) {
    const s = Number(icon.sizes.split("x")[0]);
    assert.deepEqual(pngSize(read(icon.src.replace(/^\//, ""))), [s, s], icon.src);
  }
});

test("apple-touch-icon has a solid background (no transparency)", () => {
  const buf = read("apple-touch-icon.png");
  // IHDR color type 2 = truecolor without alpha.
  assert.equal(buf[25], 2);
});
