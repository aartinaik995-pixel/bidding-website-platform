ALTER TABLE "bids" DROP CONSTRAINT IF EXISTS "bids_stripe_session_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "bids_stripe_session_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "bids_payment_intent_idx";
--> statement-breakpoint
ALTER TABLE "bids" DROP COLUMN IF EXISTS "stripe_session_id";
--> statement-breakpoint
ALTER TABLE "bids" DROP COLUMN IF EXISTS "stripe_payment_intent_id";
--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN "paypal_order_id" text;
--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN "paypal_capture_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "bids_paypal_order_idx" ON "bids" ("paypal_order_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "bids_paypal_capture_idx" ON "bids" ("paypal_capture_id");
--> statement-breakpoint
DROP TABLE IF EXISTS "stripe_events";
--> statement-breakpoint
CREATE TABLE "paypal_events" (
  "id" text PRIMARY KEY,
  "type" text NOT NULL,
  "processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
