# BidMySite roadmap

BidMySite is a public website leaderboard. Users submit websites and place paid bids; only server-verified PayPal captures count toward rankings. The 10% platform fee is calculated server-side and added to the bid total.

## Product and accounts

- Homepage, live leaderboard, listing detail/history, submission, account dashboard, and policy routes.
- Netlify Identity account sign-up, login, and recovery; protected account dashboard.
- Listings publish immediately when submitted. Admins may remove or restore listings for moderation; there is no approval queue.
- Database-backed listings, bids, and ledger. Rate limits protect listing and checkout creation.

## PayPal payments

- The server creates PayPal Orders v2 with bid ID, amount and currency derived from database records and platform rules.
- The return page asks the server to capture/retrieve the order. The order and completed capture must match its persisted bid ID, total and currency before a transaction marks the bid paid, records revenue and recomputes leaderboard totals.
- PayPal webhook transmissions are verified using `PAYPAL_WEBHOOK_ID` with PayPal's verification API. Events are idempotent; completed capture events trigger a fresh PayPal order lookup, and refunds remove bids from rankings only after PayPal reports completion.
- Admins retain listing moderation, bid/payment review, full PayPal refunds and revenue exports.

## Configuration and launch checks

Configure `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT` (`sandbox` or `live`) and `PAYPAL_WEBHOOK_ID` in the relevant Netlify deploy context. Register `https://YOUR_DOMAIN/api/paypal-webhook` in the matching PayPal app and subscribe to `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.CAPTURE.REFUNDED`. Ensure Netlify Identity and Database are active and deploy the migration before checkout testing.

No production deployment or real payment was performed from this code task. Verify Sandbox order creation/capture, mismatched and unsigned event rejection, webhook retries, refund behavior, and live leaderboard updates before switching to production credentials.
