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
      "BidMySite stores account identifiers, email addresses, display names, submitted website URLs and descriptions, timestamps, and the records needed to operate accounts and listings.",
      "Display names and submitted listing details are shown publicly. Verified bid amounts, bidder display names, and bid dates are also shown on the site. Do not use information in a public display name that you do not want published.",
    ],
  },
  {
    title: "How information is used",
    paragraphs: [
      "Information is used to provide sign-in, store listings, prevent abuse and run the platform. Bidding, payments and refunds are not active yet.",
      "Authentication is provided through Netlify Identity and application records are stored in the configured Netlify database. No payment provider is connected at this time, so the application does not process payments.",
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
      "Sign-in relies on session handling provided by Netlify Identity. This repository does not include an analytics integration.",
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
