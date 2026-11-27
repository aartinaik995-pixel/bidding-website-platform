DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "bids"
    WHERE "stripe_session_id" IS NOT NULL OR "stripe_payment_intent_id" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Stripe payment references exist on bids. Export and resolve them before running this migration.';
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "bids_stripe_session_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "bids_payment_intent_idx";
--> statement-breakpoint
ALTER TABLE "bids" DROP COLUMN IF EXISTS "stripe_session_id";
--> statement-breakpoint
ALTER TABLE "bids" DROP COLUMN IF EXISTS "stripe_payment_intent_id";
--> statement-breakpoint
DROP TABLE IF EXISTS "stripe_events";
