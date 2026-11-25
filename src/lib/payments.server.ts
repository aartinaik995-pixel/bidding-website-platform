// Server-only PayPal integration. Payment status changes only after the PayPal
// Orders API or a signature-verified PayPal webhook confirms the transaction.

import { and, eq, sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { bids, listings, paypalEvents, platformLedger } from '../../db/schema.js'
import { PLATFORM } from './platform'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type PayPalLink = { rel: string; href: string }
type PayPalOrder = {
  id: string
  status: string
  links?: PayPalLink[]
  purchase_units?: Array<{
    reference_id?: string
    custom_id?: string
    amount?: { currency_code?: string; value?: string }
    payments?: { captures?: Array<{ id: string; status: string; amount?: { currency_code?: string; value?: string } }> }
  }>
}

export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super('PayPal payments are not configured yet.')
  }
}

function credentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET
  const webhookId = process.env.PAYPAL_WEBHOOK_ID
  const environment = process.env.PAYPAL_ENVIRONMENT ?? 'sandbox'
  if (!clientId || !clientSecret || !webhookId) return null
  if (environment !== 'sandbox' && environment !== 'live') return null
  return {
    clientId,
    clientSecret,
    webhookId,
    baseUrl:
      environment === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com',
  }
}

export function paymentsConfigured() {
  return credentials() !== null
}

async function accessToken() {
  const config = credentials()
  if (!config) throw new PaymentsNotConfiguredError()
  const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!response.ok) throw new Error('PayPal authentication failed.')
  const data = (await response.json()) as { access_token?: string }
  if (!data.access_token) throw new Error('PayPal did not return an access token.')
  return { token: data.access_token, config }
}

async function paypalRequest<T>(path: string, init: RequestInit = {}) {
  const { token, config } = await accessToken()
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  if (!response.ok) {
    // Do not leak provider response data, request headers, or secrets to callers.
    console.error('PayPal API request failed', path, response.status)
    throw new Error('PayPal could not complete the payment request.')
  }
  return (await response.json()) as T
}

export async function createPayPalOrder(input: {
  bidId: number
  totalChargeCents: number
  title: string
  returnUrl: string
  cancelUrl: string
}) {
  const order = await paypalRequest<PayPalOrder>('/v2/checkout/orders', {
    method: 'POST',
    headers: { 'PayPal-Request-Id': `bidmysite-order-${input.bidId}` },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: String(input.bidId),
          custom_id: String(input.bidId),
          description: `Bid on ${input.title}`.slice(0, 127),
          amount: {
            currency_code: PLATFORM.currency,
            value: (input.totalChargeCents / 100).toFixed(2),
          },
        },
      ],
      application_context: {
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
        user_action: 'PAY_NOW',
      },
    }),
  })
  const approvalUrl = order.links?.find((link) => link.rel === 'approve')?.href
  if (!order.id || !approvalUrl) throw new Error('PayPal did not return an approval URL.')
  return { orderId: order.id, approvalUrl }
}

