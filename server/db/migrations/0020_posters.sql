CREATE TABLE "poster" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"event_id" uuid,
	"template" text NOT NULL,
	"treatment" text,
	"locale" text DEFAULT 'fr' NOT NULL,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content" jsonb NOT NULL,
	"treated_key" text,
	"short_link_id" uuid,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "poster_template" CHECK ("poster"."template" in ('banner', 'artTitle', 'ticket', 'labels', 'collage', 'badge')),
	CONSTRAINT "poster_treatment" CHECK ("poster"."treatment" is null or ("poster"."template" = 'artTitle' and "poster"."treatment" in ('duotone', 'darkMedium', 'darkStrong'))),
	CONSTRAINT "poster_locale" CHECK ("poster"."locale" in ('fr', 'en'))
);
--> statement-breakpoint
ALTER TABLE "poster" ADD CONSTRAINT "poster_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster" ADD CONSTRAINT "poster_short_link_id_short_link_id_fk" FOREIGN KEY ("short_link_id") REFERENCES "public"."short_link"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster" ADD CONSTRAINT "poster_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster" ADD CONSTRAINT "poster_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "poster_event_id_idx" ON "poster" USING btree ("event_id");