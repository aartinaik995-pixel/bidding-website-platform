// @vitest-environment node
// Runs the real migration on an in-memory Postgres (PGlite) and checks that
// only verified, correctly priced Stripe payments change rankings and revenue.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'

vi.mock('../../db/index.js', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const schemaModule = await import('../../db/schema')
  const client = new PGlite()
  const dir = join(process.cwd(), 'netlify/database/migrations')
  for (const migration of readdirSync(dir).sort()) {
    await client.exec(
      readFileSync(join(dir, migration, 'migration.sql'), 'utf8'),
    )
  }
  return { db: drizzle({ client, schema: schemaModule }) }
})

const { db } = await import('../../db/index.js')
const { loadLeaderboardData, loadListingPage } =
  await import('./listings.server')
const { processStripeEvent } = await import('./payments.server')
const { feeBreakdown } = await import('./platform')

let listingId = 0
let bidId = 0
let seq = 0

function sessionEvent(
  type: string,
  overrides: Partial<Stripe.Checkout.Session> = {},
  eventId = `evt_${++seq}`,
) {
  return {
    id: eventId,
    type,
    data: {
      object: {
        id: 'cs_test_1',
        object: 'checkout.session',
        payment_status: 'paid',
        status: 'complete',
        amount_total: 1100,
        currency: 'usd',
        client_reference_id: String(bidId),
        metadata: { bidId: String(bidId) },
        payment_intent: 'pi_test_1',
        ...overrides,
      },
    },
  } as unknown as Stripe.Event
}

async function state() {
  const [listing] = await db
    .select()
    .from(schema.listings)
    .where(eq(schema.listings.id, listingId))
  const [bid] = await db
    .select()
    .from(schema.bids)
    .where(eq(schema.bids.id, bidId))
  const ledger = await db.select().from(schema.platformLedger)
  return { listing: listing!, bid: bid!, ledger }
}

beforeEach(async () => {
  await db.delete(schema.platformLedger)
  await db.delete(schema.stripeEvents)
  await db.delete(schema.bids)
  await db.delete(schema.listings)
  await db.delete(schema.users)
  await db
    .insert(schema.users)
    .values({ id: 'u1', email: 'owner@example.com', name: 'Owner' })
  const [listing] = await db
    .insert(schema.listings)
    .values({
      slug: 'example',
      url: 'https://example.com/',
      title: 'Example',
      description: 'An example website',
      ownerId: 'u1',
      ownerName: 'Owner',
      contactEmail: 'owner@example.com',
      status: 'approved',
    })
    .returning()
  listingId = listing!.id
  const { amountCents, feeCents, totalChargeCents } = feeBreakdown(1000)
  const [bid] = await db
    .insert(schema.bids)
    .values({
      listingId,
      bidderId: 'u1',
      bidderName: 'Owner',
      amountCents,
      feeCents,
      totalChargeCents,
      stripeSessionId: 'cs_test_1',
    })
    .returning()
  bidId = bid!.id
})

describe('platform fee', () => {
  it('adds exactly 10% on top of the bid', () => {
    expect(feeBreakdown(1000)).toEqual({
      amountCents: 1000,
      feeCents: 100,
      totalChargeCents: 1100,
    })
    expect(feeBreakdown(100)).toEqual({
      amountCents: 100,
      feeCents: 10,
      totalChargeCents: 110,
    })
    expect(feeBreakdown(12_345)).toEqual({
      amountCents: 12_345,
      feeCents: 1235,
      totalChargeCents: 13_580,
    })
  })
})

