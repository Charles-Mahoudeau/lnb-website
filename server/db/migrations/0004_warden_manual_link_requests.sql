ALTER TABLE "warden_link_request" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "warden_link_request" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "warden_link_request" ADD CONSTRAINT "warden_link_request_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "warden_link_request_created_by_idx" ON "warden_link_request" USING btree ("created_at") WHERE "warden_link_request"."created_by_user_id" is not null;