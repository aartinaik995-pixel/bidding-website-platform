// Server-only PayPal REST integration. A bid is published only after the
// PayPal API confirms a completed capture that matches its persisted bid.

import { and, eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { bids, listings, paypalEvents, platformLedger } from '../../db/schema.js'
import { PLATFORM } from './platform'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type JsonObject = Record<string, unknown>

export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super('PayPal checkout is not configured. Please try again later.')
  }
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null
}

function environment() {
  const value = process.env.PAYPAL_ENVIRONMENT
  if (value !== 'sandbox' && value !== 'live') {
    throw new PaymentsNotConfiguredError()
  }
  return value
}

function apiBase() {
  return environment() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'
}

export function paymentsConfigured() {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID?.trim() &&
      process.env.PAYPAL_CLIENT_SECRET?.trim() &&
      (process.env.PAYPAL_ENVIRONMENT === 'sandbox' ||
        process.env.PAYPAL_ENVIRONMENT === 'live') &&
      process.env.PAYPAL_WEBHOOK_ID?.trim(),
  )
}

async function getAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim()
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) throw new PaymentsNotConfiguredError()
  const response = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!response.ok) throw new Error('PayPal authentication failed.')
  const body = asObject(await response.json())
  if (typeof body?.access_token !== 'string') throw new Error('PayPal returned no access token.')
  return body.access_token
}

export async function paypalRequest<T extends JsonObject>(
  path: string,
  init: RequestInit = {},
  requestId?: string,
): Promise<T> {
  const token = await getAccessToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json')
  if (requestId) headers.set('PayPal-Request-Id', requestId)
  const response = await fetch(`${apiBase()}${path}`, { ...init, headers })
  if (!response.ok) {
    const details = (await response.text()).slice(0, 500)
    console.error('PayPal API request failed', response.status, details)
    throw new Error('PayPal could not complete the payment request.')
  }
  return (await response.json()) as T
}

export function money(cents: number) {
  return (cents / 100).toFixed(2)
}

export async function createPayPalOrder({
  bidId, title, amountCents, feeCents, totalChargeCents, currency, returnUrl, cancelUrl,
}: {
  bidId: number; title: string; amountCents: number; feeCents: number
  totalChargeCents: number; currency: string; returnUrl: string; cancelUrl: string
}) {
  const code = currency.toUpperCase()
  const order = await paypalRequest<JsonObject>('/v2/checkout/orders', {
    method: 'POST',
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: String(bidId),
        custom_id: String(bidId),
        description: `Bid on ${title}`.slice(0, 127),
        amount: {
          currency_code: code,
          value: money(totalChargeCents),
          breakdown: { item_total: { currency_code: code, value: money(totalChargeCents) } },
        },
        items: [
          { name: `Bid on ${title}`.slice(0, 127), quantity: '1', unit_amount: { currency_code: code, value: money(amountCents) }, category: 'DIGITAL_GOODS' },
          { name: 'BidMySite platform fee', quantity: '1', unit_amount: { currency_code: code, value: money(feeCents) }, category: 'DIGITAL_GOODS' },
        ],
      }],
      application_context: {
        brand_name: PLATFORM.name, user_action: 'PAY_NOW', return_url: returnUrl, cancel_url: cancelUrl,
      },
    }),
  }, `bidmysite-order-${bidId}`)
  const links = Array.isArray(order.links) ? order.links : []
  const approve = links.map(asObject).find((link) => link?.rel === 'approve')
  if (order.status !== 'CREATED' || typeof order.id !== 'string' || typeof approve?.href !== 'string') {
    throw new Error('PayPal did not return a valid approval link.')
  }
  return { id: order.id, approvalUrl: approve.href }
}

