// Server-only PayPal integration (Orders API v2). A bid becomes "paid" only
// after the server captures the order and PayPal confirms the captured amount,
// or after a signature-verified PayPal webhook says so.

import { and, eq, sql } from "drizzle-orm";

import { db } from "../../db/index.js";
import { bids, listings, paypalEvents, platformLedger } from "../../db/schema.js";
import { PLATFORM } from "./platform";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const CHECKOUT_TTL_SECONDS = 30 * 60;
export const CURRENCY = PLATFORM.currency.toUpperCase();

export function paypalConfigured() {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID &&
      process.env.PAYPAL_CLIENT_SECRET &&
      process.env.PAYPAL_WEBHOOK_ID,
  );
}

function apiBase() {
  return process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

/** Converts integer cents to the decimal string PayPal expects, e.g. 1050 -> "10.50". */
export function centsToValue(cents: number) {
  return (cents / 100).toFixed(2);
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const basic = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
  ).toString("base64");
  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.value;
}

async function paypalFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`PayPal ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export type PaypalOrder = {
  id: string;
  status: string;
  links?: { rel: string; href: string }[];
  purchase_units?: {
    custom_id?: string;
    amount?: { currency_code: string; value: string };
    payments?: {
      captures?: {
        id: string;
        status: string;
        amount: { currency_code: string; value: string };
      }[];
    };
  }[];
};

/** Creates a PayPal order for one bid. Returns the order id and the buyer approval URL. */
export async function createPaypalOrder(input: {
  bidId: number;
  listingTitle: string;
  totalChargeCents: number;
  origin: string;
}) {
  const order = await paypalFetch<PaypalOrder>("/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": `bidmysite-bid-${input.bidId}` },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: String(input.bidId),
          custom_id: String(input.bidId),
          description: `Bid on ${input.listingTitle}`.slice(0, 127),
          amount: {
            currency_code: CURRENCY,
            value: centsToValue(input.totalChargeCents),
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: `${input.origin}/checkout/success?bid=${input.bidId}`,
            cancel_url: `${input.origin}/dashboard?checkout=cancelled`,
            user_action: "PAY_NOW",
          },
        },
      },
    }),
  });
  const approve = order.links?.find(
    (l) => l.rel === "payer-action" || l.rel === "approve",
  );
  if (!approve) throw new Error("PayPal did not return an approval URL");
  return { orderId: order.id, approveUrl: approve.href };
}

/**
 * Captures an approved order and returns it. Only a COMPLETED capture whose
 * amount matches the server-priced bid counts as paid.
 */
export async function captureOrder(orderId: string) {
  return paypalFetch<PaypalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: { "PayPal-Request-Id": `capture-${orderId}` },
  });
}

/** Issues a full refund for a capture. Returns PayPal's refund status. */
export async function refundCapture(bidId: number, captureId: string) {
  const refund = await paypalFetch<{ id: string; status: string }>(
    `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
    {
      method: "POST",
      headers: { "PayPal-Request-Id": `bidmysite-refund-${bidId}` },
      body: JSON.stringify({}),
    },
  );
  return refund.status;
}

/** Looks up an order without capturing it. Used by reconciliation. */
export async function getOrder(orderId: string) {
  return paypalFetch<PaypalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

/** Verifies a webhook's signature with PayPal. Returns true only for a genuine event. */
export async function verifyWebhookSignature(
  headers: Headers,
  rawBody: string,
) {
  const result = await paypalFetch<{ verification_status: string }>(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: JSON.stringify({
        auth_algo: headers.get("paypal-auth-algo"),
        cert_url: headers.get("paypal-cert-url"),
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        transmission_time: headers.get("paypal-transmission-time"),
        webhook_id: process.env.PAYPAL_WEBHOOK_ID,
        webhook_event: JSON.parse(rawBody),
      }),
    },
  );
  return result.verification_status === "SUCCESS";
}

/** Recompute a listing's ranking totals from its paid bids. */
async function recomputeListingTotals(tx: Tx, listingId: number) {
  await tx
    .update(listings)
    .set({
      totalCents: sql`coalesce((select sum(${bids.amountCents}) from ${bids} where ${bids.listingId} = ${listingId} and ${bids.status} = 'paid'), 0)`,
      highestBidCents: sql`coalesce((select max(${bids.amountCents}) from ${bids} where ${bids.listingId} = ${listingId} and ${bids.status} = 'paid'), 0)`,
      bidCount: sql`(select count(*) from ${bids} where ${bids.listingId} = ${listingId} and ${bids.status} = 'paid')`,
      lastBidAt: sql`(select max(${bids.paidAt}) from ${bids} where ${bids.listingId} = ${listingId} and ${bids.status} = 'paid')`,
    })
    .where(eq(listings.id, listingId));
}

