CREATE TABLE "market_accepted_loop" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signature" text NOT NULL,
	"item_id" text NOT NULL,
	"path" jsonb NOT NULL,
	"value" numeric(20, 6) NOT NULL,
	"cost" numeric(20, 6) NOT NULL,
	"reason" text NOT NULL,
	"accepted_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_accepted_loop" ADD CONSTRAINT "market_accepted_loop_accepted_by_user_id_user_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "market_accepted_loop_signature_uidx" ON "market_accepted_loop" USING btree ("signature");