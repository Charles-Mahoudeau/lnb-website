CREATE TABLE "short_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"short_id" text NOT NULL,
	"name" text NOT NULL,
	"destination_url" text NOT NULL,
	"access" text DEFAULT 'any' NOT NULL,
	"tenant_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"record_clicks" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "short_link_short_id_unique" UNIQUE("short_id"),
	CONSTRAINT "short_link_access" CHECK ("short_link"."access" in ('any', 'signed', 'schools')),
	CONSTRAINT "short_link_schools" CHECK ("short_link"."access" <> 'schools' or cardinality("short_link"."tenant_ids") > 0),
	CONSTRAINT "short_link_record" CHECK (not "short_link"."record_clicks" or "short_link"."access" <> 'any')
);
--> statement-breakpoint
CREATE TABLE "short_link_click" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"link_id" uuid NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL,
	"outcome" text DEFAULT 'opened' NOT NULL,
	"signed_in" boolean DEFAULT false NOT NULL,
	"user_id" text,
	"tenant_id" text
);
--> statement-breakpoint
ALTER TABLE "short_link" ADD CONSTRAINT "short_link_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_link_click" ADD CONSTRAINT "short_link_click_link_id_short_link_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."short_link"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_link_click" ADD CONSTRAINT "short_link_click_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "short_link_click_link_idx" ON "short_link_click" USING btree ("link_id","at");--> statement-breakpoint
CREATE INDEX "short_link_click_user_idx" ON "short_link_click" USING btree ("user_id");