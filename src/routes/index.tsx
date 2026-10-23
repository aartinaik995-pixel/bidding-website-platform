import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BadgeCheck,
  Gavel,
  Globe,
  Receipt,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  EmptyLeaderboard,
  LeaderboardList,
  LiveIndicator,
} from '@/components/leaderboard'
import { RecentBidsFeed } from '@/components/recent-bids'
import { getHomeData } from '@/lib/listings.functions'
import { feePercentLabel, formatMoney, PLATFORM } from '@/lib/platform'
import { useLiveRefresh } from '@/lib/use-live-refresh'

export const Route = createFileRoute('/')({
  loader: () => getHomeData({ data: { limit: PLATFORM.spotlightSize } }),
  component: Home,
})

const steps = [
  {
    icon: Globe,
    title: 'Submit your website',
    body: 'Add your URL, a title and a short description. Your listing gets its own public page.',
  },
  {
    icon: Gavel,
    title: 'Place a paid bid',
    body: `Bid from ${formatMoney(PLATFORM.minBidCents)}. Every bid adds to your site's total — the higher the total, the higher the rank.`,
  },
  {
    icon: TrendingUp,
    title: 'Climb the leaderboard',
    body: 'Rankings update the moment a payment is verified. Anyone can outbid you, and you can bid again.',
  },
]

const trust = [
  {
    icon: ShieldCheck,
    title: 'Verified payments only',
    body: 'A bid counts only after the payment provider confirms it to our server. Nothing is ranked on a promise.',
  },
  {
    icon: BadgeCheck,
    title: 'No invented activity',
    body: 'Every number on BidMySite comes from a real, paid bid. Empty means empty.',
  },
  {
    icon: Receipt,
    title: 'Clear pricing',
    body: `A flat ${feePercentLabel()} platform fee is shown before you pay. Your full bid counts toward your rank.`,
  },
]

function Home() {
  const { leaderboard, recentBids } = Route.useLoaderData()
  useLiveRefresh()
  const top3 = leaderboard.slice(0, 3)

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="grid-paper pointer-events-none absolute inset-0"
        />
        <div className="relative mx-auto grid max-w-content gap-12 px-4 pt-14 pb-16 sm:px-6 md:pt-20 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <LiveIndicator label="Leaderboard is live" />
            <h1 className="mt-6 text-5xl leading-[0.95] font-extrabold sm:text-6xl lg:text-7xl">
              Outbid the internet.
              <br />
              <span className="relative inline-block text-primary">
                Own the top spot.
                <svg
                  aria-hidden
                  viewBox="0 0 300 12"
                  className="absolute -bottom-2 left-0 h-3 w-full text-primary/40"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M2 9c60-6 130-8 296-4"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-lg text-muted-foreground">
              BidMySite is a public leaderboard for websites. Submit yours,
              place a paid bid and watch it climb. The more you bid, the higher
              you rank.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 px-6 text-base">
                <Link to="/submit">
                  Submit your website <ArrowRight />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 px-6 text-base"
              >
                <Link to="/leaderboard">View the leaderboard</Link>
              </Button>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t pt-6">
              <div>
                <dt className="text-xs text-muted-foreground">Minimum bid</dt>
                <dd className="tabular mt-1 text-xl font-bold">
                  {formatMoney(PLATFORM.minBidCents)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Platform fee</dt>
                <dd className="tabular mt-1 text-xl font-bold">
                  {feePercentLabel()}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Ranked by</dt>
                <dd className="mt-1 text-xl font-bold">Total paid</dd>
              </div>
            </dl>
          </div>

          <div className="relative">
            <div
              aria-hidden
              className="absolute -inset-3 -z-10 rotate-2 rounded-3xl bg-primary/10"
            />
            <div className="rounded-3xl border bg-background p-3 shadow-[0_24px_60px_-30px_oklch(0.19_0.02_265/0.45)]">
              <div className="flex items-center justify-between px-3 pt-2 pb-4">
                <h2 className="text-lg font-bold">Top of the board</h2>
                <Link
                  to="/leaderboard"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Full rankings
                </Link>
              </div>
              {top3.length > 0 ? (
                <LeaderboardList listings={top3} />
              ) : (
                <EmptyLeaderboard compact />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y bg-card">
        <div className="mx-auto max-w-content px-4 py-16 sm:px-6 md:py-20">
          <p className="text-sm font-semibold tracking-widest text-primary uppercase">
            How it works
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-extrabold sm:text-4xl">
            Three steps from submitted to spotlighted
          </h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map((step, i) => (
              <li
                key={step.title}
                className="relative rounded-2xl border bg-background p-6"
              >
                <span className="tabular absolute top-5 right-6 text-4xl font-bold text-border">
                  0{i + 1}
                </span>
                <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <step.icon className="size-5" />
                </span>
                <h3 className="mt-5 text-xl font-bold">{step.title}</h3>
                <p className="mt-2 text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Spotlight + recent bids */}
      <section className="mx-auto max-w-content px-4 py-16 sm:px-6 md:py-20">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold tracking-widest text-primary uppercase">
              Live rankings
            </p>
            <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">
              Top {PLATFORM.spotlightSize} right now
            </h2>
          </div>
          <Button asChild variant="outline">
            <Link to="/leaderboard">
              See all rankings <ArrowRight />
            </Link>
          </Button>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <LeaderboardList listings={leaderboard} />
          <RecentBidsFeed bids={recentBids} />
        </div>
      </section>

      {/* Trust */}
      <section className="mx-auto max-w-content px-4 sm:px-6">
        <div className="rounded-3xl bg-ink px-6 py-12 text-ink-foreground sm:px-10 md:py-16">
          <h2 className="max-w-2xl text-3xl font-extrabold sm:text-4xl">
            Real money. Real rankings. Nothing staged.
          </h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {trust.map((item) => (
              <div key={item.title}>
                <item.icon className="size-6 text-primary" />
                <h3 className="mt-4 text-lg font-bold">{item.title}</h3>
                <p className="mt-2 text-ink-foreground/70">{item.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-col gap-3 border-t border-ink-foreground/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-ink-foreground/80">
              Ready to put your website on the board?
            </p>
            <Button asChild size="lg">
              <Link to="/submit">
                Submit your website <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
