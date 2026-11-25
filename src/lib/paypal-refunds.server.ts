import { and, eq, sql } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '../../db/index.js'
import { bids } from '../../db/schema.js'
import { requireAdmin } from './auth.server'
import { applyRefund } from './payments.server'
import { paypalRequestForServer } from './paypal-api.server'

export const refundBid = createServerFn({ method: 'POST' }).validator(z.object({ bidId: z.coerce.number().int().positive() })).handler(async ({ data }) => {
  await requireAdmin()
  const [bid] = await db.select().from(bids).where(eq(bids.id, data.bidId))
  if (!bid || bid.status !== 'paid' || !bid.paypalCaptureId) throw new Error('Only completed PayPal payments can be refunded.')
  const result = await paypalRequestForServer(`/v2/payments/captures/${encodeURIComponent(bid.paypalCaptureId)}/refund`, { method: 'POST', body: JSON.stringify({}) }, `bidmysite-refund-${bid.id}`)
  if (result.status === 'COMPLETED') {
    await db.transaction((tx) => applyRefund(tx, bid.paypalCaptureId!))
    return { status: 'refunded' as const }
  }
  if (result.status !== 'PENDING') throw new Error('PayPal could not process this refund.')
  return { status: 'processing' as const }
})
