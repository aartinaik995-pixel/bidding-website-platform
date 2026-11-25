// @vitest-environment node
// Runs the real migrations on an in-memory Postgres (PGlite) and checks that
// only server-verified, correctly priced PayPal payments change rankings and revenue.
// PayPal's HTTP API is replaced with a fake so tests never reach the network.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

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
const { paymentsConfigured, processPayPalWebhook, reconcileBid, siteOrigin } =
  await import('./payments.server')
const { feeBreakdown } = await import('./platform')

type PayPalOrderFixture = ReturnType<typeof paypalOrder>

const paypal = {
  order: null as PayPalOrderFixture | null,
  captured: null as PayPalOrderFixture | null,
  verification: 'SUCCESS',
}

let listingId = 0
let bidId = 0
let seq = 0

function paypalOrder({
  status = 'COMPLETED',
  orderValue = '11.00',
  orderCurrency = 'USD',
  captureValue = '11.00',
  captureStatus = 'COMPLETED',
  captureCurrency = 'USD',
}: {
  status?: string
  orderValue?: string
  orderCurrency?: string
  captureValue?: string
  captureStatus?: string
  captureCurrency?: string
} = {}) {
  return {
    id: 'ORDER1',
    status,
    purchase_units: [
      {
        reference_id: String(bidId),
        custom_id: String(bidId),
        amount: { currency_code: orderCurrency, value: orderValue },
        payments: {
          captures: [
            {
              id: 'CAP1',
              status: captureStatus,
              amount: { currency_code: captureCurrency, value: captureValue },
            },
          ],
        },
      },
    ],
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Stands in for PayPal's REST API (token, order fetch/capture, webhook verification). */
const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input)
  const method = init?.method ?? 'GET'
  if (url.endsWith('/v1/oauth2/token')) return json({ access_token: 'test-token' })
  if (url.endsWith('/v1/notifications/verify-webhook-signature')) {
    return json({ verification_status: paypal.verification })
  }
  if (url.endsWith('/capture') && method === 'POST') {
    return json(paypal.captured ?? paypal.order)
  }
  if (url.includes('/v2/checkout/orders/') && method === 'GET') {
    return json(paypal.order)
  }
  return json({ error: 'unexpected request' }, 500)
})

function webhookRequest(event: unknown, { signed = true } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (signed) {
    Object.assign(headers, {
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-cert-url': 'https://api.sandbox.paypal.com/cert.pem',
      'paypal-transmission-id': `t-${++seq}`,
      'paypal-transmission-sig': 'signature',
      'paypal-transmission-time': '2026-11-25T00:00:00Z',
    })
  }
  return new Request('http://localhost/api/paypal-webhook', {
    method: 'POST',
    body: JSON.stringify(event),
    headers,
  })
}

function captureCompletedEvent(id = `WH-${++seq}`) {
  return {
    id,
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: 'CAP1',
      status: 'COMPLETED',
      supplementary_data: { related_ids: { order_id: 'ORDER1' } },
    },
  }
}

function captureRefundedEvent({
  id = `WH-${++seq}`,
  status = 'COMPLETED',
  amount = '11.00',
}: { id?: string; status?: string; amount?: string } = {}) {
  return {
    id,
    event_type: 'PAYMENT.CAPTURE.REFUNDED',
    resource: {
      id: 'REFUND1',
      status,
      amount: { currency_code: 'USD', value: amount },
      links: [
        {
          rel: 'up',
          href: 'https://api.sandbox.paypal.com/v2/payments/captures/CAP1',
        },
      ],
    },
  }
}

async function state() {
  const [listing] = await db
    .select()
    .from(schema.listings)
    .where(eq(schema.listings.id, listingId))
  const [bid] = await db.select().from(schema.bids).where(eq(schema.bids.id, bidId))
  const ledger = await db.select().from(schema.platformLedger)
  return { listing: listing!, bid: bid!, ledger }
}

beforeAll(() => {
  process.env.PAYPAL_CLIENT_ID = 'client-test'
  process.env.PAYPAL_CLIENT_SECRET = 'secret-test'
  process.env.PAYPAL_WEBHOOK_ID = 'webhook-test'
  process.env.PAYPAL_ENVIRONMENT = 'sandbox'
})

beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock)
  paypal.verification = 'SUCCESS'
  paypal.captured = null

  await db.delete(schema.platformLedger)
  await db.delete(schema.paypalEvents)
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
      paypalOrderId: 'ORDER1',
    })
    .returning()
  bidId = bid!.id
  paypal.order = paypalOrder()
})

