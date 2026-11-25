// Server-only PayPal REST integration. A bid is published only after PayPal's
// Orders API confirms a completed capture and its amount/order metadata match.

import { and, eq, sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { bids, listings, paypalEvents, platformLedger } from '../../db/schema.js'
import { PLATFORM } from './platform'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type PayPalObject = Record<string, any>

export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super('PayPal checkout is not configured. Please try again later.')
  }
}

export function paypalEnvironment() {
  const value = process.env.PAYPAL_ENVIRONMENT ?? 'sandbox'
  if (value !== 'sandbox' && value !== 'live') {
    throw new Error('PAYPAL_ENVIRONMENT must be sandbox or live.')
  }
  return value
}

function paypalBaseUrl() {
  return paypalEnvironment() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'
}

export function paymentsConfigured() {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID?.trim() &&
      process.env.PAYPAL_CLIENT_SECRET?.trim() &&
      (process.env.PAYPAL_ENVIRONMENT === 'sandbox' ||
        process.env.PAYPAL_ENVIRONMENT === 'live'),
  )
}

async function accessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new PaymentsNotConfiguredError()
  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!response.ok) throw new Error('PayPal authentication failed.')
  const data = (await response.json()) as { access_token?: string }
  if (!data.access_token) throw new Error('PayPal returned no access token.')
  return data.access_token
}

async function paypalRequest<T extends PayPalObject>(
  path: string,
  init: RequestInit = {},
  requestId?: string,
): Promise<T> {
  const token = await accessToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json')
  if (requestId) headers.set('PayPal-Request-Id', requestId)
  const response = await fetch(`${paypalBaseUrl()}${path}`, { ...init, headers })
  if (!response.ok) {
    const detail = await response.text()
    console.error('PayPal API request failed', response.status, detail.slice(0, 500))
    throw new Error('PayPal could not complete the payment request.')
  }
  return (await response.json()) as T
}

export function money(cents: number) {
  return (cents / 100).toFixed(2)
}

export async function createPayPalOrder({
  bidId,
  listingId,
  title,
  amountCents,
  feeCents,
  totalChargeCents,
  currency,
  returnUrl,
  cancelUrl,
}: {
  bidId: number
  listingId: number
  title: string
  amountCents: number
  feeCents: number
  totalChargeCents: number
  currency: string
  returnUrl: string
  cancelUrl: string
}) {
  const order = await paypalRequest<PayPalObject>(
    '/v2/checkout/orders',
    {
      method: 'POST',
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: String(bidId),
            custom_id: String(bidId),
            description: `Bid on ${title}`.slice(0, 127),
            amount: {
              currency_code: currency.toUpperCase(),
              value: money(totalChargeCents),
              breakdown: {
                item_total: { currency_code: currency.toUpperCase(), value: money(amountCents) },
                handling: { currency_code: currency.toUpperCase(), value: money(feeCents) },
              },
            },
            items: [
              { name: `Bid on ${title}`.slice(0, 127), quantity: '1', unit_amount: { currency_code: currency.toUpperCase(), value: money(amountCents) }, category: 'DIGITAL_GOODS' },
              { name: 'BidMySite platform fee', quantity: '1', unit_amount: { currency_code: currency.toUpperCase(), value: money(feeCents) }, category: 'DIGITAL_GOODS' },
            ],
          },
        ],
        application_context: {
          brand_name: PLATFORM.name,
          user_action: 'PAY_NOW',
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      }),
    },
    `bidmysite-order-${bidId}`,
  )
  const approvalUrl = order.links?.find((link: PayPalObject) => link.rel === 'approve')?.href
  if (order.status !== 'CREATED' || typeof order.id !== 'string' || !approvalUrl) {
    throw new Error('PayPal did not return a valid approval link.')
  }
  return { id: order.id, approvalUrl }
}

function captureForBid(order: PayPalObject, bid: typeof bids.$inferSelect) {
  if (order.status !== 'COMPLETED' || !Array.isArray(order.purchase_units)) return null
  const unit = order.purchase_units.find(
    (item: PayPalObject) => item.custom_id === String(bid.id) && item.reference_id === String(bid.id),
  )
  if (!unit || unit.amount?.currency_code?.toLowerCase() !== bid.currency ||
      unit.amount?.value !== money(bid.totalChargeCents)) return null
  const capture = unit.payments?.captures?.find(
    (item: PayPalObject) => item.status === 'COMPLETED' &&
      item.amount?.currency_code?.toLowerCase() === bid.currency &&
      item.amount?.value === money(bid.totalChargeCents),
  )
  return typeof capture?.id === 'string' ? capture.id : null
}

async function recomputeListingTotals(tx: Tx, listingId: number) {
  await tx.update(listings).set({
    totalCents: sql`coalesce((select sum(${bids.amountCents}) from ${bids} where ${bids.listingId} = ${listingId} and ${bids.status} = 'paid'), 0)`,
    highestBidCents: sql`coalesce((select max(${bids.amountCents}) from ${bids} where ${bids.listingId} = ${listingId} and ${bids.status} = 'paid'), 0)`,
    bidCount: sql`(select count(*) from ${bids} where ${bids.listingId} = ${listingId} and ${bids.status} = 'paid')`,
    lastBidAt: sql`(select max(${bids.paidAt}) from ${bids} where ${bids.listingId} = ${listingId} and ${bids.status} = 'paid')`,
  }).where(eq(listings.id, listingId))
}

