// Listing, ranking and bid-history queries (Netlify Database). Server-only.
// Only approved listings with verified ("paid") bids are ever ranked.

import { and, count, desc, eq, gt, sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { bids, listings } from '../../db/schema.js'
import type { SessionUser } from './auth.server'
import { paypalConfigured } from './paypal.server'
import {
  rankListings,
  type Bid,
  type BidStatus,
  type Listing,
  type ListingStatus,
  type RankedListing,
} from './platform'

type ListingRow = typeof listings.$inferSelect
type BidRow = typeof bids.$inferSelect

export function toListing(row: ListingRow): Listing {
  return {
    id: String(row.id),
    slug: row.slug,
    url: row.url,
    title: row.title,
    description: row.description,
    ownerName: row.ownerName,
    status: row.status as ListingStatus,
    createdAt: row.createdAt.toISOString(),
    totalCents: row.totalCents,
    highestBidCents: row.highestBidCents,
    bidCount: row.bidCount,
    lastBidAt: row.lastBidAt?.toISOString() ?? null,
  }
}

export function toBid(row: BidRow): Bid {
  return {
    id: String(row.id),
    listingId: String(row.listingId),
    bidderName: row.bidderName,
    amountCents: row.amountCents,
    status: row.status as BidStatus,
    createdAt: (row.paidAt ?? row.createdAt).toISOString(),
  }
}

const rankedWhere = and(
  eq(listings.status, 'approved'),
  gt(listings.totalCents, 0),
)

async function loadLeaderboard(limit?: number): Promise<RankedListing[]> {
  const query = db
    .select()
    .from(listings)
    .where(rankedWhere)
    .orderBy(
      desc(listings.totalCents),
      sql`${listings.lastBidAt} asc nulls last`,
    )
  const rows = limit ? await query.limit(limit) : await query
  return rankListings(rows.map(toListing))
}

async function loadRecentBids(limit: number) {
  const rows = await db
    .select({ bid: bids, listing: listings })
    .from(bids)
    .innerJoin(listings, eq(bids.listingId, listings.id))
    .where(and(eq(bids.status, 'paid'), eq(listings.status, 'approved')))
    .orderBy(desc(bids.paidAt))
    .limit(limit)
  return rows.map(({ bid, listing }) => ({
    ...toBid(bid),
    listing: toListing(listing),
  }))
}

export async function loadHomeData(limit: number) {
  const [leaderboard, recentBids] = await Promise.all([
    loadLeaderboard(limit),
    loadRecentBids(6),
  ])
  return { leaderboard, recentBids }
}

export async function loadLeaderboardData() {
  const [leaderboard, recentBids, [totals]] = await Promise.all([
    loadLeaderboard(),
    loadRecentBids(10),
    db
      .select({
        bidCount: count(),
        totalBidCents: sql<number>`coalesce(sum(${bids.amountCents}), 0)::int`,
      })
      .from(bids)
      .innerJoin(listings, eq(bids.listingId, listings.id))
      .where(and(eq(bids.status, 'paid'), eq(listings.status, 'approved'))),
  ])
  return {
    leaderboard,
    recentBids,
    stats: {
      listingCount: leaderboard.length,
      bidCount: totals?.bidCount ?? 0,
      totalBidCents: totals?.totalBidCents ?? 0,
    },
  }
}

/** A listing's details page. Pending or removed listings are visible only to their owner and admins. */
export async function loadListingPage(
  slug: string,
  viewer: SessionUser | null,
) {
  const [row] = await db.select().from(listings).where(eq(listings.slug, slug))
  if (!row) return null
  const isOwner = viewer?.id === row.ownerId
  if (row.status !== 'approved' && !isOwner && !viewer?.isAdmin) return null

  const [[ahead], [leader], history] = await Promise.all([
    db
      .select({ n: count() })
      .from(listings)
      .where(
        and(
          rankedWhere,
          sql`(${listings.totalCents} > ${row.totalCents} or (${listings.totalCents} = ${row.totalCents} and ${listings.lastBidAt} < ${row.lastBidAt?.toISOString() ?? null}::timestamptz))`,
        ),
      ),
    db
      .select({ totalCents: listings.totalCents })
      .from(listings)
      .where(rankedWhere)
      .orderBy(desc(listings.totalCents))
      .limit(1),
    db
      .select()
      .from(bids)
      .where(and(eq(bids.listingId, row.id), eq(bids.status, 'paid')))
      .orderBy(desc(bids.paidAt))
      .limit(100),
  ])

  const ranked = row.status === 'approved' && row.totalCents > 0
  return {
    listing: { ...toListing(row), rank: ranked ? (ahead?.n ?? 0) + 1 : 0 },
    bids: history.map(toBid),
    leaderTotalCents: leader?.totalCents ?? 0,
    signedIn: Boolean(viewer),
    isOwner,
    paymentsReady: paypalConfigured(),
  }
}