/**
 * Marks a bid paid from a COMPLETED capture, writes the fee ledger row and
 * updates listing totals. Safe to call more than once.
 */
export async function applyCapturedOrder(tx: Tx, order: PaypalOrder) {
  if (order.status !== "COMPLETED") return "not-paid" as const;
  const unit = order.purchase_units?.[0];
  const bidId = Number(unit?.custom_id);
  if (!Number.isInteger(bidId)) return "unknown-bid" as const;
  const capture = unit?.payments?.captures?.[0];
  if (!capture || capture.status !== "COMPLETED") return "not-paid" as const;

  const [bid] = await tx
    .select()
    .from(bids)
    .where(and(eq(bids.id, bidId), eq(bids.paypalOrderId, order.id)))
    .for("update");
  if (!bid) return "unknown-bid" as const;
  if (bid.status === "paid" || bid.status === "refunded")
    return "already-applied" as const;

  // The captured amount must match what the server priced; never trust anything else.
  if (
    capture.amount.value !== centsToValue(bid.totalChargeCents) ||
    capture.amount.currency_code.toLowerCase() !== bid.currency
  ) {
    console.error(`PayPal order ${order.id} amount mismatch for bid ${bid.id}`);
    return "amount-mismatch" as const;
  }

  await tx
    .update(bids)
    .set({
      status: "paid",
      paidAt: sql`now()`,
      paypalCaptureId: capture.id,
    })
    .where(eq(bids.id, bid.id));
  await tx
    .insert(platformLedger)
    .values({
      bidId: bid.id,
      kind: "fee",
      grossCents: bid.amountCents,
      feeCents: bid.feeCents,
    })
    .onConflictDoNothing();
  await recomputeListingTotals(tx, bid.listingId);
  return "applied" as const;
}

/** Captures an approved order from the success page and marks the bid paid. */
export async function finalizeBidOrder(bidId: number) {
  const [bid] = await db.select().from(bids).where(eq(bids.id, bidId));
  if (!bid || bid.status !== "pending" || !bid.paypalOrderId) return;
  const order = await captureOrder(bid.paypalOrderId);
  await db.transaction((tx) => applyCapturedOrder(tx, order));
}

/** Marks a refunded capture: removes the bid from rankings and records the refund. */
export async function applyRefundedCapture(tx: Tx, captureId: string) {
  const [bid] = await tx
    .select()
    .from(bids)
    .where(eq(bids.paypalCaptureId, captureId))
    .for("update");
  if (!bid || bid.status !== "paid") return;
  await tx
    .update(bids)
    .set({ status: "refunded", refundedAt: sql`now()` })
    .where(eq(bids.id, bid.id));
  await tx
    .insert(platformLedger)
    .values({
      bidId: bid.id,
      kind: "refund",
      grossCents: -bid.amountCents,
      feeCents: -bid.feeCents,
    })
    .onConflictDoNothing();
  await recomputeListingTotals(tx, bid.listingId);
}

/** Handles a signature-verified PayPal webhook event exactly once. */
export async function processPaypalEvent(event: {
  id: string;
  event_type: string;
  resource: Record<string, unknown>;
}) {
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(paypalEvents)
      .values({ id: event.id, type: event.event_type })
      .onConflictDoNothing()
      .returning({ id: paypalEvents.id });
    if (inserted.length === 0) return; // Already processed (PayPal retry).

    switch (event.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED": {
        // Capture completed outside our return flow: reconcile via the order.
        const orderId = (event.resource as { supplementary_data?: { related_ids?: { order_id?: string } } })
          .supplementary_data?.related_ids?.order_id;
        if (orderId) {
          const order = await getOrder(orderId);
          await applyCapturedOrder(tx, order);
        }
        break;
      }
      case "PAYMENT.CAPTURE.REFUNDED": {
        const links = (event.resource.links ?? []) as { rel: string; href: string }[];
        const up = links.find((l) => l.rel === "up")?.href;
        const captureId = up?.split("/").pop();
        if (captureId) await applyRefundedCapture(tx, captureId);
        break;
      }
    }
  });
}