afterEach(() => {
  vi.unstubAllGlobals()
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

describe('PayPal webhook processing', () => {
  it('counts a verified capture once, even when PayPal retries', async () => {
    await processPayPalWebhook(webhookRequest(captureCompletedEvent('WH-A')))
    await processPayPalWebhook(webhookRequest(captureCompletedEvent('WH-A')))
    await processPayPalWebhook(webhookRequest(captureCompletedEvent('WH-B')))

    const { listing, bid, ledger } = await state()
    expect(bid.status).toBe('paid')
    expect(bid.paypalCaptureId).toBe('CAP1')
    expect(listing.totalCents).toBe(1000)
    expect(listing.highestBidCents).toBe(1000)
    expect(listing.bidCount).toBe(1)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({ kind: 'fee', grossCents: 1000, feeCents: 100 })
  })

  it('accepts amounts with cents exactly (no floating-point rounding errors)', async () => {
    const { amountCents, feeCents, totalChargeCents } = feeBreakdown(1100)
    await db
      .update(schema.bids)
      .set({ amountCents, feeCents, totalChargeCents })
      .where(eq(schema.bids.id, bidId))
    paypal.order = paypalOrder({ orderValue: '12.10', captureValue: '12.10' })

    await processPayPalWebhook(webhookRequest(captureCompletedEvent()))
    expect((await state()).bid.status).toBe('paid')
  })

  it('ignores unfinished, mismatched or wrong-currency orders', async () => {
    paypal.order = paypalOrder({ status: 'APPROVED' })
    await processPayPalWebhook(webhookRequest(captureCompletedEvent()))
    expect((await state()).bid.status).toBe('pending')

    paypal.order = paypalOrder({ orderValue: '10.00', captureValue: '10.00' })
    await processPayPalWebhook(webhookRequest(captureCompletedEvent()))
    expect((await state()).bid.status).toBe('pending')

    paypal.order = paypalOrder({ captureCurrency: 'EUR' })
    await processPayPalWebhook(webhookRequest(captureCompletedEvent()))

    const { listing, bid, ledger } = await state()
    expect(bid.status).toBe('pending')
    expect(listing.totalCents).toBe(0)
    expect(ledger).toHaveLength(0)
  })

  it('rejects unsigned and failed-verification events without changing anything', async () => {
    await expect(
      processPayPalWebhook(webhookRequest(captureCompletedEvent(), { signed: false })),
    ).rejects.toThrow('missing signature headers')

    paypal.verification = 'FAILURE'
    await expect(
      processPayPalWebhook(webhookRequest(captureCompletedEvent())),
    ).rejects.toThrow('signature verification failed')

    const { bid, ledger } = await state()
    expect(bid.status).toBe('pending')
    expect(ledger).toHaveLength(0)
  })

  it('records a completed refund and removes the bid from rankings', async () => {
    await processPayPalWebhook(webhookRequest(captureCompletedEvent()))
    await processPayPalWebhook(webhookRequest(captureRefundedEvent()))

    const { listing, bid, ledger } = await state()
    expect(bid.status).toBe('refunded')
    expect(listing.totalCents).toBe(0)
    expect(listing.bidCount).toBe(0)
    expect(ledger.map((row) => [row.kind, row.grossCents, row.feeCents])).toEqual([
      ['fee', 1000, 100],
      ['refund', -1000, -100],
    ])
  })

  it('waits for a completed refund before changing rankings', async () => {
    await processPayPalWebhook(webhookRequest(captureCompletedEvent()))
    await processPayPalWebhook(webhookRequest(captureRefundedEvent({ status: 'PENDING' })))

    expect((await state()).bid.status).toBe('paid')
  })
})

describe('bid reconciliation', () => {
  it('captures an approved PayPal order and counts it once', async () => {
    paypal.order = paypalOrder({ status: 'APPROVED' })
    paypal.captured = paypalOrder()

    await reconcileBid(bidId)
    const { listing, bid } = await state()
    expect(bid.status).toBe('paid')
    expect(listing.totalCents).toBe(1000)
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith('/capture')),
    ).toBe(true)
  })
})

