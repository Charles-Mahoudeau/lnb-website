CREATE TABLE "feed_like" (
	"post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feed_like_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "feed_member" (
	"user_id" text PRIMARY KEY NOT NULL,
	"posting_minecraft_uuid" uuid,
	"announcements_seen_at" timestamp (3),
	"global_seen_at" timestamp (3),
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"post_id" uuid NOT NULL,
	"recipient_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feed_notification_kind_check" CHECK ("feed_notification"."kind" in ('announcement', 'reply'))
);
--> statement-breakpoint
CREATE TABLE "feed_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feed" text NOT NULL,
	"thread_id" uuid,
	"reply_to_id" uuid,
	"reply_to_user_id" text,
	"reply_to_anonymous" boolean DEFAULT false NOT NULL,
	"reply_to_minecraft_username" text,
	"author_user_id" text NOT NULL,
	"minecraft_uuid" uuid NOT NULL,
	"minecraft_username" text NOT NULL,
	"source" text NOT NULL,
	"text" text NOT NULL,
	"anonymous" boolean DEFAULT false NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"pinned_at" timestamp (3),
	"pinned_by_user_id" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3),
	"deleted_by_user_id" text,
	"deleted_cause" text,
	"deleted_reason" text,
	"idempotency_key" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	CONSTRAINT "feed_post_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "feed_post_text_length" CHECK (char_length("feed_post"."text") between 1 and 280),
	CONSTRAINT "feed_post_feed_check" CHECK ("feed_post"."feed" in ('announcements', 'global')),
	CONSTRAINT "feed_post_source_check" CHECK ("feed_post"."source" in ('server', 'site')),
	CONSTRAINT "feed_post_pinned_check" CHECK ("feed_post"."pinned_at" is null or ("feed_post"."thread_id" is null and "feed_post"."feed" = 'announcements')),
	CONSTRAINT "feed_post_reply_to_check" CHECK ("feed_post"."reply_to_id" is null or "feed_post"."thread_id" is not null),
	CONSTRAINT "feed_post_deleted_cause_check" CHECK ("feed_post"."deleted_cause" is null or "feed_post"."deleted_cause" in ('author', 'moderator', 'thread'))
);
--> statement-breakpoint
CREATE TABLE "feed_thread_seen" (
	"user_id" text NOT NULL,
	"thread_id" uuid NOT NULL,
	"seen_at" timestamp (3) NOT NULL,
	CONSTRAINT "feed_thread_seen_user_id_thread_id_pk" PRIMARY KEY("user_id","thread_id")
);
--> statement-breakpoint
ALTER TABLE "feed_like" ADD CONSTRAINT "feed_like_post_id_feed_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."feed_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_like" ADD CONSTRAINT "feed_like_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_member" ADD CONSTRAINT "feed_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_member" ADD CONSTRAINT "feed_member_posting_minecraft_uuid_minecraft_account_uuid_fk" FOREIGN KEY ("posting_minecraft_uuid") REFERENCES "public"."minecraft_account"("uuid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_notification" ADD CONSTRAINT "feed_notification_post_id_feed_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."feed_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_notification" ADD CONSTRAINT "feed_notification_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post" ADD CONSTRAINT "feed_post_thread_id_feed_post_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."feed_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post" ADD CONSTRAINT "feed_post_reply_to_id_feed_post_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."feed_post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post" ADD CONSTRAINT "feed_post_reply_to_user_id_user_id_fk" FOREIGN KEY ("reply_to_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post" ADD CONSTRAINT "feed_post_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post" ADD CONSTRAINT "feed_post_pinned_by_user_id_user_id_fk" FOREIGN KEY ("pinned_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post" ADD CONSTRAINT "feed_post_deleted_by_user_id_user_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_thread_seen" ADD CONSTRAINT "feed_thread_seen_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_thread_seen" ADD CONSTRAINT "feed_thread_seen_thread_id_feed_post_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."feed_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feed_like_user_idx" ON "feed_like" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feed_member_posting_idx" ON "feed_member" USING btree ("posting_minecraft_uuid");--> statement-breakpoint
CREATE INDEX "feed_notification_created_at_idx" ON "feed_notification" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feed_notification_post_idx" ON "feed_notification" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "feed_notification_recipient_idx" ON "feed_notification" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "feed_post_feed_idx" ON "feed_post" USING btree ("feed","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "feed_post"."thread_id" is null and "feed_post"."deleted_at" is null and "feed_post"."pinned_at" is null;--> statement-breakpoint
CREATE INDEX "feed_post_thread_idx" ON "feed_post" USING btree ("thread_id","created_at","id");--> statement-breakpoint
CREATE INDEX "feed_post_pinned_idx" ON "feed_post" USING btree ("pinned_at") WHERE "feed_post"."pinned_at" is not null;--> statement-breakpoint
CREATE INDEX "feed_post_author_idx" ON "feed_post" USING btree ("author_user_id","created_at");--> statement-breakpoint
CREATE INDEX "feed_post_reply_to_user_idx" ON "feed_post" USING btree ("reply_to_user_id","thread_id");--> statement-breakpoint
CREATE INDEX "feed_post_reply_to_idx" ON "feed_post" USING btree ("reply_to_id");--> statement-breakpoint
CREATE INDEX "feed_post_pinned_by_idx" ON "feed_post" USING btree ("pinned_by_user_id");--> statement-breakpoint
CREATE INDEX "feed_post_deleted_by_idx" ON "feed_post" USING btree ("deleted_by_user_id");--> statement-breakpoint
CREATE INDEX "feed_post_deleted_idx" ON "feed_post" USING btree ("deleted_at") WHERE "feed_post"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "feed_thread_seen_thread_idx" ON "feed_thread_seen" USING btree ("thread_id");--> statement-breakpoint
INSERT INTO "feature_flag" ("key", "enabled") VALUES ('feed', false) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "feature_flag" ("key", "enabled") VALUES ('feed.live', false) ON CONFLICT DO NOTHING;
