import { createServerFn } from '@tanstack/react-start'
import { desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../db/index.js'
import { bids, listings, platformLedger } from '../../db/schema.js'
import { requireAdmin } from './auth.server'
import { applyRefund, paymentsConfigured, refundPayPalCapture } from './payments.server'
import { toListing } from './listings.server'
import type { BidStatus } from './platform'

export const getAdminOverview = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdmin()
  const [allListings, recentBids, [totals], daily, monthly] = await Promise.all([
    db.select().from(listings).orderBy(sql`case ${listings.status} when 'removed' then 1 else 0 end`, desc(listings.createdAt)).limit(500),
    db.select({ bid: bids, listing: listings }).from(bids).innerJoin(listings, eq(bids.listingId, listings.id)).orderBy(desc(bids.createdAt)).limit(200),
    db.select({ grossCents: sql<number>`coalesce(sum(${platformLedger.grossCents}) filter (where ${platformLedger.kind} = 'fee'), 0)::int`, feeCents: sql<number>`coalesce(sum(${platformLedger.feeCents}) filter (where ${platformLedger.kind} = 'fee'), 0)::int`, refundedGrossCents: sql<number>`coalesce(-sum(${platformLedger.grossCents}) filter (where ${platformLedger.kind} = 'refund'), 0)::int`, refundedFeeCents: sql<number>`coalesce(-sum(${platformLedger.feeCents}) filter (where ${platformLedger.kind} = 'refund'), 0)::int`, paidBids: sql<number>`(count(*) filter (where ${platformLedger.kind} = 'fee'))::int` }).from(platformLedger),
    revenueBy('day'), revenueBy('month'),
  ])
  return {
    paymentsReady: paymentsConfigured(),
    listings: allListings.map((row) => ({ ...toListing(row), contactEmail: row.contactEmail })),
    bids: recentBids.map(({ bid, listing }) => ({ id: String(bid.id), status: bid.status as BidStatus, bidderName: bid.bidderName, amountCents: bid.amountCents, feeCents: bid.feeCents, totalChargeCents: bid.totalChargeCents, createdAt: bid.createdAt.toISOString(), paidAt: bid.paidAt?.toISOString() ?? null, hasPaymentIntent: Boolean(bid.paypalCaptureId), listing: { slug: listing.slug, title: listing.title } })),
    revenue: { grossCents: totals?.grossCents ?? 0, feeCents: totals?.feeCents ?? 0, refundedGrossCents: totals?.refundedGrossCents ?? 0, refundedFeeCents: totals?.refundedFeeCents ?? 0, netFeeCents: (totals?.feeCents ?? 0) - (totals?.refundedFeeCents ?? 0), paidBids: totals?.paidBids ?? 0 },
    daily, monthly,
  }
})
async function revenueBy(unit: 'day' | 'month') {
  const period = sql<string>`to_char(date_trunc(${unit}, ${platformLedger.createdAt} at time zone 'UTC'), ${unit === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM'})`
  return db.select({ period, grossCents: sql<number>`coalesce(sum(${platformLedger.grossCents}), 0)::int`, feeCents: sql<number>`coalesce(sum(${platformLedger.feeCents}), 0)::int`, refundCents: sql<number>`coalesce(-sum(${platformLedger.grossCents} + ${platformLedger.feeCents}) filter (where ${platformLedger.kind} = 'refund'), 0)::int` }).from(platformLedger).groupBy(period).orderBy(desc(period)).limit(unit === 'day' ? 30 : 12)
}
export const setListingStatus = createServerFn({ method: 'POST' }).validator(z.object({ listingId: z.coerce.number().int().positive(), status: z.enum(['approved', 'removed']) })).handler(async ({ data }) => {
  await requireAdmin()
  const [row] = await db.update(listings).set({ status: data.status, reviewedAt: sql`now()` }).where(eq(listings.id, data.listingId)).returning({ id: listings.id })
  if (!row) throw new Error('Listing not found.')
  return { ok: true }
})
export const refundBid = createServerFn({ method: 'POST' }).validator(z.object({ bidId: z.coerce.number().int().positive() })).handler(async ({ data }) => {
  await requireAdmin()
  const [bid] = await db.select().from(bids).where(eq(bids.id, data.bidId))
  if (!bid || bid.status !== 'paid' || !bid.paypalCaptureId) throw new Error('Only completed PayPal payments can be refunded.')
  const refund = await refundPayPalCapture(bid.paypalCaptureId, bid.id)
  if (refund.status === 'COMPLETED') {
    await db.transaction((tx) => applyRefund(tx, bid.paypalCaptureId!))
    return { status: 'refunded' as const }
  }
  if (refund.status !== 'PENDING') throw new Error('PayPal could not process this refund.')
  return { status: 'processing' as const }
})
