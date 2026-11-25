// Signed-in user data: session, dashboard, PayPal checkout and receipts.

import { createServerFn } from '@tanstack/react-start'
import { getRequestUrl } from '@tanstack/react-start/server'
import { and, count, desc, eq, gt } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../../db/index.js'
import { bids, listings } from '../../db/schema.js'
import { currentUser, displayName, requireUser } from './auth.server'
import {
  CURRENCY,
  createPayPalOrder,
  paymentsConfigured,
  PaymentsNotConfiguredError,
  reconcileBid,
} from './payments.server'
import { toListing } from './listings.server'
import {
  feeBreakdown,
  isValidBidAmount,
  type BidStatus,
} from './platform'

export const getSessionUser = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await currentUser()
    return user
      ? { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin }
      : null
  },
)

export const getDashboard = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await requireUser()
    const [myListings, myBids] = await Promise.all([
      db.select().from(listings).where(eq(listings.ownerId, user.id)).orderBy(desc(listings.createdAt)),
      db.select({ bid: bids, listing: listings }).from(bids).innerJoin(listings, eq(bids.listingId, listings.id)).where(eq(bids.bidderId, user.id)).orderBy(desc(bids.createdAt)).limit(200),
    ])
    const ranked = await db.select({ id: listings.id }).from(listings).where(and(eq(listings.status, 'approved'), gt(listings.totalCents, 0))).orderBy(desc(listings.totalCents), listings.lastBidAt)
    const rankById = new Map(ranked.map((row, i) => [row.id, i + 1]))
    return {
      user: { name: user.name, email: user.email, isAdmin: user.isAdmin },
      listings: myListings.map((row) => ({ ...toListing(row), rank: rankById.get(row.id) ?? 0 })),
      bids: myBids.map(({ bid, listing }) => ({
        id: String(bid.id), status: bid.status as BidStatus, amountCents: bid.amountCents,
        feeCents: bid.feeCents, totalChargeCents: bid.totalChargeCents,
        createdAt: bid.createdAt.toISOString(), paidAt: bid.paidAt?.toISOString() ?? null,
        refundedAt: bid.refundedAt?.toISOString() ?? null,
        listing: { slug: listing.slug, title: listing.title },
      })),
    }
  },
)

const MAX_OPEN_CHECKOUTS = 5

/** Prices the bid on the server and creates a PayPal order. */
export const createBidCheckout = createServerFn({ method: 'POST' })
  .validator(z.object({
    listingId: z.coerce.number().int().positive(),
    amountCents: z.number().int().refine(isValidBidAmount, 'Bid amount is outside the allowed range'),
  }))
  .handler(async ({ data }) => {
    if (!paymentsConfigured()) throw new PaymentsNotConfiguredError()
    const user = await requireUser()
    const [listing] = await db.select().from(listings).where(eq(listings.id, data.listingId))
    if (!listing || listing.status !== 'approved') throw new Error('This website is not open for bids.')

    const [open] = await db.select({ n: count() }).from(bids).where(and(eq(bids.bidderId, user.id), eq(bids.status, 'pending')))
    if ((open?.n ?? 0) >= MAX_OPEN_CHECKOUTS) {
      throw new Error('You have several unfinished checkouts. Complete them before starting another bid.')
    }

    const { amountCents, feeCents, totalChargeCents } = feeBreakdown(data.amountCents)
    const [bid] = await db.insert(bids).values({
      listingId: listing.id, bidderId: user.id, bidderName: displayName(user),
      amountCents, feeCents, totalChargeCents, currency: CURRENCY,
    }).returning({ id: bids.id })
    if (!bid) throw new Error('Could not start checkout.')

    const origin = getRequestUrl().origin
    try {
      const order = await createPayPalOrder({
        bidId: bid.id,
        totalChargeCents,
        title: listing.title,
        returnUrl: `${origin}/checkout/success?bid=${bid.id}`,
        cancelUrl: `${origin}/site/${encodeURIComponent(listing.slug)}?checkout=cancelled`,
      })
      await db.update(bids).set({ paypalOrderId: order.orderId }).where(eq(bids.id, bid.id))
      return { url: order.approvalUrl }
    } catch (error) {
      await db.update(bids).set({ status: 'failed' }).where(eq(bids.id, bid.id))
      console.error('PayPal order creation failed', error instanceof Error ? error.message : 'unknown error')
      throw new Error('Could not open secure PayPal checkout. Nothing was charged — please try again.')
    }
  })

export const getBidReceipt = createServerFn({ method: 'GET' })
  .validator(z.object({ bidId: z.coerce.number().int().positive() }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const load = () => db.select({ bid: bids, listing: listings }).from(bids).innerJoin(listings, eq(bids.listingId, listings.id)).where(eq(bids.id, data.bidId))
    let [row] = await load()
    if (!row || (row.bid.bidderId !== user.id && !user.isAdmin)) return null
    if (row.bid.status === 'pending') {
      try {
        await reconcileBid(row.bid.id)
        ;[row] = await load()
      } catch (error) {
        console.error('PayPal bid reconciliation failed', error instanceof Error ? error.message : 'unknown error')
      }
    }
    if (!row) return null
    return {
      id: String(row.bid.id), status: row.bid.status as BidStatus,
      amountCents: row.bid.amountCents, feeCents: row.bid.feeCents,
      totalChargeCents: row.bid.totalChargeCents, createdAt: row.bid.createdAt.toISOString(),
      listing: { slug: row.listing.slug, title: row.listing.title, totalCents: row.listing.totalCents },
    }
  })
