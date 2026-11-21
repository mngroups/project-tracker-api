CREATE TABLE "examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"note" varchar(500) DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "examples_status_check" CHECK ("examples"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE INDEX "examples_created_at_idx" ON "examples" USING btree ("created_at" DESC NULLS LAST);