# BidMySite roadmap

BidMySite is a public leaderboard where website owners submit their sites and place paid bids to rank higher. The platform earns a transparent fee on every bid. One rule holds at every step: **nothing is ranked, counted or shown as paid unless the payment provider has confirmed it to the server.**

The product is delivered in milestones, each one shippable on its own.

## Repository audit — October 23, 2026

The repository contains working source implementations for account sign-up and recovery, database-backed listings and bids, server-verified payment code (Stripe, now removed), periodic leaderboard refresh, and the admin/revenue dashboard. This is a code review only: no Netlify connection is available here, so the deployed database, Identity settings, Stripe credentials, webhook endpoint, and live payment mode have not been verified. No payment provider is implemented; Stripe was removed and PayPal is pending review.

The terms, privacy, and refund pages are operational drafts. The operator's legal name, governing region, and privacy/support contact are not in the repository and must be supplied before those pages can be treated as final.

## Milestone 1 — Product surface ✅

- Branded homepage, live leaderboard, Submit Website page, website details page (`/site/$slug`), user dashboard and How it works page.
- Shared rules in `src/lib/platform.ts` set the bid range, 10% fee and ranking order.
- Live listings and bids come from Netlify Database; empty states remain honest and no sample bids are used.
- New listings publish immediately. Only listings with verified paid bids enter the ranked leaderboard.

## Milestone 2 — User accounts ✅

- Netlify Identity provides email/password sign-up, login, and password recovery.
- The header shows signed-in state; `/dashboard` requires sign-in.
- The `admin` role is read from server-verified Identity user metadata and checked on protected server functions.
- Google sign-in is not implemented. Production Identity configuration has not been checked.

## Milestone 3 — Database and real listings ✅

- Netlify Database (managed Postgres) with Drizzle ORM; schema is in `db/schema.ts` and migrations are deployed from `netlify/database/migrations`.
- Tables:
  - `users`: mirrors Identity users.
  - `listings`: URL, title, description, owner, and a status of approved or removed. The migration publishes legacy pending listings.
  - `bids`: listing, bidder, amount, fee, status (pending, paid, failed or refunded), Stripe session and payment IDs.
  - `platform_ledger`: one row per fee or refund, for revenue reporting.
- Submissions are authenticated, validated, rate-limited, and persisted as live listings.
- Netlify Forms import is not part of the current repository; no Forms inbox was accessible during this audit.

## Milestone 4 — Secure payments (not started; Stripe removed)

- Stripe integration, its webhook route, checkout success page and server payment code were removed.
- Bidding is disabled: the Place a bid control cannot submit anything, and no server function creates a bid.
- PayPal Checkout is the planned provider. It stays out of the repository until PayPal's acceptable-use policy and the payment model are verified for this business.
- Webhook verification for PayPal payments and refunds is required before any bid counts toward rankings.
- Existing `bids` columns named `stripe_*` and the `stripe_events` table remain in the database. Removing them needs a migration.

## Milestone 5 — Live leaderboard ✅ (email notifications remain)

- Homepage, leaderboard, and details pages refresh every 15 seconds while visible so newly verified bids appear without a reload.
- "You've been outbid" email notifications are not implemented.

## Milestone 6 — Admin dashboard ✅

- `/admin`, available only to the admin role:
  - live listings can be removed or restored; submissions no longer wait for approval
  - all bids with their payment status
  - refunds: not available until a payment provider is connected
- Revenue: gross bids, platform fees earned, refunds and net, by day and month, with CSV export.

## Milestone 7 — Hardening and launch (code added; production setup outstanding)

- Database-backed rate limits protect listing submission and checkout creation. Listing URLs reject local/reserved hosts, credentials, and IP literals; outbound user links use `rel="nofollow ugc"`.
- Terms of Service, Privacy Policy, and Refund Policy pages are present as drafts. Add the verified operator identity, governing region, support/privacy contact, and retention period before public launch.
- Configure Netlify Identity and Database. Payment setup (PayPal) waits for compliance review. No production deployment or live payment was performed in this audit.
