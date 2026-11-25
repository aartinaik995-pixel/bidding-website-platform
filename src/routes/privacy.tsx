import { createFileRoute } from "@tanstack/react-router";

import { PolicyPage, type PolicySection } from "@/components/policy-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy · BidMySite" }] }),
  component: PrivacyPage,
});

const sections: PolicySection[] = [
  {
    title: "Information the service uses",
    paragraphs: [
      "BidMySite stores account identifiers, email addresses, display names, submitted website URLs and descriptions, bid amounts, payment status, timestamps, and payment-provider identifiers needed to operate accounts, listings, receipts, rankings, and refunds.",
      "Display names and submitted listing details are shown publicly. Verified bid amounts, bidder display names, and bid dates are also shown on the site. Do not use information in a public display name that you do not want published.",
    ],
  },
  {
    title: "How information is used",
    paragraphs: [
      "Information is used to provide sign-in, persist listings and bids, calculate rankings and platform fees, show account receipts, prevent abuse, and process or reconcile refunds.",
      "Authentication is provided through Netlify Identity and application records are stored in the configured Netlify database. When PayPal checkout is configured, PayPal handles the payment flow. The application stores PayPal order and capture identifiers and payment status, not card numbers.",
    ],
  },
  {
    title: "Retention and account controls",
    paragraphs: [
      "The application currently has no self-service account deletion or data-export feature. Account, listing, bid, and ledger records may be retained while needed to operate the service and maintain accurate payment and ranking records. The operator must define and publish the applicable retention period.",
    ],
  },
  {
    title: "Cookies and service providers",
    paragraphs: [
      "Sign-in relies on session handling provided by Netlify Identity. PayPal may use its own pages and technologies when a configured checkout is opened. This repository does not include an analytics integration.",
    ],
  },
  {
    title: "Privacy requests",
    paragraphs: [
      "The platform operator’s privacy contact and legal identity have not been provided in this repository. Add a verified contact method before launch so users can submit access, correction, or deletion requests.",
    ],
  },
];

function PrivacyPage() {
  return (
    <PolicyPage
      title="Privacy Policy"
      description="What account, listing, bid, and payment information BidMySite uses."
      updated="October 23, 2026"
      sections={sections}
    />
  );
}
