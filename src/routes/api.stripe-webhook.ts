import { createFileRoute } from '@tanstack/react-router'

import { getStripe, processStripeEvent } from '@/lib/payments.server'

// Stripe webhook: the only way (besides a direct Stripe API lookup) a bid becomes paid.
// Configure it in Stripe for checkout.session.completed, checkout.session.expired,
// checkout.session.async_payment_succeeded, checkout.session.async_payment_failed
// and charge.refunded.
export const Route = createFileRoute('/api/stripe-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const stripe = getStripe()
        const secret = process.env.STRIPE_WEBHOOK_SECRET
        if (!stripe || !secret) {
          return Response.json(
            { error: 'Payments are not configured' },
            { status: 503 },
          )
        }
        const signature = request.headers.get('stripe-signature')
        if (!signature)
          return Response.json({ error: 'Missing signature' }, { status: 400 })

        const body = await request.text()
        let event
        try {
          event = await stripe.webhooks.constructEventAsync(
            body,
            signature,
            secret,
          )
        } catch {
          return Response.json({ error: 'Invalid signature' }, { status: 400 })
        }

        try {
          await processStripeEvent(event)
        } catch (error) {
          console.error(
            'Stripe webhook processing failed',
            event.id,
            error instanceof Error ? error.message : error,
          )
          // A non-2xx response makes Stripe retry; the event ID keeps retries idempotent.
          return Response.json({ error: 'Processing failed' }, { status: 500 })
        }
        return Response.json({ received: true })
      },
    },
  },
})
