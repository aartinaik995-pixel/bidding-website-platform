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
  getStripe,
  paymentsConfigured,
  PaymentsNotConfiguredError,
  reconcileBid,
} from "./payments.server";
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
  async () => paymentsConfigured(),
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
 * Creates a pending bid and a Stripe Checkout Session. The charge is priced
 * here from PLATFORM rules; the browser only sends the bid amount.
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
    const stripe = getStripe();
    if (!stripe || !paymentsConfigured())
      throw new PaymentsNotConfiguredError();
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
        currency: CURRENCY,
      })
      .returning({ id: bids.id });
    if (!bid) throw new Error("Could not start checkout.");

    const origin = getRequestUrl().origin;
    const metadata = { bidId: String(bid.id), listingId: String(listing.id) };
    try {
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          customer_email: user.email,
          client_reference_id: String(bid.id),
          metadata,
          payment_intent_data: { metadata },
          expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: CURRENCY,
                unit_amount: amountCents,
                product_data: { name: `Bid on ${listing.title}`.slice(0, 120) },
              },
            },
            {
              quantity: 1,
              price_data: {
                currency: CURRENCY,
                unit_amount: feeCents,
                product_data: {
                  name: `BidMySite platform fee (${feePercentLabel()})`,
                },
              },
            },
          ],
          success_url: `${origin}/checkout/success?bid=${bid.id}`,
          cancel_url: `${origin}/site/${encodeURIComponent(listing.slug)}?checkout=cancelled`,
        },
        { idempotencyKey: `bidmysite-bid-${bid.id}` },
      );
      await db
        .update(bids)
        .set({ stripeSessionId: session.id })
        .where(eq(bids.id, bid.id));
      if (!session.url) throw new Error("Stripe did not return a checkout URL");
      return { url: session.url };
    } catch (error) {
      await db
        .update(bids)
        .set({ status: "failed" })
        .where(eq(bids.id, bid.id));
      console.error(
        "Stripe checkout creation failed",
        error instanceof Error ? error.message : error,
      );
      // The Stripe error is logged above; it is not attached so it never reaches the browser.
      // eslint-disable-next-line preserve-caught-error
      throw new Error(
        "Could not open secure checkout. Nothing was charged — please try again.",
      );
    }
  });

/** Receipt for one of the user's bids. Asks Stripe directly if the webhook hasn't landed yet. */
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
        await reconcileBid(row.bid.id);
        [row] = await load();
      } catch (error) {
        console.error(
          "Bid reconcile failed",
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
