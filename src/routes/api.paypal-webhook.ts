import { createFileRoute } from '@tanstack/react-router'

import {
  processPayPalWebhook,
  PayPalWebhookVerificationError,
} from '@/lib/payments.server'

export const Route = createFileRoute('/api/paypal-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await processPayPalWebhook(request)
          return Response.json({ received: true })
        } catch (error) {
          if (error instanceof PayPalWebhookVerificationError) {
            return Response.json({ error: 'Invalid PayPal webhook' }, { status: 400 })
          }
          // Provider/database failures should receive a retry from PayPal.
          console.error(
            'PayPal webhook processing failed',
            error instanceof Error ? error.message : 'unknown error',
          )
          return Response.json({ error: 'Webhook processing failed' }, { status: 500 })
        }
      },
    },
  },
})
