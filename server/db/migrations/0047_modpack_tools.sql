CREATE TABLE "modpack_tool" (
	"tool" text PRIMARY KEY NOT NULL,
	"file_id" uuid NOT NULL,
	"version" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"published_at" timestamp DEFAULT now() NOT NULL,
	"published_by_user_id" text
);
--> statement-breakpoint
ALTER TABLE "modpack_tool" ADD CONSTRAINT "modpack_tool_file_id_stored_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modpack_tool" ADD CONSTRAINT "modpack_tool_published_by_user_id_user_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;