import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBidCheckout } from "@/lib/account.functions";
import {
  feeBreakdown,
  feePercentLabel,
  formatMoney,
  isValidBidAmount,
  PLATFORM,
} from "@/lib/platform";

/**
 * Bid amount picker with a transparent fee breakdown. "Pay" sends only the
 * bid amount to the server, which prices the charge and opens Stripe
 * Checkout. The bid counts only after Stripe confirms the payment.
 */
export function BidPanel({
  listingId,
  currentTotalCents,
  leaderTotalCents,
  isLeader,
  open,
  signedIn,
  paymentsReady,
}: {
  listingId: string;
  currentTotalCents: number;
  leaderTotalCents: number;
  isLeader: boolean;
  open: boolean;
  signedIn: boolean;
  paymentsReady: boolean;
}) {
  const location = useLocation();
  const startCheckout = useServerFn(createBidCheckout);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toLead = isLeader
    ? PLATFORM.minBidCents
    : Math.max(
        PLATFORM.minBidCents,
        leaderTotalCents - currentTotalCents + 100,
      );
  const [dollars, setDollars] = useState(String(toLead / 100));
  const cents = Math.round(Number(dollars) * 100);
  const valid = isValidBidAmount(cents);
  const { feeCents, totalChargeCents } = feeBreakdown(valid ? cents : 0);
  const presets = [toLead, toLead + 500, toLead + 2000].filter(
    isValidBidAmount,
  );

  async function pay() {
    if (!valid || pending) return;
    setPending(true);
    setError(null);
    try {
      const { url } = await startCheckout({
        data: { listingId: Number(listingId), amountCents: cents },
      });
      window.location.assign(url);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Could not open checkout.",
      );
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-6">
      <h2 className="text-lg font-bold">Place a bid</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {isLeader
          ? "This website holds #1. Bid again to extend its lead."
          : `${formatMoney(toLead)} takes this website to #1.`}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {presets.map((p) => (
          <Button
            key={p}
            type="button"
            size="sm"
            variant={cents === p ? "default" : "outline"}
            onClick={() => setDollars(String(p / 100))}
            className="tabular"
          >
            {formatMoney(p)}
          </Button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="bid-amount">Bid amount (USD)</Label>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
            $
          </span>
          <Input
            id="bid-amount"
            inputMode="decimal"
            value={dollars}
            onChange={(e) => setDollars(e.target.value.replace(/[^\d.]/g, ""))}
            className="tabular pl-7"
            aria-invalid={!valid}
            aria-describedby="bid-amount-help"
          />
        </div>
        <p id="bid-amount-help" className="text-xs text-muted-foreground">
          Between {formatMoney(PLATFORM.minBidCents)} and{" "}
          {formatMoney(PLATFORM.maxBidCents)}.
        </p>
      </div>

      <dl className="mt-5 space-y-2 border-t pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Bid (counts toward rank)</dt>
          <dd className="tabular">{formatMoney(valid ? cents : 0)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">
            Platform fee ({feePercentLabel()})
          </dt>
          <dd className="tabular">{formatMoney(feeCents)}</dd>
        </div>
        <div className="flex justify-between border-t pt-2 font-bold">
          <dt>You pay</dt>
          <dd className="tabular">{formatMoney(totalChargeCents)}</dd>
        </div>
      </dl>

      {error && (
        <Alert variant="destructive" role="alert" className="mt-5">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!open ? (
        <Button className="mt-5 w-full" size="lg" disabled>
          <Lock /> Bidding is unavailable for this listing
        </Button>
      ) : !paymentsReady ? (
        <Button className="mt-5 w-full" size="lg" disabled>
          <Lock /> Secure checkout opening soon
        </Button>
      ) : !signedIn ? (
        <Button asChild className="mt-5 w-full" size="lg">
          <Link to="/login" search={{ redirect: location.pathname }}>
            <Lock /> Sign in to bid
          </Link>
        </Button>
      ) : (
        <Button
          className="mt-5 w-full"
          size="lg"
          disabled={!valid || pending}
          onClick={pay}
        >
          <Lock />{" "}
          {pending
            ? "Opening secure checkout…"
            : `Pay ${formatMoney(totalChargeCents)}`}
        </Button>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        {paymentsReady
          ? "Stripe Checkout is configured. Your bid is added only after Stripe confirms payment to our server."
          : "Payments are not configured. Checkout is disabled, and no bid will be counted without server confirmation."}
      </p>
    </div>
  );
}
