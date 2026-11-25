import { createFileRoute } from '@tanstack/react-router'
import { createPayPalOrder } from '@/lib/payments.server'

export const Route = createFileRoute('/api/paypal-health')({
  server: { handlers: { GET: async () => Response.json({ provider: 'PayPal', configured: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && process.env.PAYPAL_ENVIRONMENT) }) } },
})
