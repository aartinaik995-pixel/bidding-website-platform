// Server-only PayPal integration. Payment status changes only after the PayPal
// Orders API or a signature-verified PayPal webhook confirms the transaction.

import { and, eq, sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { bids, listings, paypalEvents, platformLedger } from '../../db/schema.js'
import { PLATFORM } from './platform'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type PayPalLink = { rel: string; href: string }
type PayPalAmount = { currency_code?: string; value?: string }
type PayPalCapture = { id: string; status: string; amount?: PayPalAmount }
type PayPalRelatedIds = { order_id?: string; capture_id?: string }
type PayPalDisputeResource = {
  dispute_outcome?: { outcome_code?: string }
  disputed_transactions?: Array<{ seller_transaction_id?: string }>
}
type PayPalRefundResource = {
  id?: string
  status?: string
  links?: PayPalLink[]
  supplementary_data?: { related_ids?: PayPalRelatedIds }
}
type PayPalOrder = {
  id: string
  status: string
  links?: PayPalLink[]
  purchase_units?: Array<{
    reference_id?: string
    custom_id?: string
    amount?: PayPalAmount
    payments?: { captures?: PayPalCapture[] }
  }>
}

export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super('PayPal payments are not configured yet.')
  }
}

export class PayPalWebhookVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PayPalWebhookVerificationError'
  }
}

function credentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET
  const webhookId = process.env.PAYPAL_WEBHOOK_ID
  const environment = process.env.PAYPAL_ENVIRONMENT
  // Fail closed: PAYPAL_ENVIRONMENT must be set explicitly (there is no implicit sandbox),
  // and production deploys must use live credentials. Otherwise checkout stays disabled.
  if (!clientId || !clientSecret || !webhookId) return null
  if (environment !== 'sandbox' && environment !== 'live') {
    console.error('PayPal disabled: PAYPAL_ENVIRONMENT must be "sandbox" or "live".')
    return null
  }
  if (process.env.CONTEXT === 'production' && environment !== 'live') {
    console.error('PayPal disabled: production deploys require PAYPAL_ENVIRONMENT=live.')
    return null
  }
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

/** Parses a PayPal decimal string ("12.50") into integer cents without float rounding error. */
function dollarsToCents(value: string | undefined) {
  const match = value?.match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!match) return null
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

/**
 * PAYMENT.CAPTURE.REFUNDED resources are refund objects. Their own `id` is the
 * refund ID, so the capture ID must come from the `up` link or related IDs.
 */
function captureIdFromRefund(resource: PayPalRefundResource | undefined) {
  const upHref = resource?.links?.find((link) => link.rel === 'up')?.href
  const fromLink = upHref?.split('/').filter(Boolean).pop()
  return resource?.supplementary_data?.related_ids?.capture_id ?? fromLink ?? null
}

/** Capture IDs a dispute event refers to (CUSTOMER.DISPUTE.* resources list the disputed transactions). */
function captureIdsFromDispute(resource: PayPalDisputeResource | undefined) {
  return (resource?.disputed_transactions ?? [])
    .map((transaction) => transaction.seller_transaction_id)
    .filter((id): id is string => Boolean(id))
}

