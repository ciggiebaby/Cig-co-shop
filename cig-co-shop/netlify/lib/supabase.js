class SupabaseRequestError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = "SupabaseRequestError";
    this.status = status;
    this.code = code;
  }
}

function requiredEnvironment(name, environment = process.env) {
  const value = environment[name];
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function createSupabaseClient({
  url = requiredEnvironment("SUPABASE_URL"),
  secretKey = requiredEnvironment("SUPABASE_SECRET_KEY"),
  fetchImpl = fetch,
} = {}) {
  const baseUrl = url.replace(/\/+$/, "");
  const headers = {
    apikey: secretKey,
    "Content-Type": "application/json",
  };
  // Modern sb_secret_ keys are API keys, not JWTs. Legacy service-role keys
  // still require the bearer header to establish their database role.
  if (!secretKey.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${secretKey}`;
  }

  async function request(path, options = {}) {
    const response = await fetchImpl(`${baseUrl}/rest/v1/${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
    });
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!response.ok) {
      throw new SupabaseRequestError("Persistent storage request failed.", {
        status: response.status,
        code: body && body.code,
      });
    }
    return body;
  }

  return {
    // Plain insert into a table (service role; RLS stays on with no public policies).
    insert(table, row) {
      return request(encodeURIComponent(table), {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(row),
      });
    },
    rpc(name, parameters = {}) {
      return request(`rpc/${encodeURIComponent(name)}`, {
        method: "POST",
        body: JSON.stringify(parameters),
      });
    },
  };
}

module.exports = {
  SupabaseRequestError,
  createSupabaseClient,
  requiredEnvironment,
};
