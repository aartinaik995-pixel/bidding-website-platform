// Live PayPal sandbox test. Runs only when PAYPAL_LIVE_TEST=1 (set by the
// manual live-sandbox workflow). It creates one sandbox order and checks the
// approval link. It does not capture, so no payment is made.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createBidOrder } from "../src/lib/paypal.server";

const live = process.env.PAYPAL_LIVE_TEST === "1";

describe(
  "PayPal sandbox (live)",
  { skip: !live && "set PAYPAL_LIVE_TEST=1 to run" },
  () => {
    it("creates a sandbox order with an approval link for a $1.00 bid", async () => {
      const order = await createBidOrder({
        listingId: 1,
        bidderId: "ci-live-test",
        amountCents: 100,
        returnUrl: "https://example.com/api/paypal-return",
        cancelUrl: "https://example.com/api/paypal-cancel",
      });
      assert.equal(typeof order.orderId, "string");
      assert.equal(order.totalChargeCents, 110);
      assert.match(
        order.approveUrl,
        /^https:\/\/([a-z0-9.-]+\.)?sandbox\.paypal\.com\//,
      );
    });
  },
);
