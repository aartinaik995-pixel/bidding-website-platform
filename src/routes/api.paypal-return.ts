import { createFileRoute } from '@tanstack/react-router'

import { settleReturn, siteUrl } from '@/lib/bidding.server'

// PayPal sends the payer here after approval (?token=<order id>). The bid is
// settled only after PayPal confirms the capture. The redirect target shows
// the outcome; it never marks a bid paid by itself.
export const Route = createFileRoute('/api/paypal-return')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get('token') ?? ''
        let outcome: string = 'error'
        try {
          if (token) outcome = await settleReturn(token)
        } catch (error) {
          console.error('PayPal return could not settle the bid.', error)
        }
        return Response.redirect(`${siteUrl()}/dashboard?payment=${outcome}`, 302)
      },
    },
  },
})
