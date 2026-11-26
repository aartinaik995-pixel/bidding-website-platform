import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LeaderboardList, LiveIndicator } from '@/components/leaderboard'
import { RecentBidsFeed } from '@/components/recent-bids'
import { getLeaderboardData } from '@/lib/listings.functions'
import { feePercentLabel, formatMoney, PLATFORM } from '@/lib/platform'
import { useLiveRefresh } from '@/lib/use-live-refresh'

export const Route = createFileRoute('/leaderboard')({
  head: () => ({ meta: [{ title: 'Live leaderboard · BidMySite' }] }),
  loader: () => getLeaderboardData(),
  component: LeaderboardPage,
})

type Sort = 'total' | 'highest' | 'newest'

function LeaderboardPage() {
  const { leaderboard, stats, recentBids } = Route.useLoaderData()
  useLiveRefresh()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('total')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? leaderboard.filter(
          (l) =>
            l.title.toLowerCase().includes(q) ||
            l.url.toLowerCase().includes(q),
        )
      : leaderboard
    if (sort === 'highest')
      return [...filtered].sort((a, b) => b.highestBidCents - a.highestBidCents)
    if (sort === 'newest')
      return [...filtered].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      )
    return filtered
  }, [leaderboard, query, sort])

  return (
    <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <LiveIndicator />
          <h1 className="mt-4 text-4xl font-extrabold sm:text-5xl">
            Live leaderboard
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Websites are ranked by the total of their verified bids. Ties go to
            whoever reached the total first.
          </p>
        </div>
        <Button asChild size="lg">
          <Link to="/submit">Submit your website</Link>
        </Button>
      </div>

      <dl className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Websites ranked', String(stats.listingCount)],
          ['Verified bids', String(stats.bidCount)],
          ['Total bid', formatMoney(stats.totalBidCents)],
          ['Minimum bid', formatMoney(PLATFORM.minBidCents)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="tabular mt-1 text-2xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search websites"
                placeholder="Search by name or URL"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Tabs value={sort} onValueChange={(v) => setSort(v as Sort)}>
              <TabsList>
                <TabsTrigger value="total">Rank</TabsTrigger>
                <TabsTrigger value="highest">Highest bid</TabsTrigger>
                <TabsTrigger value="newest">Newest</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {leaderboard.length > 0 && visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-6 py-12 text-center">
              <p className="font-medium">No websites match “{query}”</p>
              <Button variant="link" onClick={() => setQuery('')}>
                Clear search
              </Button>
            </div>
          ) : (
            <LeaderboardList listings={visible} />
          )}
        </div>
        <aside className="space-y-6">
          <RecentBidsFeed bids={recentBids} />
          <div className="rounded-2xl border bg-card p-5 text-sm">
            <h2 className="font-bold">Ranking rules</h2>
            <ul className="mt-3 space-y-2 text-muted-foreground">
              <li>Only payments confirmed by a connected payment provider will count. None are connected yet.</li>
              <li>Once bidding opens, the full bid amount will be added to the website's total.</li>
              <li>A {feePercentLabel()} platform fee will be shown before any payment.</li>
              <li>Refunded or failed payments never affect rankings.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
