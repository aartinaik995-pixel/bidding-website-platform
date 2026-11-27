// Offline checks for the PayPal webhook handler. They cover only the paths
// that return before any network call: disabled payments and malformed JSON.
// Signature verification needs PayPal, so it is covered by the live tests.
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { handlePaypalWebhook } from "../src/lib/payment-service.server";

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

function post(body: string) {
  return new Request("https://example.com/api/paypal-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("PayPal webhook handler (offline)", () => {
  it("refuses every event with 503 while payments are disabled", async () => {
    delete process.env.PAYPAL_ENABLED;
    const response = await handlePaypalWebhook(post("{}"));
    assert.equal(response.status, 503);
  });

  it("rejects malformed JSON with 400 before any PayPal call", async () => {
    process.env.PAYPAL_ENABLED = "true";
    process.env.PAYPAL_ENVIRONMENT = "sandbox";
    process.env.PAYPAL_CLIENT_ID = "test-id";
    process.env.PAYPAL_CLIENT_SECRET = "test-secret";
    const response = await handlePaypalWebhook(post("not json"));
    assert.equal(response.status, 400);
  });
});
