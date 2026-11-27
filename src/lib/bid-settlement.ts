// Applies a verified bid to a listing's denormalized totals. Pure: the caller
// does the database write inside the same transaction that records the payment.

import { isValidBidAmount } from "./platform";

export type ListingTotals = {
  totalCents: number;
  highestBidCents: number;
  bidCount: number;
  lastBidAt: string | null;
};

export function applyVerifiedBid(
  current: ListingTotals,
  amountCents: number,
  paidAtIso: string,
): ListingTotals {
  if (!isValidBidAmount(amountCents))
    throw new Error("Bid amount is outside the allowed range.");
  if (Number.isNaN(Date.parse(paidAtIso)))
    throw new Error("Payment time is not a valid timestamp.");
  return {
    totalCents: current.totalCents + amountCents,
    highestBidCents: Math.max(current.highestBidCents, amountCents),
    bidCount: current.bidCount + 1,
    lastBidAt: paidAtIso,
  };
}
