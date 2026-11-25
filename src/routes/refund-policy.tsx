import { createFileRoute } from "@tanstack/react-router";

import { PolicyPage, type PolicySection } from "@/components/policy-page";

export const Route = createFileRoute("/refund-policy")({
  head: () => ({ meta: [{ title: "Refund Policy · BidMySite" }] }),
  component: RefundPolicyPage,
});

const sections: PolicySection[] = [
  {
    title: "When a refund may be issued",
    paragraphs: [
      "Confirmed bids are generally final because they immediately affect a public ranking. The platform may issue a full refund if it removes the associated listing or approves another refund after review.",
      "Being outbid, receiving less traffic than expected, or not reaching a desired rank does not by itself qualify a bid for a refund.",
    ],
  },
  {
    title: "How refunds work",
    paragraphs: [
      "The admin dashboard supports full refunds to the original payment method through PayPal. Partial refunds are not supported in the application.",
      "A refund is not treated as complete until PayPal confirms it. While a refund is processing, the bid may remain in the ranking; once confirmed, the bid and its platform fee are removed from the applicable totals and the ledger records the refund.",
      "Payment providers and banks may take additional time to post a completed refund. The application does not promise a specific posting time.",
    ],
  },
  {
    title: "Requesting a refund",
    paragraphs: [
      "A platform administrator can review a refund request and issue an eligible full refund. The repository does not provide a public support email or contact form; the operator must add a verified support contact before launch.",
    ],
  },
  {
    title: "Provider availability",
    paragraphs: [
      "Refunds require a valid PayPal configuration and the original payment record. If checkout is not configured, no new payments can be accepted through the application. Razorpay and Stripe are not implemented.",
    ],
  },
];

function RefundPolicyPage() {
  return (
    <PolicyPage
      title="Refund Policy"
      description="How verified bid payments and full refunds are handled."
      updated="October 23, 2026"
      sections={sections}
    />
  );
}
