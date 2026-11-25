import { createFileRoute } from "@tanstack/react-router";

import { PolicyPage, type PolicySection } from "@/components/policy-page";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of Service · BidMySite" }] }),
  component: TermsPage,
});

const sections: PolicySection[] = [
  {
    title: "Using BidMySite",
    paragraphs: [
      "BidMySite provides public website listings and a leaderboard ranked by verified bid totals. You must use an account for submissions and bidding, provide accurate information, and use only payment methods you are authorized to use.",
      "You are responsible for activity on your account and for keeping its sign-in credentials secure.",
    ],
  },
  {
    title: "Listings and submitted content",
    paragraphs: [
      "A website listing is published when it is submitted; it does not wait for manual approval. You must have the right to submit the website and its description, and the listing must not be unlawful, deceptive, malicious, or infringing.",
      "BidMySite may hide or remove listings that violate these rules, create a security risk, or otherwise harm the service or its users.",
    ],
  },
  {
    title: "Bids, fees, and rankings",
    paragraphs: [
      "Bids are denominated in US dollars. The current platform fee is 10% of the bid and is added to the amount charged. The full bid amount—not the fee—counts toward the listing total.",
      "A bid is counted only after the configured payment provider confirms it to the server. Pending, failed, or refunded payments do not count. Rankings can change when later verified bids or refunds are processed. A bid does not guarantee traffic, sales, or a fixed position.",
    ],
  },
  {
    title: "Payments and refunds",
    paragraphs: [
      "The application currently contains a PayPal checkout integration. Checkout is available only when the required server-side configuration is present; no Razorpay or Stripe integration is included. The provider name or payment status must not be treated as active unless the application reports checkout as configured.",
      "Confirmed bids are generally final. Full refunds may be issued under the Refund Policy, including when the platform removes a listing. A refunded bid is removed from rankings after the payment provider confirms the refund.",
    ],
  },
  {
    title: "Availability and changes",
    paragraphs: [
      "We may suspend or change parts of the service for security, maintenance, or operational reasons. We may update these terms; the updated date above identifies the latest version shown here.",
    ],
  },
];

function TermsPage() {
  return (
    <PolicyPage
      title="Terms of Service"
      description="Rules for accounts, website listings, bids, and use of the BidMySite platform."
      updated="October 23, 2026"
      sections={sections}
    />
  );
}
