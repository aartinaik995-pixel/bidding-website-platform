CREATE TABLE "user_rate_limits" (
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "user_rate_limits_count_check" CHECK ("request_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_rate_limits_user_action_idx" ON "user_rate_limits" ("user_id","action");--> statement-breakpoint
ALTER TABLE "user_rate_limits" ADD CONSTRAINT "user_rate_limits_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");
--> statement-breakpoint
UPDATE "listings" SET "status" = 'approved' WHERE "status" = 'pending';