async function fetchOrder(orderId: string) {
  return paypalRequest<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`)
}

async function captureOrder(orderId: string) {
  return paypalRequest<PayPalOrder>(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: 'POST',
      headers: { 'PayPal-Request-Id': `bidmysite-capture-${orderId}` },
      body: '{}',
    },
  )
}

function dollarsToCents(value: string | undefined) {
  if (!value || !/^\d+(\.\d{1,2})?$/.test(value)) return null
  return Math.round(Number(value) * 100)
}

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

async function applyPaidOrder(tx: Tx, order: PayPalOrder) {
  if (order.status !== 'COMPLETED') return 'not-paid' as const
  const unit = order.purchase_units?.[0]
  const capture = unit?.payments?.captures?.find((entry) => entry.status === 'COMPLETED')
  const bidId = Number(unit?.custom_id ?? unit?.reference_id)
  if (!Number.isInteger(bidId) || !capture?.id) return 'unknown-bid' as const

  const [bid] = await tx
    .select()
    .from(bids)
    .where(and(eq(bids.id, bidId), eq(bids.paypalOrderId, order.id)))
    .for('update')
  if (!bid) return 'unknown-bid' as const
  if (bid.status === 'paid' || bid.status === 'refunded') return 'already-applied' as const

  if (
    dollarsToCents(unit?.amount?.value) !== bid.totalChargeCents ||
    unit?.amount?.currency_code?.toLowerCase() !== bid.currency
  ) {
    console.error('PayPal amount mismatch for bid', bid.id)
    return 'amount-mismatch' as const
  }

  await tx
    .update(bids)
    .set({ status: 'paid', paidAt: sql`now()`, paypalCaptureId: capture.id })
    .where(eq(bids.id, bid.id))
  await tx
    .insert(platformLedger)
    .values({ bidId: bid.id, kind: 'fee', grossCents: bid.amountCents, feeCents: bid.feeCents })
    .onConflictDoNothing()
  await recomputeListingTotals(tx, bid.listingId)
  return 'applied' as const
}

export async function applyRefund(tx: Tx, captureId: string) {
  const [bid] = await tx
    .select()
    .from(bids)
    .where(eq(bids.paypalCaptureId, captureId))
    .for('update')
  if (!bid || bid.status !== 'paid') return
  await tx
    .update(bids)
    .set({ status: 'refunded', refundedAt: sql`now()` })
    .where(eq(bids.id, bid.id))
  await tx
    .insert(platformLedger)
    .values({ bidId: bid.id, kind: 'refund', grossCents: -bid.amountCents, feeCents: -bid.feeCents })
    .onConflictDoNothing()
  await recomputeListingTotals(tx, bid.listingId)
}

export async function reconcileBid(bidId: number) {
  const [bid] = await db.select().from(bids).where(eq(bids.id, bidId))
  if (!bid || bid.status !== 'pending' || !bid.paypalOrderId) return
  let order = await fetchOrder(bid.paypalOrderId)
  if (order.status === 'APPROVED') order = await captureOrder(bid.paypalOrderId)
  if (order.status === 'COMPLETED') {
    await db.transaction((tx) => applyPaidOrder(tx, order))
  }
}

export async function refundCapture(captureId: string, bidId: number) {
  const result = await paypalRequest<{ status?: string }>(
    `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
    {
      method: 'POST',
      headers: { 'PayPal-Request-Id': `bidmysite-refund-${bidId}` },
      body: JSON.stringify({}),
    },
  )
  if (result.status === 'COMPLETED') {
    await db.transaction((tx) => applyRefund(tx, captureId))
    return 'refunded' as const
  }
  if (result.status === 'PENDING') return 'processing' as const
  throw new Error('PayPal could not process this refund.')
}

export async function processPayPalWebhook(request: Request) {
  const config = credentials()
  if (!config) throw new PaymentsNotConfiguredError()
  const transmission = {
    auth_algo: request.headers.get('paypal-auth-algo'),
    cert_url: request.headers.get('paypal-cert-url'),
    transmission_id: request.headers.get('paypal-transmission-id'),
    transmission_sig: request.headers.get('paypal-transmission-sig'),
    transmission_time: request.headers.get('paypal-transmission-time'),
    webhook_id: config.webhookId,
    webhook_event: await request.json(),
  }
  if (Object.values(transmission).some((value) => !value)) {
    throw new Error('PayPal webhook is missing signature headers.')
  }
  const verification = await paypalRequest<{ verification_status?: string }>(
    '/v1/notifications/verify-webhook-signature',
    { method: 'POST', body: JSON.stringify(transmission) },
  )
  if (verification.verification_status !== 'SUCCESS') {
    throw new Error('PayPal webhook signature verification failed.')
  }

  const event = transmission.webhook_event as {
    id?: string
    event_type?: string
    resource?: { id?: string; status?: string; supplementary_data?: { related_ids?: { order_id?: string } } }
  }
  if (!event.id || !event.event_type) throw new Error('Invalid PayPal webhook event.')
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(paypalEvents)
      .values({ id: event.id!, type: event.event_type! })
      .onConflictDoNothing()
      .returning({ id: paypalEvents.id })
    if (!inserted.length) return

    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const orderId = event.resource?.supplementary_data?.related_ids?.order_id
      if (!orderId) return
      const order = await fetchOrder(orderId)
      await applyPaidOrder(tx, order)
    } else if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED' && event.resource?.id) {
      await applyRefund(tx, event.resource.id)
    }
  })
}

export const CURRENCY = PLATFORM.currency.toLowerCase()
export { fetchOrder }