function matchingCapture(order: JsonObject, bid: typeof bids.$inferSelect) {
  if (order.status !== 'COMPLETED' || typeof order.id !== 'string') return null
  const units = Array.isArray(order.purchase_units) ? order.purchase_units.map(asObject) : []
  const unit = units.find((item) => item?.custom_id === String(bid.id) && item.reference_id === String(bid.id))
  const amount = asObject(unit?.amount)
  if (!unit || amount?.currency_code !== bid.currency.toUpperCase() || amount.value !== money(bid.totalChargeCents)) return null
  const payments = asObject(unit.payments)
  const captures = Array.isArray(payments?.captures) ? payments.captures.map(asObject) : []
  const capture = captures.find((item) => {
    const capturedAmount = asObject(item?.amount)
    return item?.status === 'COMPLETED' && capturedAmount?.currency_code === bid.currency.toUpperCase() && capturedAmount.value === money(bid.totalChargeCents)
  })
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

/** Apply an order fetched directly from PayPal. Safe to retry. */
export async function applyCompletedOrder(tx: Tx, order: JsonObject) {
  if (typeof order.id !== 'string') return 'unknown-order' as const
  const units = Array.isArray(order.purchase_units) ? order.purchase_units.map(asObject) : []
  const bidId = Number(units.find((unit) => unit?.custom_id)?.custom_id)
  if (!Number.isInteger(bidId)) return 'unknown-bid' as const
  const [bid] = await tx.select().from(bids)
    .where(and(eq(bids.id, bidId), eq(bids.paypalOrderId, order.id)))
    .for('update')
  if (!bid) return 'unknown-bid' as const
  if (bid.status === 'paid' || bid.status === 'refunded') return 'already-applied' as const
  const captureId = matchingCapture(order, bid)
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
  let order = await paypalRequest<JsonObject>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`)
  if (order.status === 'APPROVED') {
    order = await paypalRequest<JsonObject>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: 'POST', body: '{}' }, `bidmysite-capture-${bid.id}`)
  }
  const result = await db.transaction((tx) => applyCompletedOrder(tx, order))
  if (result !== 'applied' && result !== 'already-applied') throw new Error('PayPal has not confirmed the expected completed payment.')
}

export async function reconcileBid(bidId: number) {
  const [bid] = await db.select().from(bids).where(eq(bids.id, bidId))
  if (!bid || bid.status !== 'pending' || !bid.paypalOrderId) return
  const order = await paypalRequest<JsonObject>(`/v2/checkout/orders/${encodeURIComponent(bid.paypalOrderId)}`)
  if (order.status === 'COMPLETED') await db.transaction((tx) => applyCompletedOrder(tx, order))
}

export async function applyRefund(tx: Tx, captureId: string) {
  const [bid] = await tx.select().from(bids).where(eq(bids.paypalCaptureId, captureId)).for('update')
  if (!bid || bid.status !== 'paid') return
  await tx.update(bids).set({ status: 'refunded', refundedAt: sql`now()` }).where(eq(bids.id, bid.id))
  await tx.insert(platformLedger).values({ bidId: bid.id, kind: 'refund', grossCents: -bid.amountCents, feeCents: -bid.feeCents }).onConflictDoNothing()
  await recomputeListingTotals(tx, bid.listingId)
}

export async function refundPayPalCapture(captureId: string, bidId: number) {
  return paypalRequest<JsonObject>(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, { method: 'POST', body: '{}' }, `bidmysite-refund-${bidId}`)
}

/** PayPal authenticates webhook payloads by API verification of transmission headers. */
export async function verifyPayPalWebhook(request: Request, event: JsonObject) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim()
  if (!webhookId) throw new PaymentsNotConfiguredError()
  const names = ['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time']
  const transmission = Object.fromEntries(names.map((name) => [name, request.headers.get(name)]))
  if (Object.values(transmission).some((value) => !value)) return false
  const result = await paypalRequest<JsonObject>('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify({
      auth_algo: transmission['paypal-auth-algo'], cert_url: transmission['paypal-cert-url'],
      transmission_id: transmission['paypal-transmission-id'], transmission_sig: transmission['paypal-transmission-sig'],
      transmission_time: transmission['paypal-transmission-time'], webhook_id: webhookId, webhook_event: event,
    }),
  })
  return result.verification_status === 'SUCCESS'
}

export async function processPayPalEvent(event: JsonObject) {
  if (typeof event.id !== 'string' || typeof event.event_type !== 'string') throw new Error('Invalid PayPal event.')
  const resource = asObject(event.resource)
  let order: JsonObject | null = null
  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    const related = asObject(asObject(resource?.supplementary_data)?.related_ids)
    if (typeof related?.order_id === 'string') {
      // Query PayPal before opening the database transaction; never trust event payload amounts.
      order = await paypalRequest<JsonObject>(`/v2/checkout/orders/${encodeURIComponent(related.order_id)}`)
    }
  }
  await db.transaction(async (tx) => {
    const inserted = await tx.insert(paypalEvents).values({ id: event.id as string, type: event.event_type as string }).onConflictDoNothing().returning({ id: paypalEvents.id })
    if (!inserted.length) return
    if (order) await applyCompletedOrder(tx, order)
    if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED' && typeof resource?.id === 'string') await applyRefund(tx, resource.id)
  })
}

export const CURRENCY = PLATFORM.currency.toLowerCase()
export const CHECKOUT_TTL_SECONDS = 30 * 60
