import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Crown, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  formatMoney,
  hostnameOf,
  timeAgo,
  type RankedListing,
} from "@/lib/platform";
import { cn } from "@/lib/utils";

const medal = [
  "bg-gold text-ink",
  "bg-silver text-ink",
  "bg-bronze text-ink-foreground",
];

export function RankBadge({
  rank,
  className,
}: {
  rank: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tabular grid size-9 shrink-0 place-items-center rounded-lg text-sm font-bold",
        medal[rank - 1] ?? "bg-secondary text-secondary-foreground",
        className,
      )}
    >
      {rank}
    </span>
  );
}

export function SiteInitial({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-lg border bg-card font-display text-lg font-bold uppercase",
        className,
      )}
    >
      {title.trim().charAt(0) || "?"}
    </span>
  );
}

export function LiveIndicator({ label = "Live" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-semibold">
      <span className="live-dot size-2 rounded-full bg-live" />
      {label}
    </span>
  );
}

export function LeaderboardList({ listings }: { listings: RankedListing[] }) {
  if (listings.length === 0) return <EmptyLeaderboard />;

  return (
    <ol className="divide-y overflow-hidden rounded-2xl border bg-card">
      {listings.map((listing) => (
        <li key={listing.id}>
          <Link
            to="/site/$slug"
            params={{ slug: listing.slug }}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-4 transition-colors hover:bg-secondary/60 motion-reduce:transition-none sm:grid-cols-[auto_auto_1fr_auto_auto_auto] sm:gap-4 sm:px-5"
          >
            <RankBadge rank={listing.rank} />
            <SiteInitial title={listing.title} className="hidden sm:grid" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{listing.title}</p>
              <p className="truncate text-sm text-muted-foreground">
                {hostnameOf(listing.url)}
              </p>
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-xs text-muted-foreground">Highest bid</p>
              <p className="tabular text-sm">
                {formatMoney(listing.highestBidCents)}
              </p>
            </div>
            <div className="hidden text-right md:block">
              <p className="text-xs text-muted-foreground">Last bid</p>
              <p className="text-sm">
                {listing.lastBidAt ? timeAgo(listing.lastBidAt) : "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="tabular text-base font-bold">
                {formatMoney(listing.totalCents)}
              </p>
              <p className="text-xs text-muted-foreground">
                {listing.bidCount} bid{listing.bidCount === 1 ? "" : "s"}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** Shown until the first verified payment lands. Slots are labelled unclaimed, never filled with sample data. */
export function EmptyLeaderboard({ compact = false }: { compact?: boolean }) {
  const slots = compact ? 3 : 5;
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <ol aria-label="Unclaimed positions" className="divide-y">
        {Array.from({ length: slots }, (_, i) => (
          <li
            key={i}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-4 sm:px-5"
          >
            <RankBadge
              rank={i + 1}
              className={i > 2 ? "opacity-60" : undefined}
            />
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-dashed text-muted-foreground">
                {i === 0 ? (
                  <Crown className="size-4" />
                ) : (
                  <Trophy className="size-4" />
                )}
              </span>
              <div>
                <p className="font-semibold text-muted-foreground">Unclaimed</p>
                <p className="text-sm text-muted-foreground/80">
                  {i === 0 ? "The top spot is open" : "Open position"}
                </p>
              </div>
            </div>
            <p className="tabular text-sm text-muted-foreground">$0</p>
          </li>
        ))}
      </ol>
      <div className="flex flex-col items-start justify-between gap-4 border-t bg-secondary/60 px-4 py-5 sm:flex-row sm:items-center sm:px-5">
        <p className="text-sm text-muted-foreground">
          Bidding is not open yet.
        </p>
        <Button asChild size="sm">
          <Link to="/submit">
            Claim #1 <ArrowUpRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}
