import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/api/stripe-webhook')({
  server: { handlers: { POST: async () => Response.json({ error: 'Retired endpoint' }, { status: 410 }) } },
})
