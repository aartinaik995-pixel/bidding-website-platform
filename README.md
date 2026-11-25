# BidMySite

BidMySite is a public website leaderboard. Users submit websites and place paid bids; only server-verified PayPal captures count toward rankings. The 10% platform fee is calculated server-side and added to the bid total.

## Product and accounts

- Public homepage and leaderboard, listing pages and history, submissions, user dashboard, admin management, and policy routes.
- Netlify Identity account sign-up, login and recovery; protected account dashboard.
- New listings publish immediately. Moderators can remove or restore listings; submissions do not wait for admin approval.
- Netlify Database stores listings, bids, and revenue ledger. Database-backed rate limits protect submission and checkout creation.

## PayPal payments

- Server creates PayPal Orders v2 using bid metadata and totals derived from persisted server records.
- PayPal return is not proof of payment. The app captures/retrieves the order server-side and verifies completed order, bid ID, captured amount and currency before recording payment and updating leaderboard totals.
- Webhook authenticity is checked against PayPal using the configured webhook ID; event handling is idempotent. Refunds only affect ranking after PayPal confirms completion.
- Admins retain listing moderation, payment history, full PayPal refunds and revenue export.

Configure Netlify variables `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT` (`sandbox` or `live`), and `PAYPAL_WEBHOOK_ID`. Register `https://YOUR_DOMAIN/api/paypal-webhook` in the matching PayPal app for `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.CAPTURE.REFUNDED`.

No PayPal credentials are stored in source control. Configure the Netlify Database and Identity as well. The migration is applied by the deployment pipeline; verify it in a preview/deployment before checkout is enabled.

## Local checks

```sh
pnpm install
netlify dev
pnpm test
pnpm lint
pnpm build
```
