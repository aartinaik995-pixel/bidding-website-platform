# BidMySite

BidMySite is a public leaderboard where people submit their websites and place paid bids to compete for the top positions. Websites are ranked by the total of their verified bids. A transparent platform fee is added at checkout, which is how the owner earns.

## What's live

- **Homepage**: hero, top of the board, how it works, latest verified bids.
- **Live leaderboard** (`/leaderboard`): search, sorting and ranking rules.
- **Submit Website** (`/submit`): URL, title and description, with a live preview. Listings publish immediately and are stored in the database.
- **Website details** (`/site/:slug`): rank, totals, bid history and a bid panel with the fee breakdown.
- **Dashboard** (`/dashboard`): account, websites, bids and receipts.
- **How it works** (`/how-it-works`): FAQ and an example of the fee breakdown.
- **Admin** (`/admin`): listing removal/restoration, payment status, full refunds, platform-fee reporting and CSV export.
- **Policies** (`/terms`, `/privacy`, `/refund-policy`): service, data-use and refund details.

No sample or invented bids are shown anywhere. Only server-verified payments affect rankings or revenue. The repository implements Stripe Checkout only; checkout remains disabled unless both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are present in the hosting environment. Razorpay and PayPal are not implemented. This repository does not confirm whether deployment secrets or Stripe dashboard webhooks are configured.

## Tech

TanStack Start (React 19, Vite), Tailwind CSS 4, shadcn/ui components, Netlify Identity, Netlify Database (Postgres + Drizzle), and Stripe Checkout with webhook verification, deployed on Netlify.

## Run locally

```bash
pnpm install
netlify dev        # or: pnpm dev (no Netlify Forms emulation)
```

## Settings needed for launch

| What                    | Where                                                      | When        |
| ----------------------- | ---------------------------------------------------------- | ----------- |
| Netlify Database        | Provisioned automatically by Netlify on first use          | Milestone 3 |
| Netlify Identity        | Enabled automatically when accounts are added              | Milestone 2 |
| `STRIPE_SECRET_KEY`     | Netlify → Project configuration → Environment variables    | Milestone 4 |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Webhooks, endpoint pointing at the site | Milestone 4 |
| Admin user              | Assign the `admin` role to the owner in Netlify Identity   | Milestone 2 |

The two Stripe variables are required before checkout can be enabled. Use Stripe test mode first and verify the webhook endpoint; the presence of variable names alone does not prove that the credentials or endpoint work.

## Roadmap

See [PLAN.md](PLAN.md) for implementation status and remaining launch work.
