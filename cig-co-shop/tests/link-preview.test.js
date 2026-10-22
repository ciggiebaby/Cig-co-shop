// Link previews (iMessage, X, Slack…) show the FW26/27 collection, not the old
// "Archive Collection" card.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const meta = (html, attr, name) => {
  const m = html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`));
  return m && m[1];
};

test("homepage title, description and og/twitter tags point at FW26/27", () => {
  const html = read("index.html");
  assert.match(html, /<title>CIG &amp; CO\. — FW26\/27 Collection<\/title>/);
  assert.equal(meta(html, "name", "description"), "FW26/27 Collection drops Fri, Oct 30 at 12 PM ET.");
  assert.equal(meta(html, "property", "og:title"), "CIG &amp; CO. — FW26/27 Collection");
  assert.equal(meta(html, "property", "og:description"), "FW26/27 Collection drops Fri, Oct 30 at 12 PM ET.");
  assert.equal(meta(html, "property", "og:url"), "https://cigcompany.com/");
  assert.equal(meta(html, "property", "og:image"), "https://cigcompany.com/assets/og-fw26.jpg");
  assert.equal(meta(html, "property", "og:image:width"), "1200");
  assert.equal(meta(html, "property", "og:image:height"), "630");
  assert.equal(meta(html, "name", "twitter:card"), "summary_large_image");
  assert.equal(meta(html, "name", "twitter:image"), "https://cigcompany.com/assets/og-fw26.jpg");
  assert.match(html, /DRAFT/);
});

test("no page still says Archive Collection or uses the old og card; the new card is a 1200x630 JPG under 300 KB", () => {
  for (const f of ["index.html", "gallery.html", "arcade.html"]) {
    const html = read(f);
    assert.doesNotMatch(html, /Archive Collection|og-card\.jpg/, f);
    assert.equal(meta(html, "property", "og:image"), "https://cigcompany.com/assets/og-fw26.jpg", f);
  }
  const jpg = fs.readFileSync(path.join(root, "assets/og-fw26.jpg"));
  assert.ok(jpg.length < 300 * 1024);
  assert.equal(jpg.readUInt16BE(0), 0xffd8);
  // Find the SOF0/SOF2 marker for the pixel size.
  let i = 2;
  while (i < jpg.length) {
    const marker = jpg.readUInt16BE(i);
    if (marker === 0xffc0 || marker === 0xffc2) {
      assert.deepEqual([jpg.readUInt16BE(i + 7), jpg.readUInt16BE(i + 5)], [1200, 630]);
      return;
    }
    i += 2 + jpg.readUInt16BE(i + 2);
  }
  assert.fail("no SOF marker");
});
