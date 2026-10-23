# BidMySite

BidMySite is a public leaderboard where people submit their websites and place paid bids to compete for the top positions. Websites are ranked by the total of their verified bids. A transparent platform fee is added at checkout, which is how the owner earns.

## What's live

- **Homepage**: hero, top of the board, how it works, latest verified bids.
- **Live leaderboard** (`/leaderboard`): search, sorting and ranking rules.
- **Submit Website** (`/submit`): URL, title and description, with a live preview of the details page. Requests are stored with Netlify Forms.
- **Website details** (`/site/:slug`): rank, totals, bid history and a bid panel with the fee breakdown.
- **Dashboard** (`/dashboard`): your websites, bids and receipts.
- **How it works** (`/how-it-works`): FAQ and an example of the fee breakdown.

No sample or invented bids are shown anywhere. Until real payments exist, the screens show empty states and checkout is disabled.

## Tech

TanStack Start (React 19, Vite), Tailwind CSS 4, shadcn/ui components and Netlify Forms, deployed on Netlify. Planned additions are Netlify Identity for accounts, Netlify Database (Postgres + Drizzle) for listings and bids, and Stripe Checkout with webhook verification for payments.

## Run locally

```bash
pnpm install
netlify dev        # or: pnpm dev (no Netlify Forms emulation)
```

## Settings needed for launch

| What | Where | When |
| --- | --- | --- |
| Netlify Database | Provisioned automatically by Netlify on first use | Milestone 3 |
| Netlify Identity | Enabled automatically when accounts are added | Milestone 2 |
| `STRIPE_SECRET_KEY` | Netlify → Project configuration → Environment variables | Milestone 4 |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Webhooks, endpoint pointing at the site | Milestone 4 |
| Admin user | Assign the `admin` role to the owner in Netlify Identity | Milestone 2 |

## Roadmap

See [PLAN.md](PLAN.md). Next up: user accounts, the database, Stripe payments, live updates, the admin dashboard with fee reporting, and launch hardening.
