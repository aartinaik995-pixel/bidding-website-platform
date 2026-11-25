import { createFileRoute } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'

import { processPayPalWebhook } from '@/lib/payments.server'

// The only mechanism for receiving provider-side payment/refund notifications.
export const Route = createFileRoute('/api/paypal-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await processPayPalWebhook(request)
          return Response.json({ received: true })
        } catch {
          return Response.json({ error: 'Invalid or unprocessed PayPal webhook' }, { status: 400 })
        }
      },
    },
  },
})
