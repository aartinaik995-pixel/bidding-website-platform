# BidMySite roadmap

Payments use PayPal Checkout. New submitted listings are approved immediately for bidding, but administrators retain the ability to remove listings. Rankings and totals only use payments confirmed by the PayPal API or signature-verified webhook.

## Completed product and operational scope

- Existing homepage, leaderboard, submission, details, account and admin surfaces retained.
- Server-priced PayPal orders preserve the existing 10% platform fee and bid bounds.
- Listing submissions and existing pending listings become immediately eligible to receive bids.
- Webhook signature verification, event idempotency, amount/currency/order matching, refund reconciliation, and server-side receipt reconciliation.
- Existing Stripe columns/events are preserved to avoid discarding historical data; new checkout/refunds use PayPal.

## Deployment prerequisites

Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, and `PAYPAL_ENVIRONMENT` as documented in README. Provision Netlify Database and Identity. Apply the migration under `netlify/database/migrations/20261125000000_paypal_instant_bidding/`. Configure PayPal webhook events `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.CAPTURE.REFUNDED` at `/api/paypal-webhook`. Validate the complete lifecycle in sandbox before live credentials. No deployment is performed without explicit approval.
