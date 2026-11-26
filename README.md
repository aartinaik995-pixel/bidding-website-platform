# BidMySite

BidMySite is a public leaderboard where people submit their websites and place paid bids to compete for the top positions. Websites are ranked by the total of their verified bids. A transparent platform fee is added at checkout, which is how the owner earns.

## What's live

- **Homepage**: hero, top of the board, how it works, latest verified bids.
- **Live leaderboard** (`/leaderboard`): search, sorting and ranking rules.
- **Submit Website** (`/submit`): URL, title and description, with a live preview. Listings publish immediately and are stored in the database.
- **Website details** (`/site/:slug`): rank, totals, bid history and a bid panel with the fee breakdown.
- **Dashboard** (`/dashboard`): account, websites, bids and receipts.
- **How it works** (`/how-it-works`): FAQ and an example of the fee breakdown.
- **Admin** (`/admin`): listing removal/restoration, a list of bids, platform-fee reporting and CSV export. Refunds are not available until a payment provider is connected.
- **Policies** (`/terms`, `/privacy`, `/refund-policy`): service, data-use and refund details.

No sample or invented bids are shown anywhere. Only server-verified payments affect rankings or revenue. No payment provider is connected. Stripe code has been removed, and bidding is disabled, so no bid can be placed. PayPal Checkout is planned but not implemented until its compliance and payment model are verified.

## Current status (November 26, 2026)

- Stripe has been removed from the code, the dependency and the database schema (migration `20261126100000_remove_stripe_references`).
- Bidding is disabled. No payment provider is connected, and no bid or payment can be created.
- Verified locally: migrations apply cleanly to a fresh Postgres 16 schema, the schema columns match `db/schema.ts`, URL validation and redirect helpers pass their checks, and all changed TypeScript files parse.
- Not verified: `pnpm install --frozen-lockfile`, production build, TypeScript, ESLint, Prettier, the test suite, browser flows, mobile layout, and the Netlify deploy preview. Do not treat the site as production-ready until these pass.
- The 10% platform fee is documented, but no money is collected.

## Tech

TanStack Start (React 19, Vite), Tailwind CSS 4, shadcn/ui components, Netlify Identity, and Netlify Database (Postgres + Drizzle), deployed on Netlify.

## Run locally

```bash
pnpm install
netlify dev        # or: pnpm dev (no Netlify Forms emulation)
```

## Settings needed for launch

| What                | Where                                           | When        |
| ------------------- | ----------------------------------------------- | ----------- |
| Netlify Database    | Provisioned automatically by Netlify on first use | Milestone 3 |
| Netlify Identity    | Enabled automatically when accounts are added   | Milestone 2 |
| Admin user          | Assign the `admin` role to the owner in Netlify Identity | Milestone 2 |

No payment environment variables are read by the application. PayPal settings are added only after the PayPal milestone.

## Roadmap

See [PLAN.md](PLAN.md) for implementation status and remaining launch work.
