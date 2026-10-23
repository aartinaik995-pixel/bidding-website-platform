import { Link } from '@tanstack/react-router'
import { Activity } from 'lucide-react'

import { formatMoney, timeAgo, type Bid, type Listing } from '@/lib/platform'

export function RecentBidsFeed({
  bids,
}: {
  bids: (Bid & { listing?: Listing })[]
}) {
  return (
    <section
      aria-labelledby="recent-bids"
      className="rounded-2xl border bg-card p-5"
    >
      <div className="flex items-center justify-between">
        <h3 id="recent-bids" className="font-bold">
          Latest verified bids
        </h3>
        <Activity className="size-4 text-muted-foreground" />
      </div>

      {bids.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed px-4 py-10 text-center">
          <p className="font-medium">No bids yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Bids appear here the moment their payment is confirmed.
          </p>
        </div>
      ) : (
        <ul className="mt-4 divide-y">
          {bids.map((bid) => (
            <li
              key={bid.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">
                  <span className="font-medium">{bid.bidderName}</span> bid on{' '}
                  {bid.listing ? (
                    <Link
                      to="/site/$slug"
                      params={{ slug: bid.listing.slug }}
                      className="font-medium text-primary hover:underline"
                    >
                      {bid.listing.title}
                    </Link>
                  ) : (
                    'a listing'
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {timeAgo(bid.createdAt)}
                </p>
              </div>
              <span className="tabular shrink-0 text-sm font-bold">
                +{formatMoney(bid.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
