import { useState } from "react";
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Download, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BidStatusBadge, ListingStatusBadge } from "@/components/status-badges";
import { getSessionUser } from "@/lib/account.functions";
import {
  getAdminOverview,
  refundBid,
  setListingStatus,
} from "@/lib/admin.functions";
import {
  formatMoney,
  hostnameOf,
  timeAgo,
  type BidStatus,
  type ListingStatus,
} from "@/lib/platform";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin · BidMySite" }] }),
  beforeLoad: async ({ location }) => {
    const user = await getSessionUser();
    if (!user)
      throw redirect({ to: "/login", search: { redirect: location.href } });
    return { isAdmin: user.isAdmin };
  },
  loader: async ({ context }) => (context.isAdmin ? getAdminOverview() : null),
  component: AdminPage,
});

function AdminPage() {
  const data = Route.useLoaderData();
  if (!data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-14 sm:px-6">
        <ShieldAlert className="size-10 text-muted-foreground" />
        <h1 className="mt-4 text-3xl font-extrabold">Admins only</h1>
        <p className="mt-2 text-muted-foreground">
          Your account doesn't have the admin role. The site owner can grant it
          in the Netlify Identity settings.
        </p>
        <Button asChild className="mt-6">
          <Link to="/dashboard">Go to your dashboard</Link>
        </Button>
      </div>
    );
  }

  const { revenue, listings, bids, daily, monthly, paymentsReady } = data;

  return (
    <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold tracking-widest text-primary uppercase">
            Admin
          </p>
          <h1 className="mt-2 text-4xl font-extrabold sm:text-5xl">
            Platform dashboard
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Manage live listings, review payment status and track platform-fee
            revenue. Paid figures come from server-verified payments.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href="/api/admin/revenue-csv" download>
            <Download /> Export revenue CSV
          </a>
        </Button>
      </div>

      {!paymentsReady && (
        <Alert className="mt-8">
          <AlertTriangle />
          <AlertTitle>Payments are not connected</AlertTitle>
          <AlertDescription>
            Stripe Checkout stays disabled until STRIPE_SECRET_KEY and
            STRIPE_WEBHOOK_SECRET are configured in the hosting environment.
            Secret values are never shown here.
          </AlertDescription>
        </Alert>
      )}

      <dl className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Gross bids", formatMoney(revenue.grossCents)],
          ["Fees earned", formatMoney(revenue.feeCents)],
          [
            "Refunded",
            formatMoney(revenue.refundedGrossCents + revenue.refundedFeeCents),
          ],
          ["Net fee revenue", formatMoney(revenue.netFeeCents)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="tabular mt-1 text-2xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      <Tabs defaultValue="listings" className="mt-8">
        <TabsList className="flex-wrap">
          <TabsTrigger value="listings">Listings</TabsTrigger>
          <TabsTrigger value="bids">Bids</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
        </TabsList>

        <TabsContent value="listings" className="mt-4">
          {listings.length === 0 ? (
            <Empty>No websites have been submitted yet.</Empty>
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Website</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listings.map((listing) => (
                    <TableRow key={listing.id}>
                      <TableCell className="max-w-72">
                        <Link
                          to="/site/$slug"
                          params={{ slug: listing.slug }}
                          className="font-medium hover:underline"
                        >
                          {listing.title}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          <a
                            href={listing.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow ugc"
                            className="hover:underline"
                          >
                            {hostnameOf(listing.url)}
                          </a>{" "}
                          · {timeAgo(listing.createdAt)}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {listing.description}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm">
                        {listing.ownerName}
                        <p className="text-xs text-muted-foreground">
                          {listing.contactEmail}
                        </p>
                      </TableCell>
                      <TableCell>
                        <ListingStatusBadge status={listing.status} />
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatMoney(listing.totalCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        <ListingActions
                          id={listing.id}
                          status={listing.status}
                          hasPaidBids={listing.totalCents > 0}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="bids" className="mt-4">
          {bids.length === 0 ? (
            <Empty>No checkouts have been started yet.</Empty>
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Website</TableHead>
                    <TableHead>Bidder</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Bid</TableHead>
                    <TableHead className="text-right">Fee</TableHead>
                    <TableHead className="text-right">Charged</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bids.map((bid) => (
                    <TableRow key={bid.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {timeAgo(bid.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {bid.listing.title}
                      </TableCell>
                      <TableCell>{bid.bidderName}</TableCell>
                      <TableCell>
                        <BidStatusBadge status={bid.status} />
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatMoney(bid.amountCents)}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatMoney(bid.feeCents)}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatMoney(bid.totalChargeCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        <RefundButton
                          id={bid.id}
                          status={bid.status}
                          canRefund={bid.hasPaymentIntent}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="revenue" className="mt-4 space-y-6">
          <RevenueTable
            title="By day (last 30 active days, UTC)"
            rows={daily}
          />
          <RevenueTable title="By month (UTC)" rows={monthly} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function ListingActions({
  id,
  status,
  hasPaidBids,
}: {
  id: string;
  status: ListingStatus;
  hasPaidBids: boolean;
}) {
  const router = useRouter();
  const update = useServerFn(setListingStatus);
  const [pending, setPending] = useState(false);

  async function set(next: "approved" | "removed") {
    setPending(true);
    try {
      await update({ data: { listingId: Number(id), status: next } });
      toast.success(
        next === "approved"
          ? "Listing restored and bidding is open."
          : hasPaidBids
            ? "Listing removed. Refund its paid bids from the Bids tab."
            : "Listing removed.",
      );
      await router.invalidate();
    } catch {
      toast.error("Could not update the listing.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex justify-end gap-2">
      {status !== "removed" && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => set("removed")}
        >
          Remove
        </Button>
      )}
      {status === "removed" && (
        <Button size="sm" disabled={pending} onClick={() => set("approved")}>
          Restore
        </Button>
      )}
    </div>
  );
}

function RefundButton({
  id,
  status,
  canRefund,
}: {
  id: string;
  status: BidStatus;
  canRefund: boolean;
}) {
  const router = useRouter();
  const refund = useServerFn(refundBid);
  const [pending, setPending] = useState(false);
  if (status !== "paid" || !canRefund) return null;

  async function run() {
    if (
      !window.confirm(
        "Refund this bid in full through Stripe? It will be removed from the rankings.",
      )
    )
      return;
    setPending(true);
    try {
      const result = await refund({ data: { bidId: Number(id) } });
      toast.success(
        result.status === "refunded"
          ? "Refunded. The bid no longer counts toward rankings."
          : "Refund submitted. The bid is removed once Stripe confirms it.",
      );
      await router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Refund failed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={run}>
      {pending ? "Refunding…" : "Refund"}
    </Button>
  );
}

function RevenueTable({
  title,
  rows,
}: {
  title: string;
  rows: {
    period: string;
    grossCents: number;
    feeCents: number;
    refundCents: number;
  }[];
}) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="font-bold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No verified payments yet.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Net bids</TableHead>
                <TableHead className="text-right">Net fees</TableHead>
                <TableHead className="text-right">Refunded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.period}>
                  <TableCell className="tabular">{row.period}</TableCell>
                  <TableCell className="tabular text-right">
                    {formatMoney(row.grossCents)}
                  </TableCell>
                  <TableCell className="tabular text-right font-semibold">
                    {formatMoney(row.feeCents)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatMoney(row.refundCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
