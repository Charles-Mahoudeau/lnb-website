ALTER TABLE "push_notification" DROP CONSTRAINT "push_notification_kind_check";--> statement-breakpoint
ALTER TABLE "partner_event" ADD COLUMN "announced_at" timestamp;--> statement-breakpoint
ALTER TABLE "push_notification" ADD COLUMN "partner_event_id" uuid;--> statement-breakpoint
ALTER TABLE "push_preference" ADD COLUMN "partner_events" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "push_notification" ADD CONSTRAINT "push_notification_partner_event_id_partner_event_id_fk" FOREIGN KEY ("partner_event_id") REFERENCES "public"."partner_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_notification_partner_event_id_idx" ON "push_notification" USING btree ("partner_event_id");--> statement-breakpoint
ALTER TABLE "push_notification" ADD CONSTRAINT "push_notification_kind_check" CHECK ("push_notification"."kind" IN ('newEvent', 'reminder', 'spot', 'cancelled', 'rescheduled', 'team', 'partnerEvent', 'partnerTeam'));