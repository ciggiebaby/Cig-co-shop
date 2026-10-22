// "Get notified" signup: Kit with the existing Marketing opt-in tag only.
const assert = require("node:assert/strict");
const test = require("node:test");
const { createHandler } = require("../netlify/functions/drop-signup.js");

const ENV = { KIT_API_KEY: "kit-test", KIT_MARKETING_OPT_IN_TAG_ID: "111", KIT_ARCADE_TAG_ID: "222", KIT_CHECKOUT_TAG_ID: "333", SUPABASE_SECRET_KEY: "s" };
const post = (body) => ({ httpMethod: "POST", headers: { "x-nf-client-connection-ip": "1.2.3.4" }, body: JSON.stringify(body) });
const quiet = { error() {} };

function setup({ allowed = true, suppressed = false, env = ENV } = {}) {
  const calls = { tags: [], upserts: [], limits: [] };
  const handler = createHandler({
    environment: env,
    logger: quiet,
    storeFactory: () => ({ checkArcadeRateLimit: async (...a) => { calls.limits.push(a); return allowed; } }),
    kitFactory: ({ apiKey }) => {
      assert.equal(apiKey, "kit-test");
      return {
        upsertSubscriber: async (s) => { calls.upserts.push(s); return { subscriber: { id: 42 }, suppressed }; },
        addTags: async (id, tags) => { calls.tags.push([id, tags]); },
      };
    },
  });
  return { handler, calls };
}

test("signs the email up in Kit with only the Marketing opt-in tag", async () => {
  const { handler, calls } = setup();
  const res = await handler(post({ email: "  Fan@Example.com ", marketingConsent: true }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.upserts, [{ email: "fan@example.com", firstName: null }]);
  assert.deepEqual(calls.tags, [[42, ["111"]]]);
  assert.equal(calls.limits[0][1], 5);
});

test("leaves unsubscribed Kit contacts alone but answers the same", async () => {
  const { handler, calls } = setup({ suppressed: true });
  const res = await handler(post({ email: "gone@example.com", marketingConsent: true }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.tags, []);
});

test("rejects bad input, missing consent, non-POST, rate limits and missing tag config", async () => {
  assert.equal((await setup().handler(post({ email: "nope", marketingConsent: true }))).statusCode, 400);
  assert.equal((await setup().handler(post({ email: "a@b.co" }))).statusCode, 400);
  assert.equal((await setup().handler({ httpMethod: "GET" })).statusCode, 405);
  assert.equal((await setup({ allowed: false }).handler(post({ email: "a@b.co", marketingConsent: true }))).statusCode, 429);
  const { handler, calls } = setup({ env: { ...ENV, KIT_MARKETING_OPT_IN_TAG_ID: "" } });
  assert.equal((await handler(post({ email: "a@b.co", marketingConsent: true }))).statusCode, 503);
  assert.deepEqual(calls.upserts, []);
});
