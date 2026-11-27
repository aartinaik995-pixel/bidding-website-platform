// Covers the pure payment and bidding rules. Network and database code is not
// exercised here.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolvePaypalConfig } from "../src/lib/payment-config";
import {
  applyVerifiedBid,
  type ListingTotals,
} from "../src/lib/bid-settlement";
import { feeBreakdown, isValidBidAmount, PLATFORM } from "../src/lib/platform";

const sandboxEnv = {
  PAYPAL_ENABLED: "true",
  PAYPAL_ENVIRONMENT: "sandbox",
  PAYPAL_CLIENT_ID: "id",
  PAYPAL_CLIENT_SECRET: "secret",
};

describe("resolvePaypalConfig", () => {
  it("is disabled by default", () => {
    assert.equal(resolvePaypalConfig({}).enabled, false);
  });

  it('stays disabled unless the flag is exactly "true"', () => {
    for (const value of ["TRUE", "1", "yes", " true", ""]) {
      assert.equal(
        resolvePaypalConfig({ ...sandboxEnv, PAYPAL_ENABLED: value }).enabled,
        false,
        `flag ${JSON.stringify(value)} must not enable payments`,
      );
    }
  });

  it("enables live PayPal only when explicitly configured with live credentials", () => {
    const config = resolvePaypalConfig({
      ...sandboxEnv,
      PAYPAL_ENVIRONMENT: "live",
    });
    assert.equal(config.enabled, true);
    const missing = resolvePaypalConfig({ PAYPAL_ENABLED: "true" });
    assert.equal(missing.enabled, false);
  });

  it("refuses when sandbox credentials are missing or blank", () => {
    assert.equal(
      resolvePaypalConfig({ ...sandboxEnv, PAYPAL_CLIENT_SECRET: "   " })
        .enabled,
      false,
    );
    assert.equal(
      resolvePaypalConfig({ ...sandboxEnv, PAYPAL_CLIENT_ID: undefined })
        .enabled,
      false,
    );
  });

  it("enables only with the flag, the sandbox and both credentials", () => {
    const config = resolvePaypalConfig(sandboxEnv);
    assert.deepEqual(config, {
      enabled: true,
      environment: "sandbox",
      apiBase: "https://api-m.sandbox.paypal.com",
      clientId: "id",
      clientSecret: "secret",
    });
  });
});

describe("applyVerifiedBid", () => {
  const empty: ListingTotals = {
    totalCents: 0,
    highestBidCents: 0,
    bidCount: 0,
    lastBidAt: null,
  };

  it("adds the bid to the total and tracks the highest bid", () => {
    const first = applyVerifiedBid(empty, 500, "2026-11-26T10:00:00.000Z");
    const second = applyVerifiedBid(first, 300, "2026-11-26T11:00:00.000Z");
    assert.deepEqual(second, {
      totalCents: 800,
      highestBidCents: 500,
      bidCount: 2,
      lastBidAt: "2026-11-26T11:00:00.000Z",
    });
  });

  it("rejects amounts outside the platform limits or not whole cents", () => {
    const at = "2026-11-26T10:00:00.000Z";
    assert.throws(() => applyVerifiedBid(empty, PLATFORM.minBidCents - 1, at));
    assert.throws(() => applyVerifiedBid(empty, PLATFORM.maxBidCents + 1, at));
    assert.throws(() => applyVerifiedBid(empty, 150.5, at));
  });

  it("rejects an invalid payment timestamp", () => {
    assert.throws(() => applyVerifiedBid(empty, 500, "not-a-date"));
  });

  it("does not mutate the input totals", () => {
    applyVerifiedBid(empty, 500, "2026-11-26T10:00:00.000Z");
    assert.equal(empty.totalCents, 0);
  });
});

describe("platform bid rules", () => {
  it("validates bid amounts", () => {
    assert.equal(isValidBidAmount(PLATFORM.minBidCents), true);
    assert.equal(isValidBidAmount(PLATFORM.maxBidCents), true);
    assert.equal(isValidBidAmount(PLATFORM.minBidCents - 1), false);
  });

  it("adds the platform fee on top of the bid", () => {
    assert.deepEqual(feeBreakdown(1000), {
      amountCents: 1000,
      feeCents: 100,
      totalChargeCents: 1100,
    });
  });
});
