import { createFileRoute } from '@tanstack/react-router'

import { getStripe, processStripeEvent } from '@/lib/payments.server'

// Deprecated Stripe webhook endpoint retained only to avoid breaking old URLs.
// Stripe is no longer the active checkout provider; do not configure new events.
export const Route = createFileRoute('/api/stripe-webhook')({
  server: {
    handlers: {
      POST: async () => Response.json({ error: 'Stripe payments are disabled' }, { status: 410 }),
    },
  },
})
