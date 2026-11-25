# BidMySite

BidMySite is a paid-bidding leaderboard. New listings are immediately eligible for bids; they can be removed by an administrator. Ranking totals include only payments verified by PayPal on the server. A transparent 10% platform fee is added to each bid.

## Run locally

```bash
pnpm install
netlify dev
```

## PayPal configuration

Set these as **server-side** environment variables in Netlify (never `VITE_*`, never commit credential values):

| Variable | Required value |
| --- | --- |
| `PAYPAL_CLIENT_ID` | REST app client ID from the PayPal Developer Dashboard for the selected environment |
| `PAYPAL_CLIENT_SECRET` | Matching REST app secret; keep private and rotate if exposed |
| `PAYPAL_WEBHOOK_ID` | Webhook ID created in the same PayPal app for the deployed webhook endpoint |
| `SITE_URL` | **Required.** Public `https://` address of this site, used for PayPal return and cancel links. The request Host header is never used. |
| `PAYPAL_ENVIRONMENT` | **Required**, no default. `sandbox` for testing; `live` only for production credentials. Production deploys (`CONTEXT=production`) must use `live`, otherwise PayPal checkout stays disabled. |

Register `https://<your-deployed-domain>/api/paypal-webhook` in the same PayPal app with events `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, `CUSTOMER.DISPUTE.CREATED` and `CUSTOMER.DISPUTE.RESOLVED`. Use the webhook ID PayPal assigns for `PAYPAL_WEBHOOK_ID`. The webhook URL must be publicly reachable over HTTPS.

The project also needs Netlify Database/Postgres and Netlify Identity configured as before. Deploying the SQL migration is required before the new payment flow can work. No PayPal credentials are present in this repository; obtain the real sandbox keys and webhook ID from your PayPal account. Test orders, capture, signature verification, refunds, and retries in sandbox before switching all three PayPal values to the live app equivalents and setting the environment to `live`.

## Checks

```bash
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm test
```

Deployment is intentionally not triggered by these code changes; review and approve deployment separately.
