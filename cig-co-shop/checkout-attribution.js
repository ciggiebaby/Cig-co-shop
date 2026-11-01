// Marketing attribution for checkout (BG's "which link sold it").
// Captures ?src= (ig, tiktok, x, arcade, qr, fani...) and utm_* tags from the
// landing URL, keeps them for the tab (sessionStorage, last touch wins), and
// app.js sends them to create-stripe-session / create-paypal-order as
// `attribution`. The server re-validates everything (netlify/lib/attribution.js).
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CIGAttribution = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var KEYS = ["src", "utm_source", "utm_medium", "utm_campaign", "utm_content"];
  var STORAGE_KEY = "cig_checkout_attribution";

  function clean(value) {
    if (typeof value !== "string") return null;
    var v = value.trim().toLowerCase().slice(0, 80);
    return /^[a-z0-9][a-z0-9_.\-]*$/.test(v) ? v : null;
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

  // Returns the attribution for this tab, saving fresh URL tags if present.
  function capture(href, storage) {
    var found = fromUrl(href);
    try {
      if (Object.keys(found).length) {
        if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(found));
        return found;
      }
      var saved = storage ? JSON.parse(storage.getItem(STORAGE_KEY) || "null") : null;
      var out = {};
      if (saved && typeof saved === "object") {
        KEYS.forEach(function (k) {
          var v = clean(saved[k]);
          if (v) out[k] = v;
        });
      }
      return out;
    } catch (e) {
      return found;
    }
  }

  function current() {
    if (typeof window === "undefined") return {};
    var storage = null;
    try { storage = window.sessionStorage; } catch (e) {}
    return capture(window.location && window.location.href, storage);
  }

  // Save on page load so the tag survives navigating away from the landing URL.
  if (typeof window !== "undefined") current();

  return { KEYS: KEYS, STORAGE_KEY: STORAGE_KEY, clean: clean, fromUrl: fromUrl, capture: capture, current: current };
});