/** Dispute outcomes mapped to what they mean for the bid. Unknown outcomes stay disputed. */
const REFUND_OUTCOMES = new Set(['RESOLVED_BUYER_FAVOUR', 'RESOLVED_WITH_PAYOUT', 'ACCEPTED'])
const RESTORE_OUTCOMES = new Set(['RESOLVED_SELLER_FAVOUR', 'CANCELED_BY_BUYER', 'DENIED'])

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
  // This app creates exactly one purchase unit per bid. Refuse ambiguous orders.
  if (!order.id || order.purchase_units?.length !== 1) return 'invalid-order' as const
  const unit = order.purchase_units[0]
  const capture = unit.payments?.captures?.find((entry) => entry.status === 'COMPLETED')
  const bidId = Number(unit.custom_id ?? unit.reference_id)
  if (!Number.isSafeInteger(bidId) || !capture?.id) return 'unknown-bid' as const

  const [bid] = await tx
    .select()
    .from(bids)
    .where(and(eq(bids.id, bidId), eq(bids.paypalOrderId, order.id)))
    .for('update')
  if (!bid) return 'unknown-bid' as const
  if (bid.status !== 'pending' && bid.status !== 'failed') return 'already-applied' as const

  const orderAmount = dollarsToCents(unit.amount?.value)
  const captureAmount = dollarsToCents(capture.amount?.value)
  const currency = bid.currency.toLowerCase()
  if (
    orderAmount !== bid.totalChargeCents ||
    captureAmount !== bid.totalChargeCents ||
    unit.amount?.currency_code?.toLowerCase() !== currency ||
    capture.amount?.currency_code?.toLowerCase() !== currency
  ) {
    console.error('PayPal amount or currency mismatch for bid', bid.id)
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

/** Money returned to the buyer (refund, reversal, or buyer-won dispute). Removes the bid from rankings. */
export async function applyRefund(tx: Tx, captureId: string) {
  const [bid] = await tx
    .select()
    .from(bids)
    .where(eq(bids.paypalCaptureId, captureId))
    .for('update')
  if (!bid || (bid.status !== 'paid' && bid.status !== 'disputed')) return
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

/** Moves a paid bid to disputed (out of rankings) or a disputed bid back to paid. */
export async function applyDisputeStatus(
  tx: Tx,
  captureId: string,
  from: 'paid' | 'disputed',
  to: 'paid' | 'disputed',
) {
  const [bid] = await tx
    .select()
    .from(bids)
    .where(eq(bids.paypalCaptureId, captureId))
    .for('update')
  if (!bid || bid.status !== from) return
  await tx.update(bids).set({ status: to }).where(eq(bids.id, bid.id))
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
  let webhookEvent: unknown
  try {
    webhookEvent = await request.json()
  } catch {
    throw new PayPalWebhookVerificationError('Invalid webhook JSON.')
  }
  const transmission = {
    auth_algo: request.headers.get('paypal-auth-algo'),
    cert_url: request.headers.get('paypal-cert-url'),
    transmission_id: request.headers.get('paypal-transmission-id'),
    transmission_sig: request.headers.get('paypal-transmission-sig'),
    transmission_time: request.headers.get('paypal-transmission-time'),
    webhook_id: config.webhookId,
    webhook_event: webhookEvent,
  }
  if (Object.values(transmission).some((value) => !value)) {
    throw new PayPalWebhookVerificationError('PayPal webhook is missing signature headers.')
  }
  const verification = await paypalRequest<{ verification_status?: string }>(
    '/v1/notifications/verify-webhook-signature',
    { method: 'POST', body: JSON.stringify(transmission) },
  )
  if (verification.verification_status !== 'SUCCESS') {
    throw new PayPalWebhookVerificationError('PayPal webhook signature verification failed.')
  }

  const event = webhookEvent as {
    id?: string
    event_type?: string
    resource?: PayPalRefundResource & PayPalDisputeResource & {
      supplementary_data?: { related_ids?: PayPalRelatedIds }
    }
  }
  if (!event.id || !event.event_type) {
    throw new PayPalWebhookVerificationError('Invalid PayPal webhook event.')
  }

  // Retrieve provider data before opening the database transaction; network
  // failures must leave no event marker so PayPal can retry processing safely.
  let completedOrder: PayPalOrder | undefined
  let refundedCaptureId: string | null = null
  // Each entry: a capture and the status change it causes.
  let disputeChanges: Array<{ captureId: string; action: 'pause' | 'refund' | 'restore' }> = []
  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    const orderId = event.resource?.supplementary_data?.related_ids?.order_id
    if (!orderId) throw new PayPalWebhookVerificationError('PayPal event has no order ID.')
    completedOrder = await fetchOrder(orderId)
  } else if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') {
    // Only a completed refund changes rankings; PENDING refunds wait for the final event.
    if (event.resource?.status === 'COMPLETED') {
      refundedCaptureId = captureIdFromRefund(event.resource)
    }
  } else if (event.event_type === 'PAYMENT.CAPTURE.REVERSED') {
    // A reversal (chargeback) returns the money: treat it like a refund. The resource is the capture.
    if (event.resource?.id) refundedCaptureId = event.resource.id
  } else if (event.event_type === 'CUSTOMER.DISPUTE.CREATED') {
    // Open dispute: pull the bid out of rankings until PayPal resolves it.
    disputeChanges = captureIdsFromDispute(event.resource).map((captureId) => ({ captureId, action: 'pause' as const }))
  } else if (event.event_type === 'CUSTOMER.DISPUTE.RESOLVED') {
    const outcome = event.resource?.dispute_outcome?.outcome_code ?? ''
    const captureIds = captureIdsFromDispute(event.resource)
    if (REFUND_OUTCOMES.has(outcome)) {
      disputeChanges = captureIds.map((captureId) => ({ captureId, action: 'refund' as const }))
    } else if (RESTORE_OUTCOMES.has(outcome)) {
      disputeChanges = captureIds.map((captureId) => ({ captureId, action: 'restore' as const }))
    } else {
      // Unknown outcome: keep the bid paused and let an admin review it.
      console.error('PayPal dispute resolved with unrecognized outcome', outcome)
    }
  }

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(paypalEvents)
      .values({ id: event.id!, type: event.event_type! })
      .onConflictDoNothing()
      .returning({ id: paypalEvents.id })
    if (!inserted.length) return

    if (completedOrder) {
      await applyPaidOrder(tx, completedOrder)
    } else if (refundedCaptureId) {
      await applyRefund(tx, refundedCaptureId)
    }
    for (const change of disputeChanges) {
      if (change.action === 'pause') {
        await applyDisputeStatus(tx, change.captureId, 'paid', 'disputed')
      } else if (change.action === 'restore') {
        await applyDisputeStatus(tx, change.captureId, 'disputed', 'paid')
      } else {
        await applyRefund(tx, change.captureId)
      }
    }
  })
}

export const CURRENCY = PLATFORM.currency.toLowerCase()
export { fetchOrder }
