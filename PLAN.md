# BidMySite roadmap

BidMySite is a public leaderboard where website owners submit their sites and place paid bids to rank higher. The platform earns a transparent fee on every bid. One rule holds at every step: **nothing is ranked, counted or shown as paid unless the payment provider has confirmed it to the server.**

The product is delivered in milestones, each one shippable on its own.

## Milestone 1 — Product surface ✅

- Branded homepage, live leaderboard, Submit Website page, website details page (`/site/$slug`), user dashboard and How it works page. All are mobile-friendly.
- Shared platform rules in `src/lib/platform.ts` (minimum and maximum bid, 10% fee, ranking order).
- The data layer is in `src/lib/fixtures.ts` and is deliberately empty, so every screen shows an honest empty state ("Unclaimed", "No bids yet").
- Listing requests from the Submit page are stored with Netlify Forms, so early submissions are not lost.
- The bid panel shows the fee breakdown, but checkout stays disabled until Milestone 4.

## Milestone 2 — User accounts

- Netlify Identity (`@netlify/identity`) with email/password sign-up and login, password reset and optional Google sign-in.
- Header shows signed-in state; `/dashboard` requires sign-in.
- An `admin` role (in Identity app metadata) for the owner, checked on the server.

## Milestone 3 — Database and real listings

- Netlify Database (managed Postgres) with Drizzle ORM, schema in `db/schema.ts`. Migrations are generated at deploy time.
- Tables:
  - `users`: mirrors Identity users.
  - `listings`: url, title, description, owner, and a status of pending, approved or removed.
  - `bids`: listing, bidder, amount, fee, status (pending, paid, failed or refunded), Stripe session and payment IDs.
  - `platform_ledger`: one row per fee or refund, for revenue reporting.
- Swap the functions in `src/lib/fixtures.ts` for server functions that query the database. The UI keeps the same function shapes.
- Submit page writes a `pending` listing tied to the signed-in user. Import any Netlify Forms requests received before then.

## Milestone 4 — Secure payments (Stripe)

- "Place a bid" creates a `pending` bid and a Stripe Checkout Session on the server. The amount is computed server-side from `PLATFORM`, never trusted from the browser.
- A Stripe webhook (`checkout.session.completed`, `charge.refunded`) verifies the signature using the webhook secret. Then, in one transaction, it marks the bid `paid`, updates the listing totals and writes a ledger row. It is idempotent on the Stripe event ID.
- The success page reads the bid status from the database and shows "Payment confirmed" only when the status is `paid`. Otherwise it shows "Waiting for confirmation".
- Credentials needed as Netlify environment variables: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Use test mode first.

## Milestone 5 — Live leaderboard

- Leaderboard, homepage and details pages refresh on an interval (or via server-sent events) so new verified bids appear without a reload.
- "You've been outbid" email notifications.

## Milestone 6 — Admin dashboard

- `/admin`, available only to the admin role:
  - a moderation queue to approve or remove listings
  - all bids with their payment status
  - refunds issued through Stripe
- Revenue: gross bids, platform fees earned, refunds and net, by day and month, with CSV export.

## Milestone 7 — Hardening and launch

- Rate limiting on submissions and checkout creation, URL validation and blocklist, and `rel="nofollow ugc"` on all outbound links (already in place).
- Terms of service, privacy policy and refund policy pages.
- Switch Stripe to live mode and set up payouts to the owner's bank account in the Stripe dashboard.
