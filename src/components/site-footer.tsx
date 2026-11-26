import { Link } from "@tanstack/react-router";

import { BrandMark } from "@/components/brand";
import { feePercentLabel } from "@/lib/platform";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t bg-ink text-ink-foreground">
      <div className="mx-auto grid max-w-content gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <BrandMark className="text-ink-foreground" />
          <p className="max-w-sm text-sm text-ink-foreground/70">
            A public leaderboard for websites. Bidding is not open yet. No bots, no invented bids.
          </p>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">Platform</h2>
          <ul className="space-y-2 text-sm text-ink-foreground/70">
            <li>
              <Link to="/leaderboard" className="hover:text-ink-foreground">
                Live leaderboard
              </Link>
            </li>
            <li>
              <Link to="/submit" className="hover:text-ink-foreground">
                Submit a website
              </Link>
            </li>
            <li>
              <Link to="/dashboard" className="hover:text-ink-foreground">
                Your dashboard
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">Fair play</h2>
          <ul className="space-y-2 text-sm text-ink-foreground/70">
            <li>
              <Link to="/how-it-works" className="hover:text-ink-foreground">
                How ranking works
              </Link>
            </li>
            <li>Transparent {feePercentLabel()} platform fee</li>
            <li>Payments verified server-side</li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">Policies</h2>
          <ul className="space-y-2 text-sm text-ink-foreground/70">
            <li>
              <Link to="/terms" className="hover:text-ink-foreground">
                Terms of Service
              </Link>
            </li>
            <li>
              <Link to="/privacy" className="hover:text-ink-foreground">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link to="/refund-policy" className="hover:text-ink-foreground">
                Refund Policy
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-foreground/10">
        <p className="mx-auto max-w-content px-4 py-5 text-xs text-ink-foreground/50 sm:px-6">
          © {new Date().getFullYear()} BidMySite.
        </p>
      </div>
    </footer>
  );
}
