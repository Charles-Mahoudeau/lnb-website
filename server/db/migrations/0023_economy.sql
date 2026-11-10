CREATE TABLE "economy_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"owner_user_id" text,
	"handle" text,
	"name" text,
	"balance" bigint DEFAULT 0 NOT NULL,
	"frozen_at" timestamp,
	"frozen_reason" text,
	"frozen_by_user_id" text,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "economy_account_balance_non_negative" CHECK ("economy_account"."balance" >= 0),
	CONSTRAINT "economy_account_kind_fields" CHECK (("economy_account"."kind" = 'personal' and "economy_account"."handle" is null) or ("economy_account"."kind" = 'shared' and "economy_account"."handle" is not null and "economy_account"."owner_user_id" is null))
);
--> statement-breakpoint
CREATE TABLE "economy_daily_stat" (
	"day" date PRIMARY KEY NOT NULL,
	"minted" bigint NOT NULL,
	"burned" bigint NOT NULL,
	"supply" bigint NOT NULL,
	"volume" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economy_entry" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"transaction_id" bigint NOT NULL,
	"account_id" uuid,
	"amount" bigint NOT NULL,
	"balance_after" bigint,
	CONSTRAINT "economy_entry_amount_not_zero" CHECK ("economy_entry"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "economy_invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"invited_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economy_member" (
	"account_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "economy_member_account_id_user_id_pk" PRIMARY KEY("account_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "economy_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"default_account_id" uuid,
	"hide_from_baltop" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economy_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"starting_balance" integer DEFAULT 0 NOT NULL,
	"max_owned_shared" smallint DEFAULT 3 NOT NULL,
	"max_members" smallint DEFAULT 20 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_user_id" text,
	CONSTRAINT "economy_settings_single_row" CHECK ("economy_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "economy_transaction" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"reason" text,
	"memo" text,
	"idempotency_key" uuid,
	"fingerprint" text,
	"source" text NOT NULL,
	"actor_user_id" text,
	"actor_minecraft_uuid" uuid,
	"reverses_id" bigint,
	CONSTRAINT "economy_transaction_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "economy_transaction_reverses_id_unique" UNIQUE("reverses_id")
);
--> statement-breakpoint
ALTER TABLE "economy_account" ADD CONSTRAINT "economy_account_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_account" ADD CONSTRAINT "economy_account_frozen_by_user_id_user_id_fk" FOREIGN KEY ("frozen_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_entry" ADD CONSTRAINT "economy_entry_transaction_id_economy_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."economy_transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_entry" ADD CONSTRAINT "economy_entry_account_id_economy_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."economy_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_invitation" ADD CONSTRAINT "economy_invitation_account_id_economy_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."economy_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_invitation" ADD CONSTRAINT "economy_invitation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_invitation" ADD CONSTRAINT "economy_invitation_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_member" ADD CONSTRAINT "economy_member_account_id_economy_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."economy_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_member" ADD CONSTRAINT "economy_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_profile" ADD CONSTRAINT "economy_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_profile" ADD CONSTRAINT "economy_profile_default_account_id_economy_account_id_fk" FOREIGN KEY ("default_account_id") REFERENCES "public"."economy_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_settings" ADD CONSTRAINT "economy_settings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_transaction" ADD CONSTRAINT "economy_transaction_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_transaction" ADD CONSTRAINT "economy_transaction_reverses_id_economy_transaction_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."economy_transaction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "economy_account_owner_uidx" ON "economy_account" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "economy_account_handle_uidx" ON "economy_account" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "economy_account_balance_idx" ON "economy_account" USING btree ("balance");--> statement-breakpoint
CREATE INDEX "economy_entry_account_idx" ON "economy_entry" USING btree ("account_id","transaction_id");--> statement-breakpoint
CREATE INDEX "economy_entry_transaction_idx" ON "economy_entry" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "economy_invitation_account_user_uidx" ON "economy_invitation" USING btree ("account_id","user_id");--> statement-breakpoint
CREATE INDEX "economy_invitation_user_id_idx" ON "economy_invitation" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "economy_member_user_id_idx" ON "economy_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "economy_transaction_at_idx" ON "economy_transaction" USING btree ("at");--> statement-breakpoint
CREATE INDEX "economy_transaction_kind_idx" ON "economy_transaction" USING btree ("kind","id");--> statement-breakpoint
-- The settings live in one row, created here so the service never has to.
INSERT INTO "economy_settings" ("id") VALUES (1);
