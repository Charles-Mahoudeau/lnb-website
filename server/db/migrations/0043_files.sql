CREATE TABLE "stored_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sha256" text NOT NULL,
	"sha512" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"size" bigint NOT NULL,
	"uploaded_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stored_file_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stored_file_kind_created_at_idx" ON "stored_file" USING btree ("kind","created_at");