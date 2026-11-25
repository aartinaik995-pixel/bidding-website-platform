// Signed-in user data: session, dashboard, checkout and receipts.

import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { and, count, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/index.js";
import { bids, listings } from "../../db/schema.js";
import { currentUser, displayName, requireUser } from "./auth.server";
import { enforceUserRateLimit } from "./rate-limit.server";
import {
  CHECKOUT_TTL_SECONDS,
  CURRENCY,
  createPaypalOrder,
  finalizeBidOrder,
  paypalConfigured,
} from "./paypal.server";
import { toListing } from "./listings.server";
import {
  feeBreakdown,
  feePercentLabel,
  isValidBidAmount,
  type BidStatus,
} from "./platform";

/** Client-safe view of the current session (or null). */
export const getSessionUser = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await currentUser();
    return user
      ? {
          id: user.id,
          email: user.email,
          name: user.name,
          isAdmin: user.isAdmin,
        }
      : null;
  },
);

/** Safe, public readiness flag; never returns configured credential values. */
export const getPaymentsReady = createServerFn({ method: "GET" }).handler(
  async () => paypalConfigured(),
);

export const getDashboard = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requireUser();
    const [myListings, myBids] = await Promise.all([
      db
        .select()
        .from(listings)
        .where(eq(listings.ownerId, user.id))
        .orderBy(desc(listings.createdAt)),
      db
        .select({ bid: bids, listing: listings })
        .from(bids)
        .innerJoin(listings, eq(bids.listingId, listings.id))
        .where(eq(bids.bidderId, user.id))
        .orderBy(desc(bids.createdAt))
        .limit(200),
    ]);

    // Rank each of the user's ranked listings against the live board.
    const ranked = await db
      .select({ id: listings.id })
      .from(listings)
      .where(and(eq(listings.status, "approved"), gt(listings.totalCents, 0)))
      .orderBy(desc(listings.totalCents), listings.lastBidAt);
    const rankById = new Map(ranked.map((row, i) => [row.id, i + 1]));

    return {
      user: { name: user.name, email: user.email, isAdmin: user.isAdmin },
      listings: myListings.map((row) => ({
        ...toListing(row),
        rank: rankById.get(row.id) ?? 0,
      })),
      bids: myBids.map(({ bid, listing }) => ({
        id: String(bid.id),
        status: bid.status as BidStatus,
        amountCents: bid.amountCents,
        feeCents: bid.feeCents,
        totalChargeCents: bid.totalChargeCents,
        createdAt: bid.createdAt.toISOString(),
        paidAt: bid.paidAt?.toISOString() ?? null,
        refundedAt: bid.refundedAt?.toISOString() ?? null,
        listing: { slug: listing.slug, title: listing.title },
      })),
    };
  },
);

const MAX_OPEN_CHECKOUTS = 5;

/**
 * Creates a pending bid and a PayPal order. The charge is priced here from
 * PLATFORM rules; the browser only sends the bid amount.
 */
export const createBidCheckout = createServerFn({ method: "POST" })
  .validator(
    z.object({
      listingId: z.coerce.number().int().positive(),
      amountCents: z
        .number()
        .int()
        .refine(isValidBidAmount, "Bid amount is outside the allowed range"),
    }),
  )
  .handler(async ({ data }) => {
    if (!paypalConfigured()) {
      throw new Error("Payments are not configured yet.");
    }
    const user = await requireUser();

    const [listing] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, data.listingId));
    if (!listing || listing.status !== "approved") {
      throw new Error("This website is not open for bids.");
    }

    await enforceUserRateLimit({
      userId: user.id,
      action: "checkout-creation",
      limit: 5,
      windowMs: CHECKOUT_TTL_SECONDS * 1000,
    });

    const [open] = await db
      .select({ n: count() })
      .from(bids)
      .where(
        and(
          eq(bids.bidderId, user.id),
          eq(bids.status, "pending"),
          gt(
            bids.createdAt,
            new Date(Date.now() - CHECKOUT_TTL_SECONDS * 1000),
          ),
        ),
      );
    if ((open?.n ?? 0) >= MAX_OPEN_CHECKOUTS) {
      throw new Error(
        "You have several unfinished checkouts. Complete or cancel them, then try again in 30 minutes.",
      );
    }

    const { amountCents, feeCents, totalChargeCents } = feeBreakdown(
      data.amountCents,
    );
    const [bid] = await db
      .insert(bids)
      .values({
        listingId: listing.id,
        bidderId: user.id,
        bidderName: displayName(user),
        amountCents,
        feeCents,
        totalChargeCents,
        currency: CURRENCY.toLowerCase(),
      })
      .returning({ id: bids.id });
    if (!bid) throw new Error("Could not start checkout.");

    const origin = getRequestUrl().origin;
    try {
      const { orderId, approveUrl } = await createPaypalOrder({
        bidId: bid.id,
        listingTitle: listing.title,
        totalChargeCents,
        origin,
      });
      await db
        .update(bids)
        .set({ paypalOrderId: orderId })
        .where(eq(bids.id, bid.id));
      return { url: approveUrl };
    } catch (error) {
      await db
        .update(bids)
        .set({ status: "failed" })
        .where(eq(bids.id, bid.id));
      console.error(
        "PayPal order creation failed",
        error instanceof Error ? error.message : error,
      );
      // The PayPal error is logged above; it is not attached so it never reaches the browser.
      // eslint-disable-next-line preserve-caught-error
      throw new Error(
        "Could not open secure checkout. Nothing was charged — please try again.",
      );
    }
  });

/**
 * Receipt for one of the user's bids. Captures the PayPal order if the buyer
 * approved it but the success page never ran the capture.
 */
export const getBidReceipt = createServerFn({ method: "GET" })
  .validator(z.object({ bidId: z.coerce.number().int().positive() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const load = () =>
      db
        .select({ bid: bids, listing: listings })
        .from(bids)
        .innerJoin(listings, eq(bids.listingId, listings.id))
        .where(eq(bids.id, data.bidId));
    let [row] = await load();
    if (!row || (row.bid.bidderId !== user.id && !user.isAdmin)) return null;

    if (row.bid.status === "pending") {
      try {
        await finalizeBidOrder(row.bid.id);
        [row] = await load();
      } catch (error) {
        console.error(
          "Bid capture failed",
          error instanceof Error ? error.message : error,
        );
      }
    }
    if (!row) return null;
    return {
      id: String(row.bid.id),
      status: row.bid.status as BidStatus,
      amountCents: row.bid.amountCents,
      feeCents: row.bid.feeCents,
      totalChargeCents: row.bid.totalChargeCents,
      createdAt: row.bid.createdAt.toISOString(),
      paidAt: row.bid.paidAt?.toISOString() ?? null,
      listing: {
        slug: row.listing.slug,
        title: row.listing.title,
        totalCents: row.listing.totalCents,
      },
    };
  });
