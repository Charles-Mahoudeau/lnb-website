CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"room_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"schools" text[] NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"capacity" integer,
	"registration_opens_at" timestamp,
	"registration_closes_at" timestamp,
	"price" smallint,
	"hidden" boolean DEFAULT true NOT NULL,
	"cancelled_at" timestamp,
	"banner_key" text,
	"banner_focus_x" real DEFAULT 0.5 NOT NULL,
	"banner_focus_y" real DEFAULT 0.5 NOT NULL,
	"embed_key" text,
	"embed_focus_x" real DEFAULT 0.5 NOT NULL,
	"embed_focus_y" real DEFAULT 0.5 NOT NULL,
	"banner_crop_key" text,
	"thumb_crop_key" text,
	"embed_crop_key" text,
	"bde_sync" boolean DEFAULT false NOT NULL,
	"bde_status" text,
	"bde_attempts" smallint DEFAULT 0 NOT NULL,
	"bde_next_attempt_at" timestamp,
	"bde_last_error" jsonb,
	"bde_page_url" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "event_ends_after_start" CHECK ("event"."ends_at" > "event"."starts_at"),
	CONSTRAINT "event_schools_not_empty" CHECK (cardinality("event"."schools") > 0),
	CONSTRAINT "event_capacity_positive" CHECK ("event"."capacity" IS NULL OR "event"."capacity" > 0),
	CONSTRAINT "event_price_not_negative" CHECK ("event"."price" IS NULL OR "event"."price" >= 0),
	CONSTRAINT "event_bde_status_check" CHECK ("event"."bde_status" IS NULL OR "event"."bde_status" IN ('synced', 'pending', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "event_registration" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"added_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "event_registration_status_check" CHECK ("event_registration"."status" IN ('registered', 'waitlist'))
);
--> statement-breakpoint
CREATE TABLE "event_room" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"details" text,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_fr" text NOT NULL,
	"icon" text NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_room_id_event_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."event_room"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_type_id_event_type_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."event_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registration" ADD CONSTRAINT "event_registration_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registration" ADD CONSTRAINT "event_registration_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registration" ADD CONSTRAINT "event_registration_added_by_user_id_user_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_starts_at_idx" ON "event" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "event_bde_next_attempt_at_idx" ON "event" USING btree ("bde_next_attempt_at") WHERE "event"."bde_status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "event_registration_event_id_user_id_uidx" ON "event_registration" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "event_registration_event_id_status_idx" ON "event_registration" USING btree ("event_id","status","id");--> statement-breakpoint
CREATE INDEX "event_registration_user_id_idx" ON "event_registration" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_room_name_uidx" ON "event_room" USING btree (lower("name")) WHERE "event_room"."archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_type_name_en_uidx" ON "event_type" USING btree (lower("name_en")) WHERE "event_type"."archived_at" IS NULL;