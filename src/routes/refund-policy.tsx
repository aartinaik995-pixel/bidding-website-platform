import { createFileRoute } from '@tanstack/react-router'
import { PolicyPage, type PolicySection } from '@/components/policy-page'
export const Route = createFileRoute('/refund-policy')({ head: () => ({ meta: [{ title: 'Refund Policy · BidMySite' }] }), component: RefundPolicyPage })
const sections: PolicySection[] = [
  { title: 'When a refund may be issued', paragraphs: ['Confirmed bids are generally final because they immediately affect a public ranking. The platform may issue a full refund if it removes the associated listing or approves another refund after review.', 'Being outbid or not reaching a desired rank does not by itself qualify a bid for a refund.'] },
  { title: 'How refunds work', paragraphs: ['The admin dashboard supports full refunds through PayPal to the original capture. Partial refunds are not supported in the application.', 'A refund is complete only after PayPal confirms it. Once confirmed, the bid and its platform fee are removed from totals and the ledger records the refund. PayPal or the bank may take additional time to post it.'] },
  { title: 'Requesting a refund', paragraphs: ['A platform administrator can review a refund request and issue an eligible full refund. Add a verified support contact before launch.'] },
  { title: 'Provider availability', paragraphs: ['Refunds require valid PayPal configuration and the original payment record. Checkout is unavailable unless the required server-side credentials and webhook configuration are present.'] },
]
function RefundPolicyPage() { return <PolicyPage title="Refund Policy" description="How verified PayPal bid payments and full refunds are handled." updated="November 25, 2026" sections={sections} /> }
