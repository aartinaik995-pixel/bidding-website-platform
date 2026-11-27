import { createFileRoute } from "@tanstack/react-router";

import { handlePaypalWebhook } from "@/lib/payment-service.server";

// PayPal calls this endpoint. The handler verifies the signature with PayPal
// and returns 503 while payments are disabled.
export const Route = createFileRoute("/api/paypal-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePaypalWebhook(request),
    },
  },
});
