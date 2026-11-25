# BidMySite roadmap

BidMySite is a public website leaderboard. Users submit websites and place paid bids; only server-verified PayPal captures count toward rankings. The platform applies a transparent 10% fee.

## Product

- Public homepage, leaderboard, website detail/history, submission, account dashboard, and admin management.
- Netlify Identity sign-in and protected account functions.
- New listings publish immediately. Admins retain moderation controls to remove and restore listings; no routine approval queue is used.
- Database-backed listing and bid persistence, transaction ledger, and server-side rate limits.

## PayPal

- Server creates PayPal Orders v2. Bid ID, amount, fee, and currency are derived on the server.
- On PayPal return, server-side capture/retrieval verifies completed state, expected bid reference, total capture amount, and currency before marking the bid paid and recomputing leaderboard totals.
- PayPal webhook signatures are checked through PayPal using `PAYPAL_WEBHOOK_ID`; events are persisted for retry idempotency. Refunds are reflected only after PayPal confirmation.
- Admins manage listings, payments, refunds, and revenue reports.

## Required deployment configuration

Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT=sandbox|live`, and `PAYPAL_WEBHOOK_ID` in Netlify. Register `https://YOUR_DOMAIN/api/paypal-webhook` in the corresponding PayPal environment for completed capture and refunded capture events. Provision Netlify Database and Identity and confirm migrations have run.

No live deployment or actual Sandbox/Live payment was performed by this repository change. Test Sandbox order creation/capture, negative amount/currency/ID verification, webhook signature and retry behavior, refund processing, and leaderboard refresh before production use.