describe('public rankings', () => {
  it('only ranks listings with verified payments', async () => {
    expect((await loadLeaderboardData()).leaderboard).toHaveLength(0)
    expect((await loadListingPage('example', null))?.listing.rank).toBe(0)

    await processPayPalWebhook(webhookRequest(captureCompletedEvent()))
    const board = await loadLeaderboardData()
    expect(
      board.leaderboard.map((l: { slug: string; rank: number; totalCents: number }) => [
        l.slug,
        l.rank,
        l.totalCents,
      ]),
    ).toEqual([['example', 1, 1000]])
    expect(board.stats).toEqual({ listingCount: 1, bidCount: 1, totalBidCents: 1000 })
    expect(board.recentBids).toHaveLength(1)

    const page = await loadListingPage('example', null)
    expect(page?.listing.rank).toBe(1)
    expect(page?.bids.map((b: { amountCents: number }) => b.amountCents)).toEqual([1000])
  })

  it('opens new listings for bidding immediately, with no approval step', async () => {
    const [created] = await db
      .insert(schema.listings)
      .values({
        slug: 'brand-new',
        url: 'https://new.example.com/',
        title: 'Brand new',
        description: 'Submitted just now',
        ownerId: 'u1',
        ownerName: 'Owner',
        contactEmail: 'owner@example.com',
      })
      .returning()
    expect(created!.status).toBe('approved')
    expect(await loadListingPage('brand-new', null)).not.toBeNull()
  })

  it('hides removed listings from the public', async () => {
    await db.update(schema.listings).set({ status: 'removed' })
    expect(await loadListingPage('example', null)).toBeNull()
    const owner = { id: 'u1', email: 'owner@example.com', name: 'Owner', isAdmin: false }
    expect((await loadListingPage('example', owner))?.isOwner).toBe(true)
  })
})

describe('PayPal webhook endpoint', () => {
  async function post(event: unknown, { signed = true } = {}) {
    const { Route } = await import('../routes/api.paypal-webhook')
    const handlers = (
      Route.options as unknown as {
        server: {
          handlers: Record<string, (ctx: { request: Request }) => Promise<Response>>
        }
      }
    ).server.handlers
    return handlers.POST!({ request: webhookRequest(event, { signed }) })
  }

  it('rejects unsigned and unverified events with 400', async () => {
    expect((await post(captureCompletedEvent(), { signed: false })).status).toBe(400)
    paypal.verification = 'FAILURE'
    expect((await post(captureCompletedEvent())).status).toBe(400)
    expect((await state()).bid.status).toBe('pending')
  })

  it('accepts a verified event, applies it, and acknowledges retries', async () => {
    const event = captureCompletedEvent('WH-ENDPOINT')
    expect((await post(event)).status).toBe(200)
    expect((await post(event)).status).toBe(200)
    expect((await state()).bid.status).toBe('paid')
  })
})

