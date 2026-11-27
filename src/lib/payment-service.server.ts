// Server-side payment flows: PayPal webhook settlement and admin refunds.
// Every path checks resolvePaypalConfig() first, so nothing moves money while
// payments are disabled. Server-only.

import { eq, sql } from "drizzle-orm";

import { db } from "../../db/index.js";
import { bids, users } from "../../db/schema.js";
import { sendEmail } from "./email.server";
import { PAYMENTS_DISABLED_MESSAGE, refundCapture, verifyWebhookSignature } from "./paypal.server";
import { resolvePaypalConfig } from "./payment-config";
import { renderBidReceipt, renderRefundNotice } from "./notifications";

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function firstRow(result: unknown): Record<string, unknown> | undefined {
  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: unknown[] }).rows ?? []);
  return rows[0] as Record<string, unknown> | undefined;
}

type CaptureEvent = {
  event_type?: unknown;
  resource?: {
    id?: unknown;
    amount?: { value?: unknown };
    create_time?: unknown;
    supplementary_data?: { related_ids?: { order_id?: unknown } };
  };
};

/** Handles a PayPal webhook. Only a verified PAYMENT.CAPTURE.COMPLETED settles a bid. */
export async function handlePaypalWebhook(request: Request): Promise<Response> {
  if (!resolvePaypalConfig(process.env).enabled)
    return json({ error: PAYMENTS_DISABLED_MESSAGE }, 503);

  const raw = await request.text();
  let event: CaptureEvent;
  try {
    event = JSON.parse(raw) as CaptureEvent;
  } catch {
    return json({ error: "Malformed event." }, 400);
  }

  if (!(await verifyWebhookSignature(request.headers, raw)))
    return json({ error: "Signature not verified." }, 400);

  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED")
    return json({ status: "ignored" }, 200);

  const resource = event.resource ?? {};
  const captureId = resource.id;
  const orderId = resource.supplementary_data?.related_ids?.order_id;
  const value = resource.amount?.value;
  const paidAt =
    typeof resource.create_time === "string" ? resource.create_time : new Date().toISOString();
  if (typeof captureId !== "string" || typeof orderId !== "string" || typeof value !== "string")
    return json({ error: "Event is missing payment details." }, 400);

  const cents = Math.round(Number(value) * 100);
  const result = await db.execute(
    sql`select settle_verified_bid(${orderId}, ${captureId}, ${cents}, ${paidAt}::timestamptz) as result`,
  );
  const status = firstRow(result)?.result;

  if (status === "paid") {
    await sendBidReceiptForOrder(orderId).catch(() => undefined);
  }
  return json({ status }, 200);
}

async function sendBidReceiptForOrder(orderId: string) {
  const [row] = await db
    .select({
      bid: bids,
      email: users.email,
      name: users.name,
      title: sql<string>`(select title from listings where listings.id = ${bids.listingId})`,
      slug: sql<string>`(select slug from listings where listings.id = ${bids.listingId})`,
    })
    .from(bids)
    .innerJoin(users, eq(users.id, bids.bidderId))
    .where(eq(bids.paypalOrderId, orderId));
  if (!row) return;
  await sendEmail(
    row.email,
    renderBidReceipt({
      title: row.title,
      slug: row.slug,
      amountCents: row.bid.amountCents,
      feeCents: row.bid.feeCents,
      totalChargeCents: row.bid.totalChargeCents,
      ownerName: row.name,
    }),
  );
}

/**
 * Refunds a paid bid in full at PayPal, then reverses it in the database.
 * If PayPal succeeds but the database write fails, the refund id is logged so
 * the operator can reconcile it; a retry will not refund twice because PayPal
 * rejects a second full refund.
 */
export async function refundPaidBid(bidId: number): Promise<"refunded"> {
  if (!resolvePaypalConfig(process.env).enabled)
    throw new Error(PAYMENTS_DISABLED_MESSAGE);

  const [bid] = await db.select().from(bids).where(eq(bids.id, bidId));
  if (!bid) throw new Error("Bid not found.");
  if (bid.status !== "paid" || !bid.paypalCaptureId)
    throw new Error("Only a paid PayPal bid can be refunded.");

  const refundId = await refundCapture(bid.paypalCaptureId, bid.totalChargeCents);
  try {
    await db.execute(
      sql`select refund_verified_bid(${bid.id}, now()) as result`,
    );
  } catch (error) {
    console.error(`PayPal refund ${refundId} succeeded but the database update failed.`, error);
    throw new Error("The refund was sent to PayPal but could not be recorded. Check the logs.", { cause: error });
  }

  const [recipient] = await db
    .select({ email: users.email, title: sql<string>`(select title from listings where listings.id = ${bid.listingId})` })
    .from(users)
    .where(eq(users.id, bid.bidderId));
  if (recipient) {
    await sendEmail(
      recipient.email,
      renderRefundNotice({ title: recipient.title, refundCents: bid.totalChargeCents }),
    ).catch(() => undefined);
  }
  return "refunded";
}
