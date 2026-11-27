import { createFileRoute } from "@tanstack/react-router";

import { cancelPendingBid, siteUrl } from "@/lib/bidding.server";

// PayPal sends the payer here when they cancel. Only a pending bid is marked
// failed; paid bids are untouched.
export const Route = createFileRoute("/api/paypal-cancel")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        try {
          if (token) await cancelPendingBid(token);
        } catch (error) {
          console.error("PayPal cancel could not update the bid.", error);
        }
        return Response.redirect(
          `${siteUrl()}/dashboard?payment=cancelled`,
          302,
        );
      },
    },
  },
});
