CREATE TABLE "minecraft_server_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "minecraft_server_event_topic_id_idx" ON "minecraft_server_event" USING btree ("topic","id");--> statement-breakpoint
CREATE INDEX "minecraft_server_event_created_at_idx" ON "minecraft_server_event" USING btree ("created_at");