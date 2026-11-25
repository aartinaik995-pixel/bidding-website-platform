CREATE TABLE "paypal_events" (
  "id" text PRIMARY KEY,
  "type" text NOT NULL,
  "processed_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN "paypal_order_id" text;
--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN "paypal_capture_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "bids_paypal_order_idx" ON "bids" ("paypal_order_id");
--> statement-breakpoint
CREATE INDEX "bids_paypal_capture_idx" ON "bids" ("paypal_capture_id");
--> statement-breakpoint
ALTER TABLE "listings" ALTER COLUMN "status" SET DEFAULT 'approved';
--> statement-breakpoint
UPDATE "listings" SET "status" = 'approved' WHERE "status" = 'pending';
