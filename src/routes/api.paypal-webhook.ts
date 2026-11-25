import { createFileRoute } from '@tanstack/react-router'
import { processPayPalEvent, verifyPayPalWebhook } from '@/lib/payments.server'
export const Route = createFileRoute('/api/paypal-webhook')({
  server: { handlers: { POST: async ({ request }) => {
    let event: unknown
    try { event = await request.json() } catch { return Response.json({ error: 'Invalid event' }, { status: 400 }) }
    if (!event || typeof event !== 'object' || Array.isArray(event)) return Response.json({ error: 'Invalid event' }, { status: 400 })
    try {
      if (!await verifyPayPalWebhook(request, event as Record<string, unknown>)) return Response.json({ error: 'Invalid PayPal signature' }, { status: 400 })
      await processPayPalEvent(event as Record<string, unknown>)
      return Response.json({ received: true })
    } catch (error) {
      console.error('PayPal webhook processing failed', error instanceof Error ? error.message : error)
      return Response.json({ error: 'Webhook processing failed' }, { status: 500 })
    }
  } } },
})