describe('reversals and disputes', () => {
  function disputeEvent(type: string, resource: Record<string, unknown> = {}) {
    return {
      id: `WH-${++seq}`,
      event_type: type,
      resource: { disputed_transactions: [{ seller_transaction_id: 'CAP1' }], ...resource },
    }
  }

  it('removes a reversed (charged back) payment from rankings and records a refund', async () => {
    await processPayPalWebhook(webhookRequest(captureCompletedEvent()))
    await processPayPalWebhook(
      webhookRequest({
        id: `WH-${++seq}`,
        event_type: 'PAYMENT.CAPTURE.REVERSED',
        resource: { id: 'CAP1', status: 'REVERSED' },
      }),
    )
    const { listing, bid, ledger } = await state()
    expect(bid.status).toBe('refunded')
    expect(listing.totalCents).toBe(0)
    expect(ledger.map((row) => row.kind)).toEqual(['fee', 'refund'])
  })

  it('pauses a bid while a dispute is open and restores it when the seller wins', async () => {
    await processPayPalWebhook(webhookRequest(captureCompletedEvent()))
    await processPayPalWebhook(webhookRequest(disputeEvent('CUSTOMER.DISPUTE.CREATED')))

    let state1 = await state()
    expect(state1.bid.status).toBe('disputed')
    expect(state1.listing.totalCents).toBe(0)
    expect(state1.ledger).toHaveLength(1)

    await processPayPalWebhook(
      webhookRequest(
        disputeEvent('CUSTOMER.DISPUTE.RESOLVED', {
          dispute_outcome: { outcome_code: 'RESOLVED_SELLER_FAVOUR' },
        }),
      ),
    )
    state1 = await state()
    expect(state1.bid.status).toBe('paid')
    expect(state1.listing.totalCents).toBe(1000)
    expect(state1.ledger).toHaveLength(1)
  })

  it('refunds a disputed bid when the buyer wins', async () => {
    await processPayPalWebhook(webhookRequest(captureCompletedEvent()))
    await processPayPalWebhook(webhookRequest(disputeEvent('CUSTOMER.DISPUTE.CREATED')))
    await processPayPalWebhook(
      webhookRequest(
        disputeEvent('CUSTOMER.DISPUTE.RESOLVED', {
          dispute_outcome: { outcome_code: 'RESOLVED_BUYER_FAVOUR' },
        }),
      ),
    )
    const { listing, bid, ledger } = await state()
    expect(bid.status).toBe('refunded')
    expect(listing.totalCents).toBe(0)
    expect(ledger.map((row) => row.kind)).toEqual(['fee', 'refund'])
  })

  it('keeps a bid paused when the dispute outcome is unrecognized', async () => {
    await processPayPalWebhook(webhookRequest(captureCompletedEvent()))
    await processPayPalWebhook(webhookRequest(disputeEvent('CUSTOMER.DISPUTE.CREATED')))
    await processPayPalWebhook(
      webhookRequest(
        disputeEvent('CUSTOMER.DISPUTE.RESOLVED', {
          dispute_outcome: { outcome_code: 'SOMETHING_NEW' },
        }),
      ),
    )
    expect((await state()).bid.status).toBe('disputed')
  })

  it('does not reopen a bid that was already refunded when a late dispute arrives', async () => {
    await processPayPalWebhook(webhookRequest(captureCompletedEvent()))
    await processPayPalWebhook(
      webhookRequest({
        id: `WH-${++seq}`,
        event_type: 'PAYMENT.CAPTURE.REVERSED',
        resource: { id: 'CAP1', status: 'REVERSED' },
      }),
    )
    await processPayPalWebhook(webhookRequest(disputeEvent('CUSTOMER.DISPUTE.CREATED')))
    expect((await state()).bid.status).toBe('refunded')
  })
})

describe('PayPal configuration', () => {
  const keys = ['PAYPAL_ENVIRONMENT', 'CONTEXT'] as const

  function withEnv(values: Partial<Record<(typeof keys)[number], string | undefined>>, run: () => void) {
    const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
    try {
      for (const key of keys) {
        if (key in values) {
          if (values[key] === undefined) delete process.env[key]
          else process.env[key] = values[key]
        }
      }
      run()
    } finally {
      for (const key of keys) {
        if (saved[key] === undefined) delete process.env[key]
        else process.env[key] = saved[key]
      }
    }
  }

  it('stays disabled when PAYPAL_ENVIRONMENT is not set (no implicit sandbox)', () => {
    withEnv({ PAYPAL_ENVIRONMENT: undefined }, () => {
      expect(paymentsConfigured()).toBe(false)
    })
  })

  it('rejects an unknown environment value', () => {
    withEnv({ PAYPAL_ENVIRONMENT: 'prod' }, () => {
      expect(paymentsConfigured()).toBe(false)
    })
  })

  it('requires live credentials on production deploys', () => {
    withEnv({ PAYPAL_ENVIRONMENT: 'sandbox', CONTEXT: 'production' }, () => {
      expect(paymentsConfigured()).toBe(false)
    })
    withEnv({ PAYPAL_ENVIRONMENT: 'live', CONTEXT: 'production' }, () => {
      expect(paymentsConfigured()).toBe(true)
    })
  })

  it('allows sandbox on previews and branch deploys', () => {
    withEnv({ PAYPAL_ENVIRONMENT: 'sandbox', CONTEXT: 'deploy-preview' }, () => {
      expect(paymentsConfigured()).toBe(true)
    })
    withEnv({ PAYPAL_ENVIRONMENT: 'sandbox', CONTEXT: 'branch-deploy' }, () => {
      expect(paymentsConfigured()).toBe(true)
    })
    withEnv({ PAYPAL_ENVIRONMENT: 'sandbox', CONTEXT: undefined }, () => {
      expect(paymentsConfigured()).toBe(true)
    })
  })

  it('never uses live credentials outside the production deploy', () => {
    withEnv({ PAYPAL_ENVIRONMENT: 'live', CONTEXT: 'deploy-preview' }, () => {
      expect(paymentsConfigured()).toBe(false)
    })
    withEnv({ PAYPAL_ENVIRONMENT: 'live', CONTEXT: 'branch-deploy' }, () => {
      expect(paymentsConfigured()).toBe(false)
    })
    withEnv({ PAYPAL_ENVIRONMENT: 'live', CONTEXT: undefined }, () => {
      expect(paymentsConfigured()).toBe(false)
    })
  })
})

