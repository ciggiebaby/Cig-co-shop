const { requiredEnvironment } = require("./supabase.js");

class KitRequestError extends Error {
  constructor(code, status) {
    super("Kit synchronization failed.");
    this.name = "KitRequestError";
    this.code = code;
    this.status = status;
  }
}

function createKitClient({
  apiKey = requiredEnvironment("KIT_API_KEY"),
  fetchImpl = fetch,
} = {}) {
  const baseUrl = "https://api.kit.com/v4";
  const headers = {
    "X-Kit-Api-Key": apiKey,
    "Content-Type": "application/json",
  };

  async function request(path, options = {}) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
    });
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    if (!response.ok) {
      throw new KitRequestError(`kit_http_${response.status}`, response.status);
    }
    return body;
  }

  return {
    async findByEmail(email) {
      const params = new URLSearchParams({
        email_address: email,
        status: "all",
        per_page: "10",
      });
      const body = await request(`/subscribers?${params}`);
      return body && Array.isArray(body.subscribers)
        ? body.subscribers.find(
            (subscriber) => subscriber.email_address.toLowerCase() === email,
          ) || null
        : null;
    },

    async upsertSubscriber({ email, firstName }) {
      const existing = await this.findByEmail(email);
      if (existing && existing.state !== "active") {
        return { subscriber: existing, suppressed: true };
      }

      const body = existing
        ? await request(`/subscribers/${existing.id}`, {
            method: "PUT",
            body: JSON.stringify({
              email_address: email,
              first_name: firstName || null,
            }),
          })
        : await request("/subscribers", {
            method: "POST",
            body: JSON.stringify({
              email_address: email,
              first_name: firstName || null,
              state: "active",
            }),
          });

      return { subscriber: body.subscriber, suppressed: false };
    },

    async addTags(subscriberId, tagIds) {
      for (const tagId of [...new Set(tagIds.filter(Boolean))]) {
        await request(`/tags/${encodeURIComponent(tagId)}/subscribers/${subscriberId}`, {
          method: "POST",
          body: "{}",
        });
      }
    },
  };
}

function kitTagIds(contact, environment = process.env) {
  function configuredTag(name) {
    if (!environment[name]) {
      throw new KitRequestError("kit_tag_configuration", 500);
    }
    return environment[name];
  }

  const tags = [configuredTag("KIT_MARKETING_OPT_IN_TAG_ID")];
  if (contact.source_arcade || contact.sourceArcade) {
    tags.push(configuredTag("KIT_ARCADE_TAG_ID"));
  }
  if (contact.source_checkout || contact.sourceCheckout) {
    tags.push(configuredTag("KIT_CHECKOUT_TAG_ID"));
  }
  const orderCount = Number(contact.order_count ?? contact.orderCount ?? 0);
  if (orderCount > 0) tags.push(configuredTag("KIT_CUSTOMER_TAG_ID"));
  if (orderCount === 1) tags.push(configuredTag("KIT_FIRST_ORDER_TAG_ID"));
  if (orderCount > 1) tags.push(configuredTag("KIT_REPEAT_CUSTOMER_TAG_ID"));
  return tags;
}

module.exports = {
  KitRequestError,
  createKitClient,
  kitTagIds,
};
