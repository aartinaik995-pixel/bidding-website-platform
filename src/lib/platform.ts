// Platform rules and shared types for BidMySite.
// These values are the single source of truth for fees and bid limits;
// the server-side payment flow must read from here too.

export const PLATFORM = {
  name: "BidMySite",
  currency: "USD",
  /** Minimum amount (in cents) for a single bid. */
  minBidCents: 100,
  /** Maximum amount (in cents) for a single bid. */
  maxBidCents: 500_000,
  /** Platform fee charged on top of every bid, in basis points (1000 = 10%). */
  platformFeeBps: 1000,
  /** How many positions the homepage spotlight shows. */
  spotlightSize: 10,
} as const;

export type BidStatus = "pending" | "paid" | "failed" | "refunded";
export type ListingStatus = "pending" | "approved" | "removed";

export type Bid = {
  id: string;
  listingId: string;
  bidderName: string;
  amountCents: number;
  /** Only bids with status "paid" ever count toward rankings. */
  status: BidStatus;
  createdAt: string;
};

export type Listing = {
  id: string;
  slug: string;
  url: string;
  title: string;
  description: string;
  ownerName: string;
  /** Only approved listings can be bid on or appear on the leaderboard. */
  status: ListingStatus;
  createdAt: string;
  /** Sum of all paid bids, in cents. Ranking is ordered by this value. */
  totalCents: number;
  /** Largest single paid bid, in cents. */
  highestBidCents: number;
  bidCount: number;
  lastBidAt: string | null;
};

/** `rank` is 0 when the listing has no verified bids and is not on the board. */
export type RankedListing = Listing & { rank: number };

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: PLATFORM.currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** Whole-cent bid amounts inside the platform limits. */
export function isValidBidAmount(amountCents: number) {
  return (
    Number.isInteger(amountCents) &&
    amountCents >= PLATFORM.minBidCents &&
    amountCents <= PLATFORM.maxBidCents
  );
}

export function feeBreakdown(amountCents: number) {
  const feeCents = Math.round((amountCents * PLATFORM.platformFeeBps) / 10_000);
  // The full bid counts toward ranking; the fee is added on top at checkout.
  return { amountCents, feeCents, totalChargeCents: amountCents + feeCents };
}

export function feePercentLabel() {
  return `${PLATFORM.platformFeeBps / 100}%`;
}

export function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function rankListings(listings: Listing[]): RankedListing[] {
  return [...listings]
    .sort(
      (a, b) =>
        b.totalCents - a.totalCents ||
        (a.lastBidAt ?? "").localeCompare(b.lastBidAt ?? ""),
    )
    .map((listing, index) => ({ ...listing, rank: index + 1 }));
}

export function timeAgo(iso: string) {
  const seconds = Math.max(
    1,
    Math.round((Date.now() - Date.parse(iso)) / 1000),
  );
  const steps: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
  ];
  let value = seconds;
  for (const [size, unit] of steps) {
    if (value < size) return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
    value = Math.floor(value / size);
  }
  return `${value} year${value === 1 ? "" : "s"} ago`;
}

/** Operator details shown on the legal pages. Only values supplied by the operator. */
export const OPERATOR = {
  name: "Aarti Naik",
  contactEmail: "rajpurohitlalit2810@gmail.com",
} as const;
