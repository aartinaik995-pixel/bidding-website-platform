import { createFileRoute } from '@tanstack/react-router'
import { paypalRequest } from './payments.server'
export const Route = createFileRoute('/api/paypal-api')({ server: { handlers: {} } })
export { paypalRequest }
