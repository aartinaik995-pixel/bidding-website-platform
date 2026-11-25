import { createFileRoute } from '@tanstack/react-router'

import {
  paypalConfigured,
  processPaypalEvent,
  verifyWebhookSignature,
} from '@/lib/paypal.server'

// PayPal webhook: with the server-side capture, this is the backup path that
// confirms payments and records refunds. Subscribe the endpoint to
// PAYMENT.CAPTURE.COMPLETED and PAYMENT.CAPTURE.REFUNDED.
export const Route = createFileRoute('/api/paypal-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!paypalConfigured()) {
          return Response.json(
            { error: 'Payments are not configured' },
            { status: 503 },
          )
        }

        const body = await request.text()
        let verified = false
        try {
          verified = await verifyWebhookSignature(request.headers, body)
        } catch {
          verified = false
        }
        if (!verified)
          return Response.json({ error: 'Invalid signature' }, { status: 400 })

        const event = JSON.parse(body) as {
          id: string
          event_type: string
          resource: Record<string, unknown>
        }
        try {
          await processPaypalEvent(event)
        } catch (error) {
          console.error(
            'PayPal webhook processing failed',
            event.id,
            error instanceof Error ? error.message : error,
          )
          // A non-2xx response makes PayPal retry; the event ID keeps retries idempotent.
          return Response.json({ error: 'Processing failed' }, { status: 500 })
        }
        return Response.json({ received: true })
      },
    },
  },
})