describe('partial refunds', () => {
  it('leaves the bid paid when only part of the payment was refunded', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await processPayPalWebhook(webhookRequest(captureCompletedEvent()))
      await processPayPalWebhook(webhookRequest(captureRefundedEvent({ amount: '5.00' })))
      const { listing, bid, ledger } = await state()
      expect(bid.status).toBe('paid')
      expect(listing.totalCents).toBe(1000)
      expect(ledger.map((row) => row.kind)).toEqual(['fee'])
      expect(error).toHaveBeenCalledWith(expect.stringContaining('partial refund'))
    } finally {
      error.mockRestore()
    }
  })

  it('refunds the bid when the full charge was refunded', async () => {
    await processPayPalWebhook(webhookRequest(captureCompletedEvent()))
    await processPayPalWebhook(webhookRequest(captureRefundedEvent({ amount: '11.00' })))
    expect((await state()).bid.status).toBe('refunded')
  })

  it('leaves a disputed bid alone when a buyer-won dispute is only partly refunded', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await processPayPalWebhook(webhookRequest(captureCompletedEvent()))
      await processPayPalWebhook(
        webhookRequest({
          id: `WH-${++seq}`,
          event_type: 'CUSTOMER.DISPUTE.CREATED',
          resource: { disputed_transactions: [{ seller_transaction_id: 'CAP1' }] },
        }),
      )
      await processPayPalWebhook(
        webhookRequest({
          id: `WH-${++seq}`,
          event_type: 'CUSTOMER.DISPUTE.RESOLVED',
          resource: {
            disputed_transactions: [{ seller_transaction_id: 'CAP1' }],
            dispute_outcome: { outcome_code: 'RESOLVED_BUYER_FAVOUR' },
            dispute_amount: { currency_code: 'USD', value: '5.00' },
          },
        }),
      )
      expect((await state()).bid.status).toBe('disputed')
      expect(error).toHaveBeenCalledWith(expect.stringContaining('partial refund'))
    } finally {
      error.mockRestore()
    }
  })
})

describe('dispute references', () => {
  it('logs a warning and changes nothing when a dispute names no capture', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await processPayPalWebhook(webhookRequest(captureCompletedEvent()))
      await processPayPalWebhook(
        webhookRequest({ id: `WH-${++seq}`, event_type: 'CUSTOMER.DISPUTE.CREATED', resource: {} }),
      )
      expect((await state()).bid.status).toBe('paid')
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('dispute has no capture reference'))
    } finally {
      warn.mockRestore()
    }
  })

  it('logs a warning when a dispute names a capture no bid matches', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await processPayPalWebhook(
        webhookRequest({
          id: `WH-${++seq}`,
          event_type: 'CUSTOMER.DISPUTE.CREATED',
          resource: { disputed_transactions: [{ seller_transaction_id: 'CAP-UNKNOWN' }] },
        }),
      )
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('CAP-UNKNOWN'))
    } finally {
      warn.mockRestore()
    }
  })
})

describe('SITE_URL for PayPal return links', () => {
  function withSiteUrl(value: string | undefined, run: () => void) {
    const saved = process.env.SITE_URL
    try {
      if (value === undefined) delete process.env.SITE_URL
      else process.env.SITE_URL = value
      run()
    } finally {
      if (saved === undefined) delete process.env.SITE_URL
      else process.env.SITE_URL = saved
    }
  }

  it('fails when SITE_URL is not set', () => {
    withSiteUrl(undefined, () => {
      expect(() => siteOrigin()).toThrow('SITE_URL is not set')
    })
  })

  it('accepts a public https address and returns its origin', () => {
    withSiteUrl('https://bidmysite.example/some/path', () => {
      expect(siteOrigin()).toBe('https://bidmysite.example')
    })
  })

  it('rejects plain http for public hosts', () => {
    withSiteUrl('http://bidmysite.example', () => {
      expect(() => siteOrigin()).toThrow('must use https')
    })
  })

  it('allows http only for localhost development', () => {
    withSiteUrl('http://localhost:8888', () => {
      expect(siteOrigin()).toBe('http://localhost:8888')
    })
  })

  it('rejects values that are not URLs', () => {
    withSiteUrl('not a url', () => {
      expect(() => siteOrigin()).toThrow('not a valid URL')
    })
  })
})
