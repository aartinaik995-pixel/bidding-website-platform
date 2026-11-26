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
      "Refunds cannot be issued in the application yet, because no payment provider is connected. Refund terms will be published here before any payment is taken.",
      "Once refunds are offered, a bid will leave the rankings only after the payment provider confirms the refund, and the ledger will record it.",
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
      "No payments are accepted through the application at this time, so no bid can be placed or refunded. No payment provider is currently integrated.",
    ],
  },
];

function RefundPolicyPage() {
  return (
    <PolicyPage
      title="Refund Policy"
      description="How refunds will be handled once payments are connected. No refunds are available yet."
      updated="October 23, 2026"
      sections={sections}
    />
  );
}
