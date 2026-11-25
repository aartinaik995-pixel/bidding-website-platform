ALTER TABLE "bids" RENAME COLUMN "stripe_session_id" TO "paypal_order_id";--> statement-breakpoint
ALTER TABLE "bids" RENAME COLUMN "stripe_payment_intent_id" TO "paypal_capture_id";--> statement-breakpoint
DROP INDEX "bids_stripe_session_idx";--> statement-breakpoint
DROP INDEX "bids_payment_intent_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "bids_paypal_order_idx" ON "bids" ("paypal_order_id");--> statement-breakpoint
CREATE INDEX "bids_paypal_capture_idx" ON "bids" ("paypal_capture_id");--> statement-breakpoint
DROP TABLE "stripe_events";--> statement-breakpoint
CREATE TABLE "paypal_events" (
	"id" text PRIMARY KEY,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
