// Server-only Stripe integration. A bid becomes "paid" only here, and only
// from data Stripe itself returned: a signature-verified webhook event or a
// session fetched from the Stripe API with the secret key.

import Stripe from 'stripe'
import { and, eq, sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import {
  bids,
  listings,
  platformLedger,
  stripeEvents,
} from '../../db/schema.js'
import { PLATFORM } from './platform'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super('Payments are not configured yet.')
  }
}

let client: Stripe | null = null

/** Returns a Stripe client, or null when STRIPE_SECRET_KEY is not set. */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  client ??= new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 })
  return client
}

export function paymentsConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET,
  )
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
    .where(eq(listings.id, listingId))
}

function paymentIntentId(value: string | { id: string } | null | undefined) {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

/**
 * Marks the bid behind a Stripe Checkout Session as paid, writes the fee
 * ledger row and updates the listing totals. Safe to call more than once.
 */
export async function applyPaidSession(
  tx: Tx,
  session: Stripe.Checkout.Session,
) {
  if (session.payment_status !== 'paid') return 'not-paid' as const
  const bidId = Number(session.metadata?.bidId ?? session.client_reference_id)
  if (!Number.isInteger(bidId)) return 'unknown-bid' as const

  const [bid] = await tx
    .select()
    .from(bids)
    .where(and(eq(bids.id, bidId), eq(bids.stripeSessionId, session.id)))
    .for('update')
  if (!bid) return 'unknown-bid' as const
  if (bid.status === 'paid' || bid.status === 'refunded')
    return 'already-applied' as const

  // The charged amount must match what the server priced; never trust anything else.
  if (
    session.amount_total !== bid.totalChargeCents ||
    session.currency?.toLowerCase() !== bid.currency
  ) {
    console.error(
      `Stripe session ${session.id} amount mismatch for bid ${bid.id}`,
    )
    return 'amount-mismatch' as const
  }

  await tx
    .update(bids)
    .set({
      status: 'paid',
      paidAt: sql`now()`,
      stripePaymentIntentId: paymentIntentId(session.payment_intent),
    })
    .where(eq(bids.id, bid.id))
  await tx
    .insert(platformLedger)
    .values({
      bidId: bid.id,
      kind: 'fee',
      grossCents: bid.amountCents,
      feeCents: bid.feeCents,
    })
    .onConflictDoNothing()
  await recomputeListingTotals(tx, bid.listingId)
  return 'applied' as const
}

/** Marks a still-pending bid as failed (expired or failed checkout). */
export async function applyFailedSession(
  tx: Tx,
  session: Stripe.Checkout.Session,
) {
  await tx
    .update(bids)
    .set({ status: 'failed' })
    .where(
      and(eq(bids.stripeSessionId, session.id), eq(bids.status, 'pending')),
    )
}

/** Removes a fully refunded bid from the rankings and records the refund in the ledger. */
export async function applyRefund(tx: Tx, paymentIntent: string) {
  const [bid] = await tx
    .select()
    .from(bids)
    .where(eq(bids.stripePaymentIntentId, paymentIntent))
    .for('update')
  if (!bid || bid.status !== 'paid') return
  await tx
    .update(bids)
    .set({ status: 'refunded', refundedAt: sql`now()` })
    .where(eq(bids.id, bid.id))
  await tx
    .insert(platformLedger)
    .values({
      bidId: bid.id,
      kind: 'refund',
      grossCents: -bid.amountCents,
      feeCents: -bid.feeCents,
    })
    .onConflictDoNothing()
  await recomputeListingTotals(tx, bid.listingId)
}

/** Handles a signature-verified Stripe event exactly once. */
export async function processStripeEvent(event: Stripe.Event) {
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(stripeEvents)
      .values({ id: event.id, type: event.type })
      .onConflictDoNothing()
      .returning({ id: stripeEvents.id })
    if (inserted.length === 0) return // Already processed (Stripe retry).

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await applyPaidSession(tx, event.data.object)
        break
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed':
        await applyFailedSession(tx, event.data.object)
        break
      case 'charge.refunded': {
        const charge = event.data.object
        const intent = paymentIntentId(charge.payment_intent)
        if (charge.refunded && intent) await applyRefund(tx, intent)
        break
      }
    }
  })
}

/**
 * Fallback for when the webhook is slow: asks Stripe directly for the
 * session's status. Uses the secret key, so the answer is authoritative.
 */
export async function reconcileBid(bidId: number) {
  const stripe = getStripe()
  if (!stripe) return
  const [bid] = await db.select().from(bids).where(eq(bids.id, bidId))
  if (!bid || bid.status !== 'pending' || !bid.stripeSessionId) return
  const session = await stripe.checkout.sessions.retrieve(bid.stripeSessionId)
  if (session.payment_status === 'paid') {
    await db.transaction((tx) => applyPaidSession(tx, session))
  } else if (session.status === 'expired') {
    await db.transaction((tx) => applyFailedSession(tx, session))
  }
}

export const CHECKOUT_TTL_SECONDS = 30 * 60
export const CURRENCY = PLATFORM.currency.toLowerCase()
