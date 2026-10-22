CREATE TABLE "warden_device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "warden_device_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "warden_device_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_code_id" text NOT NULL,
	"device_name" text NOT NULL,
	"poll_secret_hash" text NOT NULL,
	"redeemed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "warden_device_request_device_code_id_unique" UNIQUE("device_code_id")
);
--> statement-breakpoint
CREATE TABLE "warden_join_ticket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_hash" text NOT NULL,
	"device_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"nonce" text NOT NULL,
	"username" text NOT NULL,
	"link" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	CONSTRAINT "warden_join_ticket_ticket_hash_unique" UNIQUE("ticket_hash")
);
--> statement-breakpoint
CREATE TABLE "warden_presence" (
	"device_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "warden_session" ADD COLUMN "device_id" uuid;--> statement-breakpoint
ALTER TABLE "warden_device" ADD CONSTRAINT "warden_device_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_device_request" ADD CONSTRAINT "warden_device_request_device_code_id_device_code_id_fk" FOREIGN KEY ("device_code_id") REFERENCES "public"."device_code"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_join_ticket" ADD CONSTRAINT "warden_join_ticket_device_id_warden_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."warden_device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_join_ticket" ADD CONSTRAINT "warden_join_ticket_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_presence" ADD CONSTRAINT "warden_presence_device_id_warden_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."warden_device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_presence" ADD CONSTRAINT "warden_presence_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "warden_device_user_id_idx" ON "warden_device" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "warden_join_ticket_expires_at_idx" ON "warden_join_ticket" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "warden_session" ADD CONSTRAINT "warden_session_device_id_warden_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."warden_device"("id") ON DELETE set null ON UPDATE no action;