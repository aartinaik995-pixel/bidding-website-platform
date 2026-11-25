## PayPal Checkout replacement

Stripe has been removed from the bidding and refund implementation. Orders are created server-side with bid metadata and amount; the bidder is redirected to PayPal for approval, and the return flow captures the order through the PayPal API. Only a completed order whose custom/reference bid ID, amount, and currency match the database bid is counted. Webhooks are independently verified through PayPal's verification API and deduplicated in the database. Existing listings remain immediately available; admin listing management and moderation remain protected.

Environment: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT=sandbox|live`, plus `PAYPAL_WEBHOOK_ID` for signed webhook verification. Configure the provider's webhook endpoint as `https://<site-domain>/api/paypal-webhook` for capture-completed and capture-refunded events.

Deploy the database migration and configure Netlify variables and PayPal app/webhook settings before enabling real transactions. Do not treat redirect return as payment proof.
