import type { ReactNode } from 'react'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import {
  Gavel,
  Globe,
  Plus,
  Receipt,
  ShieldCheck,
  UserRound,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RankBadge } from '@/components/leaderboard'
import { BidStatusBadge, ListingStatusBadge } from '@/components/status-badges'
import { getDashboard, getSessionUser } from '@/lib/account.functions'
import { formatMoney, hostnameOf, timeAgo } from '@/lib/platform'

export const Route = createFileRoute('/dashboard')({
  head: () => ({ meta: [{ title: 'Dashboard · BidMySite' }] }),
  beforeLoad: async ({ location }) => {
    const user = await getSessionUser()
    if (!user)
      throw redirect({ to: '/login', search: { redirect: location.href } })
  },
  loader: () => getDashboard(),
  component: DashboardPage,
})

function EmptyPanel({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof Globe
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-xl bg-secondary text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="mt-4 font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {body}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

function DashboardPage() {
  const { user, listings, bids } = Route.useLoaderData()
  const paid = bids.filter((bid) => bid.status === 'paid')
  const receipts = bids.filter(
    (bid) => bid.status === 'paid' || bid.status === 'refunded' || bid.status === 'disputed',
  )
  const ranks = listings.map((l) => l.rank).filter((rank) => rank > 0)

  return (
    <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <h1 className="text-4xl font-extrabold sm:text-5xl">
            Your dashboard
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Track your websites, every bid you've placed and your payment
            receipts in one place.
          </p>
        </div>
        <Button asChild>
          <Link to="/submit">
            <Plus /> Submit a website
          </Link>
        </Button>
      </div>

      <div className="mt-8 flex flex-col gap-4 rounded-2xl border bg-ink p-6 text-ink-foreground sm:flex-row sm:items-center">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-ink-foreground/10">
          <UserRound className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {user.name || 'Your account'}
            {user.isAdmin && <Badge className="bg-primary">Admin</Badge>}
          </p>
          <p className="mt-1 truncate text-sm text-ink-foreground/70">
            {user.email}
          </p>
        </div>
        {user.isAdmin && (
          <Button asChild variant="secondary">
            <Link to="/admin">
              <ShieldCheck /> Admin dashboard
            </Link>
          </Button>
        )}
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Websites', String(listings.length)],
          ['Best rank', ranks.length ? `#${Math.min(...ranks)}` : '—'],
          ['Bids placed', String(paid.length)],
          [
            'Total spent',
            formatMoney(
              paid.reduce((sum, bid) => sum + bid.totalChargeCents, 0),
            ),
          ],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="tabular mt-1 text-2xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      <Tabs defaultValue="websites" className="mt-8">
        <TabsList>
          <TabsTrigger value="websites">My websites</TabsTrigger>
          <TabsTrigger value="bids">My bids</TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
        </TabsList>
        <TabsContent value="websites" className="mt-4">
          {listings.length === 0 ? (
            <EmptyPanel
              icon={Globe}
              title="No websites yet"
              body="Websites you submit show up here with their current rank, total and bid history."
              action={
                <Button asChild variant="outline">
                  <Link to="/submit">Submit your first website</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
              {listings.map((listing) => (
                <li key={listing.id}>
                  <Link
                    to="/site/$slug"
                    params={{ slug: listing.slug }}
                    className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-secondary/60 motion-reduce:transition-none sm:px-5"
                  >
                    {listing.rank > 0 ? (
                      <RankBadge rank={listing.rank} />
                    ) : (
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-dashed text-xs text-muted-foreground">
                        —
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        <span className="truncate">{listing.title}</span>
                        <ListingStatusBadge status={listing.status} />
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {hostnameOf(listing.url)} · submitted{' '}
                        {timeAgo(listing.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular font-bold">
                        {formatMoney(listing.totalCents)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {listing.bidCount} bid
                        {listing.bidCount === 1 ? '' : 's'}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="bids" className="mt-4">
          {bids.length === 0 ? (
            <EmptyPanel
              icon={Gavel}
              title="No bids placed"
              body="Every bid you place — and whether its payment was confirmed — is listed here."
              action={
                <Button asChild variant="outline">
                  <Link to="/leaderboard">Browse the leaderboard</Link>
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Website</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Bid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bids.map((bid) => (
                    <TableRow key={bid.id}>
                      <TableCell className="font-medium">
                        <Link
                          to="/site/$slug"
                          params={{ slug: bid.listing.slug }}
                          className="hover:underline"
                        >
                          {bid.listing.title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {timeAgo(bid.createdAt)}
                      </TableCell>
                      <TableCell>
                        <BidStatusBadge status={bid.status} />
                      </TableCell>
                      <TableCell className="tabular text-right font-semibold">
                        {formatMoney(bid.amountCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="receipts" className="mt-4">
          {receipts.length === 0 ? (
            <EmptyPanel
              icon={Receipt}
              title="No receipts"
              body="Each verified payment produces a receipt showing your bid and the platform fee."
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paid</TableHead>
                    <TableHead>Website</TableHead>
                    <TableHead className="text-right">Bid</TableHead>
                    <TableHead className="text-right">Fee</TableHead>
                    <TableHead className="text-right">Charged</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map((bid) => (
                    <TableRow key={bid.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {bid.paidAt
                          ? new Date(bid.paidAt).toLocaleDateString()
                          : '—'}
                      </TableCell>
                      <TableCell className="font-medium">
                        {bid.listing.title}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatMoney(bid.amountCents)}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatMoney(bid.feeCents)}
                      </TableCell>
                      <TableCell className="tabular text-right font-semibold">
                        {formatMoney(bid.totalChargeCents)}
                      </TableCell>
                      <TableCell>
                        {bid.status === 'refunded' ? (
                          <BidStatusBadge status="refunded" />
                        ) : (
                          <Link
                            to="/checkout/success"
                            search={{ bid: Number(bid.id) }}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            Receipt
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
