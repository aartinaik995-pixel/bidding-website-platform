import { useEffect } from "react";
import {
  createFileRoute,
  Link,
  notFound,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { CheckCircle2, Hourglass, RotateCcw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getBidReceipt, getSessionUser } from "@/lib/account.functions";
import { formatMoney, feePercentLabel } from "@/lib/platform";

export const Route = createFileRoute("/checkout/success")({
  validateSearch: (search: Record<string, unknown>) => ({
    bid: Number(search.bid) > 0 ? Math.floor(Number(search.bid)) : 0,
  }),
  loaderDeps: ({ search }) => ({ bid: search.bid }),
  beforeLoad: async ({ location }) => {
    const user = await getSessionUser();
    if (!user)
      throw redirect({ to: "/login", search: { redirect: location.href } });
  },
  loader: async ({ deps }) => {
    if (!deps.bid) throw notFound();
    const receipt = await getBidReceipt({ data: { bidId: deps.bid } });
    if (!receipt) throw notFound();
    return receipt;
  },
  head: () => ({ meta: [{ title: "Payment status · BidMySite" }] }),
  component: CheckoutResult,
});

function CheckoutResult() {
  const receipt = Route.useLoaderData();
  const router = useRouter();

  // The status shown here is read from the database. Keep checking while Stripe confirms.
  useEffect(() => {
    if (receipt.status !== "pending") return;
    const id = window.setInterval(() => void router.invalidate(), 3000);
    return () => window.clearInterval(id);
  }, [receipt.status, router]);

  const view = {
    paid: {
      icon: <CheckCircle2 className="size-10 text-live" />,
      title: "Payment confirmed",
      body: `The payment provider confirmed your payment. ${formatMoney(receipt.amountCents)} has been added to ${receipt.listing.title}'s total.`,
    },
    pending: {
      icon: (
        <Hourglass className="size-10 text-primary motion-safe:animate-pulse" />
      ),
      title: "Waiting for confirmation",
      body: "We haven't received payment confirmation yet. This page updates automatically — your bid is added only after the provider confirms it.",
    },
    failed: {
      icon: <XCircle className="size-10 text-destructive" />,
      title: "Payment not completed",
      body: "This checkout expired or the payment failed. You were not charged and nothing was added.",
    },
    refunded: {
      icon: <RotateCcw className="size-10 text-muted-foreground" />,
      title: "Payment refunded",
      body: "This payment was refunded, so it no longer counts toward the ranking.",
    },
  }[receipt.status];

  return (
    <div className="mx-auto max-w-xl px-4 py-14 sm:px-6">
      <div className="rounded-2xl border bg-card p-8" aria-live="polite">
        {view.icon}
        <h1 className="mt-4 text-3xl font-extrabold">{view.title}</h1>
        <p className="mt-2 text-muted-foreground">{view.body}</p>

        <dl className="mt-6 space-y-2 border-t pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Website</dt>
            <dd className="font-medium">{receipt.listing.title}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Bid (counts toward rank)</dt>
            <dd className="tabular">{formatMoney(receipt.amountCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              Platform fee ({feePercentLabel()})
            </dt>
            <dd className="tabular">{formatMoney(receipt.feeCents)}</dd>
          </div>
          <div className="flex justify-between border-t pt-2 font-bold">
            <dt>{receipt.status === "paid" ? "Paid" : "Total"}</dt>
            <dd className="tabular">{formatMoney(receipt.totalChargeCents)}</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link to="/site/$slug" params={{ slug: receipt.listing.slug }}>
              View {receipt.listing.title}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/dashboard">Your receipts</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
