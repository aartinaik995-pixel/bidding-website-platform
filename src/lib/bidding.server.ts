// Bid lifecycle: create a pending bid, start PayPal checkout, settle the
// capture on return, and mark abandoned checkouts failed. Server-only.
// Every entry point refuses while payments are disabled.

import { eq, sql } from "drizzle-orm";

import { db } from "../../db/index.js";
import { bids, listings } from "../../db/schema.js";
import type { SessionUser } from "./auth.server";
import { resolvePaypalConfig } from "./payment-config";
import {
  captureBidOrder,
  createBidOrder,
  PAYMENTS_DISABLED_MESSAGE,
} from "./paypal.server";
import { feeBreakdown, isValidBidAmount } from "./platform";
import { enforceUserRateLimit } from "./rate-limit.server";

/** Public origin of this deployment. Netlify sets URL; SITE_URL overrides it. */
export function siteUrl() {
  return (
    process.env.SITE_URL?.trim() ||
    process.env.URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function requirePayments() {
  if (!resolvePaypalConfig(process.env).enabled)
    throw new Error(PAYMENTS_DISABLED_MESSAGE);
}

/** Creates a pending bid and returns the PayPal approval link to redirect to. */
export async function startBid(
  user: SessionUser,
  input: { listingId: number; amountCents: number },
): Promise<{ approveUrl: string }> {
  requirePayments();
  if (!isValidBidAmount(input.amountCents))
    throw new Error("Bid amount is outside the allowed range.");

  await enforceUserRateLimit({
    userId: user.id,
    action: "place-bid",
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });

  const [listing] = await db
    .select({ id: listings.id, status: listings.status })
    .from(listings)
    .where(eq(listings.id, input.listingId));
  if (!listing || listing.status !== "approved")
    throw new Error("This website is not open for bids.");

  const { feeCents, totalChargeCents } = feeBreakdown(input.amountCents);
  const [bid] = await db
    .insert(bids)
    .values({
      listingId: listing.id,
      bidderId: user.id,
      bidderName: user.name || "Anonymous bidder",
      amountCents: input.amountCents,
      feeCents,
      totalChargeCents,
      status: "pending",
    })
    .returning({ id: bids.id });

  const base = siteUrl();
  try {
    const order = await createBidOrder({
      listingId: listing.id,
      bidderId: user.id,
      amountCents: input.amountCents,
      returnUrl: `${base}/api/paypal-return`,
      cancelUrl: `${base}/api/paypal-cancel`,
    });
    await db
      .update(bids)
      .set({ paypalOrderId: order.orderId })
      .where(eq(bids.id, bid.id));
    return { approveUrl: order.approveUrl };
  } catch (error) {
    await db.update(bids).set({ status: "failed" }).where(eq(bids.id, bid.id));
    throw error;
  }
}

/**
 * Settles a bid after the payer approves on PayPal. The capture must belong to
 * this bid (checked through custom_id) and the database checks the amount.
 * Returns the bid status after settlement.
 */
export async function settleReturn(
  orderId: string,
): Promise<"paid" | "pending" | "failed"> {
  requirePayments();
  const [bid] = await db
    .select({
      id: bids.id,
      status: bids.status,
      listingId: bids.listingId,
      bidderId: bids.bidderId,
    })
    .from(bids)
    .where(eq(bids.paypalOrderId, orderId));
  if (!bid) throw new Error("Unknown PayPal order.");
  if (bid.status === "paid") return "paid";
  if (bid.status !== "pending") return "failed";

  let captured;
  try {
    captured = await captureBidOrder(orderId);
  } catch (error) {
    // The webhook can settle the order first. PayPal then refuses a second
    // capture, so re-read the bid before reporting a failure.
    const [current] = await db
      .select({ status: bids.status })
      .from(bids)
      .where(eq(bids.paypalOrderId, orderId));
    if (current?.status === "paid") return "paid";
    throw error;
  }
  if (captured.customId !== `${bid.listingId}:${bid.bidderId}`)
    throw new Error("The PayPal capture does not belong to this bid.");

  const paidAt = new Date().toISOString();
  const result = await db.execute(
    sql`select settle_verified_bid(${orderId}, ${captured.captureId}, ${captured.amountCents}, ${paidAt}::timestamptz) as result`,
  );
  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: unknown[] }).rows ?? []);
  const status = (rows[0] as { result?: unknown } | undefined)?.result;
  return status === "paid" || status === "already-paid" ? "paid" : "pending";
}

/** Marks a pending bid failed when the payer cancels on PayPal. Paid bids are never changed here. */
export async function cancelPendingBid(orderId: string): Promise<void> {
  requirePayments();
  await db
    .update(bids)
    .set({ status: "failed" })
    .where(
      sql`${bids.paypalOrderId} = ${orderId} and ${bids.status} = 'pending'`,
    );
}
