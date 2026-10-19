CREATE TABLE "push_notification" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"event_id" uuid,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"send_at" timestamp DEFAULT now() NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp,
	"dedupe_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_notification_kind_check" CHECK ("push_notification"."kind" IN ('newEvent', 'reminder', 'spot', 'cancelled', 'rescheduled')),
	CONSTRAINT "push_notification_status_check" CHECK ("push_notification"."status" IN ('pending', 'sent', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "push_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"new_events" boolean DEFAULT true NOT NULL,
	"reminders" boolean DEFAULT true NOT NULL,
	"spots" boolean DEFAULT true NOT NULL,
	"changes" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_setting" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"weekly_cap" smallint DEFAULT 3 NOT NULL,
	"silence_days" integer DEFAULT 30,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_setting_single_row" CHECK ("push_setting"."id" = 1),
	CONSTRAINT "push_setting_cap_check" CHECK ("push_setting"."weekly_cap" BETWEEN 1 AND 50),
	CONSTRAINT "push_setting_silence_check" CHECK ("push_setting"."silence_days" IS NULL OR "push_setting"."silence_days" IN (7, 30))
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"device" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_success_at" timestamp,
	CONSTRAINT "push_subscription_locale_check" CHECK ("push_subscription"."locale" IN ('en', 'fr'))
);
--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "reminder_offsets" integer[] DEFAULT '{60}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "announced_at" timestamp;--> statement-breakpoint
ALTER TABLE "push_notification" ADD CONSTRAINT "push_notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_notification" ADD CONSTRAINT "push_notification_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_preference" ADD CONSTRAINT "push_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_notification_dedupe_key_uidx" ON "push_notification" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "push_notification_due_idx" ON "push_notification" USING btree ("send_at") WHERE "push_notification"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "push_notification_user_id_sent_at_idx" ON "push_notification" USING btree ("user_id","sent_at");--> statement-breakpoint
CREATE INDEX "push_notification_event_id_idx" ON "push_notification" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscription_endpoint_uidx" ON "push_subscription" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscription_user_id_idx" ON "push_subscription" USING btree ("user_id");