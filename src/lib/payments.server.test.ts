// @vitest-environment node
// Exercises the real migrations and database-backed PayPal capture application.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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
    await client.exec(readFileSync(join(dir, migration, 'migration.sql'), 'utf8'))
  }
  return { db: drizzle({ client, schema: schemaModule }) }
})

const { db } = await import('../../db/index.js')
const { applyCompletedOrder, applyRefund } = await import('./payments.server')
const { loadLeaderboardData, loadListingPage } = await import('./listings.server')
const { feeBreakdown } = await import('./platform')
let listingId = 0
let bidId = 0

async function state() {
  const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, listingId))
  const [bid] = await db.select().from(schema.bids).where(eq(schema.bids.id, bidId))
  return { listing: listing!, bid: bid!, ledger: await db.select().from(schema.platformLedger) }
}

beforeEach(async () => {
  await db.delete(schema.platformLedger)
  await db.delete(schema.paypalEvents)
  await db.delete(schema.bids)
  await db.delete(schema.listings)
  await db.delete(schema.users)
  await db.insert(schema.users).values({ id: 'u1', email: 'owner@example.com', name: 'Owner' })
  const [listing] = await db.insert(schema.listings).values({
    slug: 'example', url: 'https://example.com/', title: 'Example',
    description: 'An example website', ownerId: 'u1', ownerName: 'Owner',
    contactEmail: 'owner@example.com', status: 'approved',
  }).returning()
  listingId = listing!.id
  const { amountCents, feeCents, totalChargeCents } = feeBreakdown(1000)
  const [bid] = await db.insert(schema.bids).values({
    listingId, bidderId: 'u1', bidderName: 'Owner', amountCents, feeCents,
    totalChargeCents, currency: 'usd', paypalOrderId: 'ORDER-1',
  }).returning()
  bidId = bid!.id
})

function completedOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ORDER-1', status: 'COMPLETED',
    purchase_units: [{
      custom_id: String(bidId), reference_id: String(bidId),
      amount: { currency_code: 'USD', value: '11.00' },
      payments: { captures: [{ id: 'CAPTURE-1', status: 'COMPLETED', amount: { currency_code: 'USD', value: '11.00' } }] },
    }],
    ...overrides,
  }
}

describe('PayPal verified bidding', () => {
  it('counts only a matching completed capture, once, and updates the leaderboard', async () => {
    expect(await applyCompletedOrder(db, completedOrder())).toBe('applied')
    expect(await applyCompletedOrder(db, completedOrder())).toBe('already-applied')
    const result = await state()
    expect(result.bid).toMatchObject({ status: 'paid', paypalCaptureId: 'CAPTURE-1' })
    expect(result.listing).toMatchObject({ totalCents: 1000, highestBidCents: 1000, bidCount: 1 })
    expect(result.ledger).toHaveLength(1)
    expect((await loadLeaderboardData()).leaderboard.map((row) => row.slug)).toEqual(['example'])
    expect((await loadListingPage('example', null))?.listing.rank).toBe(1)
  })

  it.each([
    ['not completed', { status: 'APPROVED' }],
    ['incorrect order', { id: 'ORDER-OTHER' }],
    ['wrong bid metadata', { purchase_units: [{ custom_id: '999', reference_id: '999', amount: { currency_code: 'USD', value: '11.00' }, payments: { captures: [{ id: 'CAPTURE-1', status: 'COMPLETED', amount: { currency_code: 'USD', value: '11.00' } }] } }] }],
    ['wrong charged total', { purchase_units: [{ custom_id: String(bidId), reference_id: String(bidId), amount: { currency_code: 'USD', value: '1.00' }, payments: { captures: [{ id: 'CAPTURE-1', status: 'COMPLETED', amount: { currency_code: 'USD', value: '1.00' } }] } }] }],
    ['wrong currency', { purchase_units: [{ custom_id: String(bidId), reference_id: String(bidId), amount: { currency_code: 'EUR', value: '11.00' }, payments: { captures: [{ id: 'CAPTURE-1', status: 'COMPLETED', amount: { currency_code: 'EUR', value: '11.00' } }] } }] }],
  ])('does not count %s', async (_label, override) => {
    expect(await applyCompletedOrder(db, completedOrder(override))).not.toBe('applied')
    const result = await state()
    expect(result.bid.status).toBe('pending')
    expect(result.listing.totalCents).toBe(0)
    expect(result.ledger).toHaveLength(0)
  })

  it('removes a bid from rankings and writes one refund ledger entry', async () => {
    await applyCompletedOrder(db, completedOrder())
    await db.transaction((tx) => applyRefund(tx, 'CAPTURE-1'))
    const result = await state()
    expect(result.bid.status).toBe('refunded')
    expect(result.listing).toMatchObject({ totalCents: 0, bidCount: 0 })
    expect(result.ledger.map((entry) => [entry.kind, entry.grossCents, entry.feeCents])).toEqual([
      ['fee', 1000, 100], ['refund', -1000, -100],
    ])
  })
})