/** Applies a completed order read from PayPal, idempotently and transactionally. */
export async function applyCompletedOrder(tx: Tx, order: PayPalObject) {
  const [bidId] = order.purchase_units?.map((unit: PayPalObject) => Number(unit.custom_id)) ?? []
  if (!Number.isInteger(bidId)) return 'unknown-bid' as const
  const [bid] = await tx.select().from(bids)
    .where(and(eq(bids.id, bidId), eq(bids.paypalOrderId, order.id)))
    .for('update')
  if (!bid) return 'unknown-bid' as const
  if (bid.status === 'paid' || bid.status === 'refunded') return 'already-applied' as const
  const captureId = captureForBid(order, bid)
  if (!captureId) return 'unverified' as const
  await tx.update(bids).set({ status: 'paid', paidAt: sql`now()`, paypalCaptureId: captureId }).where(eq(bids.id, bid.id))
  await tx.insert(platformLedger).values({ bidId: bid.id, kind: 'fee', grossCents: bid.amountCents, feeCents: bid.feeCents }).onConflictDoNothing()
  await recomputeListingTotals(tx, bid.listingId)
  return 'applied' as const
}

export async function capturePayPalOrder(bidId: number, orderId: string) {
  const [bid] = await db.select().from(bids).where(eq(bids.id, bidId))
  if (!bid || bid.paypalOrderId !== orderId) throw new Error('Payment order does not match this bid.')
  if (bid.status === 'paid') return
  if (bid.status !== 'pending') throw new Error('This bid is no longer payable.')
  let order = await paypalRequest<PayPalObject>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`)
  if (order.status === 'APPROVED') {
    order = await paypalRequest<PayPalObject>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: 'POST', body: '{}' }, `bidmysite-capture-${bid.id}`)
  }
  const result = await db.transaction((tx) => applyCompletedOrder(tx, order))
  if (result !== 'applied' && result !== 'already-applied') {
    throw new Error('PayPal has not confirmed the expected completed payment.')
  }
}

export async function reconcileBid(bidId: number) {
  const [bid] = await db.select().from(bids).where(eq(bids.id, bidId))
  if (!bid || bid.status !== 'pending' || !bid.paypalOrderId) return
  const order = await paypalRequest<PayPalObject>(`/v2/checkout/orders/${encodeURIComponent(bid.paypalOrderId)}`)
  if (order.status === 'COMPLETED') await db.transaction((tx) => applyCompletedOrder(tx, order))
}

export async function applyRefund(tx: Tx, captureId: string) {
  const [bid] = await tx.select().from(bids).where(eq(bids.paypalCaptureId, captureId)).for('update')
  if (!bid || bid.status !== 'paid') return
  await tx.update(bids).set({ status: 'refunded', refundedAt: sql`now()` }).where(eq(bids.id, bid.id))
  await tx.insert(platformLedger).values({ bidId: bid.id, kind: 'refund', grossCents: -bid.amountCents, feeCents: -bid.feeCents }).onConflictDoNothing()
  await recomputeListingTotals(tx, bid.listingId)
}

/** Verify webhook authenticity by asking PayPal to validate its transmission headers. */
export async function verifyPayPalWebhook(request: Request, event: PayPalObject) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID
  if (!webhookId) throw new PaymentsNotConfiguredError()
  const requiredHeaders = [
    'paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id',
    'paypal-transmission-sig', 'paypal-transmission-time',
  ]
  const transmission = Object.fromEntries(requiredHeaders.map((name) => [name, request.headers.get(name)]))
  if (Object.values(transmission).some((value) => !value)) return false
  const result = await paypalRequest<PayPalObject>('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify({
      auth_algo: transmission['paypal-auth-algo'],
      cert_url: transmission['paypal-cert-url'],
      transmission_id: transmission['paypal-transmission-id'],
      transmission_sig: transmission['paypal-transmission-sig'],
      transmission_time: transmission['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: event,
    }),
  })
  return result.verification_status === 'SUCCESS'
}

export async function processPayPalEvent(event: PayPalObject) {
  if (typeof event.id !== 'string' || typeof event.event_type !== 'string') throw new Error('Invalid PayPal event.')
  await db.transaction(async (tx) => {
    const inserted = await tx.insert(paypalEvents).values({ id: event.id, type: event.event_type }).onConflictDoNothing().returning({ id: paypalEvents.id })
    if (!inserted.length) return
    const resource = event.resource as PayPalObject | undefined
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED' && resource?.id) {
      const orderId = resource.supplementary_data?.related_ids?.order_id
      if (typeof orderId === 'string') {
        const order = await paypalRequest<PayPalObject>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`)
        await applyCompletedOrder(tx, order)
      }
    } else if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED' && typeof resource?.id === 'string') {
      await applyRefund(tx, resource.id)
    }
  })
}

export const CURRENCY = PLATFORM.currency.toLowerCase()
export const CHECKOUT_TTL_SECONDS = 30 * 60
