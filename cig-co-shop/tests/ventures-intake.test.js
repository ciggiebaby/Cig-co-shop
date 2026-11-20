const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHandler, CONFIRMATION, NOTICE_TO } = require("../netlify/functions/ventures-intake.js");

const migration = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/202611200001_ventures_intake.sql"),
  "utf8",
);

const quiet = { error() {} };
const ENV = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "server-only-secret",
  RESEND_API_KEY: "re_test",
  RESEND_FROM_EMAIL: "CIG & CO. <info@cigcompany.com>",
};

const valid = () => ({
  service: "lead-research",
  name: "Jordan Lee",
  business: "Example Harbor Lighting Co.",
  email: "jordan@example.com",
  need: "25 regional dealers in the Southeast",
  budgetTimeline: "$149 Starter, this month",
  website: "",
});

function post(body, extra = {}) {
  return {
    httpMethod: "POST",
    headers: { "x-nf-client-connection-ip": "203.0.113.9" },
    body: JSON.stringify(body),
    ...extra,
  };
}

function handlerWith(overrides = {}) {
  const inserted = [];
  const mailed = [];
  const handler = createHandler({
    environment: ENV,
    logger: quiet,
    storeFactory: () => ({
      checkArcadeRateLimit: async () => true,
    }),
    supabaseFactory: () => ({
      insert: async (table, row) => {
        inserted.push({ table, row });
      },
    }),
    mailer: async (row) => {
      mailed.push(row);
    },
    ...overrides,
  });
  return { handler, inserted, mailed };
}

test("migration creates ventures_intake with RLS and no public grants", () => {
  assert.match(migration, /create table if not exists public\.ventures_intake/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.ventures_intake from public, anon, authenticated/);
  assert.match(migration, /grant insert, select, update on table public\.ventures_intake to service_role/);
  assert.doesNotMatch(migration, /create policy/i);
  assert.doesNotMatch(migration, /to anon|to authenticated|to public/i);
});

test("a valid intake is stored and notifies ventures@", async () => {
  const { handler, inserted, mailed } = handlerWith();
  const res = await handler(post(valid()));
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal(body.message, CONFIRMATION);
  assert.equal(body.notified, true);
  assert.equal(inserted[0].table, "ventures_intake");
  assert.equal(inserted[0].row.service_id, "lead-research");
  assert.equal(inserted[0].row.email_normalized, "jordan@example.com");
  assert.equal(inserted[0].row.status, "new");
  assert.equal(mailed[0].email, "jordan@example.com");
  assert.equal(NOTICE_TO, "ventures@cigcompany.com");
});

test("validation, honeypot, and rate limit behave safely", async () => {
  const { handler, inserted } = handlerWith();
  const missing = await handler(post({ ...valid(), email: "not-an-email" }));
  assert.equal(missing.statusCode, 400);
  const badService = await handler(post({ ...valid(), service: "other" }));
  assert.equal(badService.statusCode, 400);
  const honey = await handler(post({ ...valid(), website: "http://spam.test" }));
  assert.equal(honey.statusCode, 200);
  assert.equal(inserted.length, 0);

  const limited = handlerWith({
    storeFactory: () => ({ checkArcadeRateLimit: async () => false }),
  });
  const tooMany = await limited.handler(post(valid()));
  assert.equal(tooMany.statusCode, 429);
});

test("a storage error asks the buyer to email ventures@, and a mail failure still confirms", async () => {
  const failStore = handlerWith({
    supabaseFactory: () => ({
      insert: async () => {
        throw new Error("relation does not exist");
      },
    }),
  });
  const res = await failStore.handler(post(valid()));
  assert.equal(res.statusCode, 500);
  assert.match(JSON.parse(res.body).error, /ventures@cigcompany\.com/);

  const failMail = handlerWith({
    mailer: async () => {
      throw new Error("resend_http_500");
    },
  });
  const ok = await failMail.handler(post(valid()));
  assert.equal(ok.statusCode, 200);
  assert.equal(JSON.parse(ok.body).ok, true);
  assert.equal(failMail.inserted.length, 1);
});

test("GET is rejected and the secret key is not returned", async () => {
  const { handler } = handlerWith();
  const res = await handler({ httpMethod: "GET" });
  assert.equal(res.statusCode, 405);
  const ok = await handler(post(valid()));
  assert.doesNotMatch(ok.body, /server-only-secret|sb_secret|RESEND_API_KEY/);
});
