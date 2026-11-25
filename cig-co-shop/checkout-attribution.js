// Marketing attribution for checkout (which link sold it).
// Captures ?src= (ig, tiktok, x, arcade, qr, fani...) and utm_* tags from the
// landing URL. The first valid set is kept for 30 days in localStorage (first
// touch). A later link in that window does not replace it. The slug rule
// matches track-visit.js. app.js sends the tags to create-stripe-session and
// create-paypal-order as `attribution`. The server checks them again
// (netlify/lib/attribution.js). A missing or broken store never throws.
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CIGAttribution = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var KEYS = ["src", "utm_source", "utm_medium", "utm_campaign", "utm_content"];
  var STORAGE_KEY = "cig_checkout_attribution";
  var TTL_MS = 30 * 24 * 60 * 60 * 1000;
  var SLUG = /^[A-Za-z0-9._~+\- ]+$/;
  var MAX = 80;

  function clean(value) {
    if (typeof value !== "string") return null;
    var v = value.trim().slice(0, MAX);
    return v && SLUG.test(v) ? v : null;
  }

  function cleanTags(input) {
    var out = {};
    if (!input || typeof input !== "object") return out;
    KEYS.forEach(function (k) {
      var v = clean(input[k]);
      if (v) out[k] = v;
    });
    return out;
  }

  function fromUrl(href) {
    var out = {};
    try {
      var params = new URL(href).searchParams;
      KEYS.forEach(function (k) {
        var v = clean(params.get(k));
        if (v) out[k] = v;
      });
    } catch (e) {}
    return out;
  }

  function writeTags(storage, tags, now) {
    if (!storage || typeof storage.setItem !== "function") return;
    storage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: now, tags: tags }));
  }

  function dropStored(storage) {
    try {
      if (storage && typeof storage.removeItem === "function") storage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  // Saved first-touch tags, or null when missing, expired, or not a tag set.
  // A flat map from the old sessionStorage shape is adopted as of `now`.
  function storedTags(storage, now) {
    try {
      if (!storage || typeof storage.getItem !== "function") return null;
      var raw = storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
      if (saved.tags && typeof saved.savedAt === "number" && isFinite(saved.savedAt)) {
        if (saved.savedAt > now + 24 * 60 * 60 * 1000 || now - saved.savedAt > TTL_MS) {
          dropStored(storage);
          return null;
        }
        var tags = cleanTags(saved.tags);
        return Object.keys(tags).length ? tags : null;
      }
      var legacy = cleanTags(saved);
      if (!Object.keys(legacy).length) return null;
      writeTags(storage, legacy, now);
      return legacy;
    } catch (e) {
      return null;
    }
  }

  // Returns the attribution to send with checkout. Fresh URL tags are saved
  // only when nothing valid is stored yet.
  function capture(href, storage, now) {
    var clock = typeof now === "number" ? now : Date.now();
    var found = fromUrl(href);
    try {
      var saved = storedTags(storage, clock);
      if (saved) return saved;
      if (Object.keys(found).length) {
        try { writeTags(storage, found, clock); } catch (e) {}
        return found;
      }
      return {};
    } catch (e) {
      return found;
    }
  }

  function safeGet(storage) {
    try { return storage && storage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function current() {
    if (typeof window === "undefined") return {};
    var local = null;
    var session = null;
    try { local = window.localStorage; } catch (e) {}
    try { session = window.sessionStorage; } catch (e) {}
    var primary = local || session;
    // Same key used to live in sessionStorage for the tab. Move it once so a
    // buyer who landed before this change still gets credit in this tab.
    if (local && session && !safeGet(local)) {
      var legacy = null;
      try { legacy = session.getItem(STORAGE_KEY); } catch (e) {}
      if (legacy) {
        try { local.setItem(STORAGE_KEY, legacy); }
        catch (e) { primary = session; }
      }
    }
    return capture(window.location && window.location.href, primary);
  }

  if (typeof window !== "undefined") {
    try { current(); } catch (e) {}
  }

  return {
    KEYS: KEYS,
    STORAGE_KEY: STORAGE_KEY,
    TTL_MS: TTL_MS,
    clean: clean,
    fromUrl: fromUrl,
    capture: capture,
    current: current,
  };
});
