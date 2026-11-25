import { createFileRoute } from '@tanstack/react-router'
import { paymentsConfigured, paypalEnvironment } from '@/lib/payments.server'
export const Route = createFileRoute('/api/paypal-health')({
  server: { handlers: { GET: async () => Response.json({ provider: 'PayPal', configured: paymentsConfigured(), environment: process.env.PAYPAL_ENVIRONMENT === 'sandbox' || process.env.PAYPAL_ENVIRONMENT === 'live' ? paypalEnvironment() : null }) } },
})
