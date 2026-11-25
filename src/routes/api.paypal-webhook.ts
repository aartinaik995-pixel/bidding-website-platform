import { createFileRoute } from '@tanstack/react-router'
import { processPayPalEvent, verifyPayPalWebhook } from '@/lib/payments.server'

export const Route = createFileRoute('/api/paypal-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const event = await request.json().catch(() => null) as Record<string, any> | null
        if (!event || typeof event.id !== 'string') return Response.json({ error: 'Invalid event' }, { status: 400 })
        try {
          if (!await verifyPayPalWebhook(request, event)) return Response.json({ error: 'Invalid PayPal signature' }, { status: 400 })
          await processPayPalEvent(event)
          return Response.json({ received: true })
        } catch (error) {
          console.error('PayPal webhook processing failed', event.id, error instanceof Error ? error.message : error)
          return Response.json({ error: 'Webhook processing failed' }, { status: 500 })
        }
      },
    },
  },
})
