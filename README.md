# BidMySite

BidMySite is a public website leaderboard. Listings are published on submission; only bids verified as completed by PayPal are included in ranking totals.

## Payments

Checkout uses PayPal Orders v2 with server-created orders and server-side capture. The return URL is not trusted as proof: the server retrieves/captures the PayPal order and validates its completed status, bid reference, amount, and currency before changing bid or leaderboard totals. PayPal webhook transmissions are verified using PayPal's webhook signature verification API and processed idempotently.

Set these Netlify environment variables for the site and deploy contexts:

| Variable | Value |
| --- | --- |
| `PAYPAL_CLIENT_ID` | PayPal REST app client ID (Sandbox or Live) |
| `PAYPAL_CLIENT_SECRET` | Matching REST app secret; store only in Netlify |
| `PAYPAL_ENVIRONMENT` | `sandbox` for testing, `live` for production |
| `PAYPAL_WEBHOOK_ID` | Webhook ID from the same PayPal app used for the API credentials |

Register `https://YOUR_PRODUCTION_DOMAIN/api/paypal-webhook` in the matching PayPal environment and subscribe to `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.CAPTURE.REFUNDED`. `PAYPAL_WEBHOOK_ID` is required for server verification, in addition to the three requested variables. Use Sandbox buyer and seller accounts for test transactions; switch credentials and webhook registration together for production. Configure Netlify Identity and Netlify Database as before and allow the deployed migration to run before enabling checkout.

No PayPal credentials are committed. A production payment cannot be tested from source control alone; validate Sandbox checkout, verified webhook delivery, duplicate webhook retries, refunds, and leaderboard removal before switching to Live.

## Development

```sh
pnpm install
netlify dev
pnpm test
pnpm lint
pnpm build
```
