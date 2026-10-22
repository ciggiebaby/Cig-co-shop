// FW26/27 drop hero: countdown to DROP_AT and the automatic switch to "live".
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { DROP_AT } = require("../products.js");
const { dropCountdownParts, renderDropHero, startDropHero } = require("../drop-hero.js");

const DROP_MS = Date.parse(DROP_AT);

function fakeHero() {
  const units = {};
  const whens = [
    { when: "upcoming", hidden: false },
    { when: "live", hidden: true },
    { when: "upcoming", hidden: false },
    { when: "live", hidden: true },
    { when: "upcoming", hidden: false },
  ].map((w) => ({ ...w, getAttribute: () => w.when }));
  const attrs = {};
  return {
    attrs, units, whens,
    setAttribute(k, v) { attrs[k] = v; },
    querySelector(sel) {
      const unit = sel.match(/data-unit="(\w+)"/)[1];
      units[unit] = units[unit] || { textContent: "" };
      return units[unit];
    },
    querySelectorAll() { return whens; },
  };
}
const shown = (hero) => [...new Set(hero.whens.filter((w) => !w.hidden).map((w) => w.when))];

test("the hero counts down to the shared DROP_AT (Fri Oct 30 12:00 PM ET)", () => {
  assert.equal(DROP_AT, "2026-10-30T12:00:00-04:00");
  assert.equal(DROP_MS, Date.parse("2026-10-30T16:00:00Z"));
  const oneDay2h3m4s = ((24 + 2) * 3600 + 3 * 60 + 4) * 1000;
  assert.deepEqual(dropCountdownParts(DROP_MS, DROP_MS - oneDay2h3m4s), { live: false, days: 1, hours: 2, minutes: 3, seconds: 4 });
  assert.deepEqual(dropCountdownParts(DROP_MS, DROP_MS - 1), { live: false, days: 0, hours: 0, minutes: 0, seconds: 0 });
  assert.equal(dropCountdownParts(DROP_MS, DROP_MS).live, true);
  assert.equal(dropCountdownParts(DROP_MS, DROP_MS + 5000).seconds, 0);
});

test("before the drop: countdown, 'Shop the collection' and the signup show", () => {
  const hero = fakeHero();
  assert.equal(renderDropHero(hero, DROP_MS, DROP_MS - ((8 * 24 + 5) * 3600 + 7 * 60 + 9) * 1000), false);
  assert.equal(hero.attrs["data-state"], "upcoming");
  assert.deepEqual(shown(hero), ["upcoming"]);
  assert.deepEqual([hero.units.days.textContent, hero.units.hours.textContent, hero.units.minutes.textContent, hero.units.seconds.textContent], ["8", "05", "07", "09"]);
});

test("the hero switches to live on its own when the clock passes DROP_AT", () => {
  const hero = fakeHero();
  let now = DROP_MS - 2500;
  let tick = null;
  let cleared = false;
  let wentLive = 0;
  startDropHero(hero, DROP_AT, {
    now: () => now,
    setIntervalImpl: (fn, ms) => { assert.equal(ms, 1000); tick = fn; return 7; },
    clearIntervalImpl: (id) => { assert.equal(id, 7); cleared = true; },
    onLive: () => { wentLive += 1; },
  });
  assert.equal(hero.attrs["data-state"], "upcoming");
  assert.equal(hero.units.seconds.textContent, "02");
  now += 1000; tick();
  assert.equal(hero.attrs["data-state"], "upcoming");
  now += 1500; tick();
  assert.equal(hero.attrs["data-state"], "live");
  assert.deepEqual(shown(hero), ["live"]);
  assert.equal(cleared, true);
  assert.equal(wentLive, 1);
});

test("after the drop the hero opens live with no timer", () => {
  const hero = fakeHero();
  const timer = startDropHero(hero, DROP_AT, { now: () => DROP_MS + 60000, setIntervalImpl: () => { throw new Error("no timer"); } });
  assert.equal(timer, null);
  assert.equal(hero.attrs["data-state"], "live");
});

test("homepage hero markup: title, countdown, both CTAs to #shop, signup, video slot, draft note", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const hero = html.slice(html.indexOf('<!-- FW26/27 drop hero'), html.indexOf('<section id="shop"'));
  assert.ok(html.indexOf('id="drop-hero"') < html.indexOf('id="shop"'));
  assert.match(hero, /<h1[^>]*>FW26\/27 COLLECTION<\/h1>/);
  for (const unit of ["days", "hours", "minutes", "seconds"]) assert.match(hero, new RegExp(`data-unit="${unit}"`));
  assert.match(hero, /<a href="#shop"[^>]*data-when="upcoming">Shop the collection<\/a>/);
  assert.match(hero, /<a href="#shop"[^>]*data-when="live" hidden>Shop now<\/a>/);
  assert.match(hero, /<form class="drop-signup" id="drop-signup" data-when="upcoming"/);
  assert.match(hero, /data-video-slot="fw26-hero"/);
  assert.match(hero, /16:9/);
  assert.match(hero, /9:16/);
  assert.match(hero, /DRAFT COPY/);
  assert.match(hero, /hero-lineup-wide\.webp/);
  assert.match(hero, /hero-lineup-mobile\.webp/);
  assert.match(html, /<script src="products\.js"><\/script>[\s\S]*<script src="drop-hero\.js"><\/script>/);
  for (const f of ["hero-lineup-wide.webp", "hero-lineup-mobile.webp"]) {
    assert.ok(fs.statSync(path.join(__dirname, "..", "assets/products/fw26", f)).size < 400 * 1024, f);
  }
});
