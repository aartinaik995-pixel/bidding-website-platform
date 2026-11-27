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

## Current status

- Payment code is written but disabled. PayPal is off unless `PAYPAL_ENABLED=true`, `PAYPAL_ENVIRONMENT=sandbox` and both sandbox credentials are set. Live PayPal is refused in code.
- With payments off, the bid button shows "Bidding is not open yet" and no order or payment can be created.
- Email uses Gmail SMTP through a built-in client (no npm package), disabled until `EMAIL_ENABLED=true` is set along with `GMAIL_USER` and `GMAIL_APP_PASSWORD`.
- Written: pending-bid creation, PayPal order creation and approval link, return and cancel routes, webhook signature verification, settlement and refunds in SQL (`settle_verified_bid`, `refund_verified_bid`), admin refund button, and receipt/refund email templates.
- Verified locally: all migrations apply to a fresh Postgres 16 database, the settlement and refund self-check (`tests/db/settlement.test.sql`) passes, the node tests (`npm run test:node`) pass, and changed files parse.
- Not verified: dependency install, production build, full TypeScript check, ESLint, Prettier, Vitest, browser flows, mobile layout, the Netlify deploy preview, and any PayPal or email call (no sandbox credentials or provider configured).
- Do not treat the site as production-ready until the unverified items pass.
- The 10% platform fee is documented, and no money is collected while payments are disabled.

## Tech

TanStack Start (React 19, Vite), Tailwind CSS 4, shadcn/ui components, Netlify Identity, and Netlify Database (Postgres + Drizzle), deployed on Netlify.

## Run locally

```bash
pnpm install
netlify dev        # or: pnpm dev (no Netlify Forms emulation)
```

## Settings needed for launch

| What | Where | When |
| --- | --- | --- |
| Netlify Database | Provisioned automatically by Netlify on first use | Already wired |
| Netlify Identity | Enabled automatically when accounts are added | Already wired |
| Admin user | Assign the `admin` role to the owner in Netlify Identity | Before admin actions |
| `PAYPAL_ENABLED`, `PAYPAL_ENVIRONMENT`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Netlify environment variables | Sandbox testing only |
| `PAYPAL_WEBHOOK_ID` | Netlify environment variables, from the sandbox webhook | Sandbox testing only |
| Webhook URL `https://<site>/api/paypal-webhook` | PayPal developer dashboard, sandbox app | Sandbox testing only |
| `EMAIL_ENABLED` (set to `true` only after a verified test send), `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Netlify environment variables. The app password needs 2-Step Verification and is created at myaccount.google.com/apppasswords | Before sending email |
| `SITE_URL` | Optional override; Netlify's `URL` is used otherwise | Only if needed |

Copy `.env.example` for local settings. Never commit real secrets. Live PayPal is refused by the code until legal review and PayPal approval are complete, so a live environment value has no effect.

## Roadmap

See [PLAN.md](PLAN.md) for implementation status and remaining launch work.
