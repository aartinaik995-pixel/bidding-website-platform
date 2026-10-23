CREATE TABLE "bids" (
	"id" serial PRIMARY KEY,
	"listing_id" integer NOT NULL,
	"bidder_id" text NOT NULL,
	"bidder_name" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"fee_cents" integer NOT NULL,
	"total_charge_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	CONSTRAINT "bids_status_check" CHECK ("status" in ('pending', 'paid', 'failed', 'refunded')),
	CONSTRAINT "bids_amount_check" CHECK ("amount_cents" > 0 and "fee_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" serial PRIMARY KEY,
	"slug" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"owner_id" text NOT NULL,
	"owner_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"highest_bid_cents" integer DEFAULT 0 NOT NULL,
	"bid_count" integer DEFAULT 0 NOT NULL,
	"last_bid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "listings_status_check" CHECK ("status" in ('pending', 'approved', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "platform_ledger" (
	"id" serial PRIMARY KEY,
	"bid_id" integer NOT NULL,
	"kind" text NOT NULL,
	"gross_cents" integer NOT NULL,
	"fee_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_ledger_kind_check" CHECK ("kind" in ('fee', 'refund'))
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bids_stripe_session_idx" ON "bids" ("stripe_session_id");--> statement-breakpoint
CREATE INDEX "bids_payment_intent_idx" ON "bids" ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "bids_listing_status_idx" ON "bids" ("listing_id","status");--> statement-breakpoint
CREATE INDEX "bids_bidder_idx" ON "bids" ("bidder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listings_slug_idx" ON "listings" ("slug");--> statement-breakpoint
CREATE INDEX "listings_status_total_idx" ON "listings" ("status","total_cents");--> statement-breakpoint
CREATE INDEX "listings_owner_idx" ON "listings" ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_ledger_bid_kind_idx" ON "platform_ledger" ("bid_id","kind");--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_listing_id_listings_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id");--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_bidder_id_users_id_fkey" FOREIGN KEY ("bidder_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "platform_ledger" ADD CONSTRAINT "platform_ledger_bid_id_bids_id_fkey" FOREIGN KEY ("bid_id") REFERENCES "bids"("id");