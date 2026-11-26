// Signed-in user data: session and dashboard.

import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gt } from "drizzle-orm";

import { db } from "../../db/index.js";
import { bids, listings } from "../../db/schema.js";
import { currentUser, requireUser } from "./auth.server";
import { toListing } from "./listings.server";
import type { BidStatus } from "./platform";

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
