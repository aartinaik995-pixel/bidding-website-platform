import { createFileRoute, Link } from "@tanstack/react-router";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  feeBreakdown,
  feePercentLabel,
  formatMoney,
  PLATFORM,
} from "@/lib/platform";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({ meta: [{ title: "How it works · BidMySite" }] }),
  component: HowItWorksPage,
});

const example = feeBreakdown(2500);

const faqs = [
  {
    q: "How is the leaderboard ordered?",
    a: "By each website's total of verified bids, highest first. If two websites have the same total, the one that reached it first ranks higher.",
  },
  {
    q: "When does my bid count?",
    a: "Only after the configured payment provider confirms payment directly to our server. Abandoned, failed or refunded payments never change the rankings. If checkout is unavailable, no bid is accepted.",
  },
  {
    q: "What does the platform fee cover?",
    a: `A ${feePercentLabel()} fee is added on top of each bid at checkout to run BidMySite. Your full bid amount counts toward your rank — the fee does not.`,
  },
  {
    q: "Can I bid on someone else’s website?",
    a: "Yes. Anyone with an account can bid on any listed website, including to help a site they like climb.",
  },
  {
    q: "What websites are allowed?",
    a: "Listings are published immediately after submission. Illegal content, malware, adult content, impersonation and abusive submissions may be removed; paid bids on a removed listing can be refunded in full.",
  },
  {
    q: "Are bids refundable?",
    a: "Bids are final once confirmed, except when the platform removes a listing or approves another refund. Full refunds are returned to the original payment method; refunded bids no longer affect rankings.",
  },
];

function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
      <div className="max-w-2xl">
        <h1 className="text-4xl font-extrabold sm:text-5xl">
          How BidMySite works
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          A simple, open auction for attention. Pay to rank higher — and see
          exactly where every cent goes.
        </p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <Accordion
          type="single"
          collapsible
          className="rounded-2xl border bg-card px-6"
        >
          {faqs.map((f) => (
            <AccordionItem key={f.q} value={f.q}>
              <AccordionTrigger className="text-base">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <aside className="rounded-2xl border bg-card p-6 lg:self-start">
          <h2 className="font-bold">Example bid</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Your bid</dt>
              <dd className="tabular">{formatMoney(example.amountCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                Platform fee ({feePercentLabel()})
              </dt>
              <dd className="tabular">{formatMoney(example.feeCents)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 font-bold">
              <dt>You pay</dt>
              <dd className="tabular">
                {formatMoney(example.totalChargeCents)}
              </dd>
            </div>
            <div className="flex justify-between text-primary">
              <dt>Added to your rank</dt>
              <dd className="tabular font-semibold">
                +{formatMoney(example.amountCents)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Bids range from {formatMoney(PLATFORM.minBidCents)} to{" "}
            {formatMoney(PLATFORM.maxBidCents)}.
          </p>
          <Button asChild className="mt-5 w-full">
            <Link to="/submit">Submit your website</Link>
          </Button>
        </aside>
      </div>
    </div>
  );
}