describe('Stripe webhook processing', () => {
  it('counts a verified payment once, even when Stripe retries', async () => {
    const event = sessionEvent('checkout.session.completed')
    await processStripeEvent(event)
    await processStripeEvent(event)
    await processStripeEvent(sessionEvent('checkout.session.completed'))

    const { listing, bid, ledger } = await state()
    expect(bid.status).toBe('paid')
    expect(bid.stripePaymentIntentId).toBe('pi_test_1')
    expect(listing.totalCents).toBe(1000)
    expect(listing.highestBidCents).toBe(1000)
    expect(listing.bidCount).toBe(1)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({
      kind: 'fee',
      grossCents: 1000,
      feeCents: 100,
    })
  })

  it('ignores sessions that are unpaid or charged a different amount', async () => {
    await processStripeEvent(
      sessionEvent('checkout.session.completed', { payment_status: 'unpaid' }),
    )
    await processStripeEvent(
      sessionEvent('checkout.session.completed', { amount_total: 110 }),
    )
    await processStripeEvent(
      sessionEvent('checkout.session.completed', { currency: 'eur' }),
    )
    await processStripeEvent(
      sessionEvent('checkout.session.completed', { id: 'cs_other' }),
    )

    const { listing, bid, ledger } = await state()
    expect(bid.status).toBe('pending')
    expect(listing.totalCents).toBe(0)
    expect(ledger).toHaveLength(0)
  })

  it('marks expired checkouts as failed without touching rankings', async () => {
    await processStripeEvent(
      sessionEvent('checkout.session.expired', {
        payment_status: 'unpaid',
        status: 'expired',
      }),
    )
    const { listing, bid } = await state()
    expect(bid.status).toBe('failed')
    expect(listing.totalCents).toBe(0)
  })

  it('removes a refunded bid from rankings and records the refund', async () => {
    await processStripeEvent(sessionEvent('checkout.session.completed'))
    await processStripeEvent({
      id: `evt_${++seq}`,
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_1',
          object: 'charge',
          refunded: true,
          payment_intent: 'pi_test_1',
        },
      },
    } as unknown as Stripe.Event)

    const { listing, bid, ledger } = await state()
    expect(bid.status).toBe('refunded')
    expect(listing.totalCents).toBe(0)
    expect(listing.bidCount).toBe(0)
    expect(
      ledger.map((row) => [row.kind, row.grossCents, row.feeCents]),
    ).toEqual([
      ['fee', 1000, 100],
      ['refund', -1000, -100],
    ])
  })
})

describe('public rankings', () => {
  it('only ranks listings with verified payments', async () => {
    expect((await loadLeaderboardData()).leaderboard).toHaveLength(0)
    const before = await loadListingPage('example', null)
    expect(before?.listing.rank).toBe(0)

    await processStripeEvent(sessionEvent('checkout.session.completed'))
    const board = await loadLeaderboardData()
    expect(
      board.leaderboard.map(
        (l: { slug: string; rank: number; totalCents: number }) => [
          l.slug,
          l.rank,
          l.totalCents,
        ],
      ),
    ).toEqual([['example', 1, 1000]])
    expect(board.stats).toEqual({
      listingCount: 1,
      bidCount: 1,
      totalBidCents: 1000,
    })
    expect(board.recentBids).toHaveLength(1)

    const page = await loadListingPage('example', null)
    expect(page?.listing.rank).toBe(1)
    expect(
      page?.bids.map((b: { amountCents: number }) => b.amountCents),
    ).toEqual([1000])
  })

  it('hides pending listings from the public', async () => {
    await db.update(schema.listings).set({ status: 'pending' })
    expect(await loadListingPage('example', null)).toBeNull()
    const owner = {
      id: 'u1',
      email: 'owner@example.com',
      name: 'Owner',
      isAdmin: false,
    }
    expect((await loadListingPage('example', owner))?.isOwner).toBe(true)
  })
})

describe('webhook endpoint', () => {
  const secret = 'whsec_test_secret'
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
  process.env.STRIPE_WEBHOOK_SECRET = secret

  async function post(body: string, signature?: string) {
    const { Route } = await import('../routes/api.stripe-webhook')
    const handlers = (
      Route.options as unknown as {
        server: {
          handlers: Record<
            string,
            (ctx: { request: Request }) => Promise<Response>
          >
        }
      }
    ).server.handlers
    return handlers.POST!({
      request: new Request('http://localhost/api/stripe-webhook', {
        method: 'POST',
        body,
        headers: signature ? { 'stripe-signature': signature } : {},
      }),
    })
  }

  it('rejects unsigned and forged events', async () => {
    const body = JSON.stringify(sessionEvent('checkout.session.completed'))
    expect((await post(body)).status).toBe(400)
    expect((await post(body, 't=1,v1=forged')).status).toBe(400)
    const forged = Stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: 'whsec_wrong',
    })
    expect((await post(body, forged)).status).toBe(400)
    expect((await state()).bid.status).toBe('pending')
  })

  it('accepts a correctly signed event and applies it', async () => {
    const body = JSON.stringify(sessionEvent('checkout.session.completed'))
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret,
    })
    const response = await post(body, signature)
    expect(response.status).toBe(200)
    expect((await state()).bid.status).toBe('paid')
  })
})
