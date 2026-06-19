CREATE TABLE "distributions" (
	"wallet" text PRIMARY KEY NOT NULL,
	"distributed" numeric(40, 0) DEFAULT '0' NOT NULL,
	"inflight_amount" numeric(40, 0),
	"inflight_sig" text,
	"inflight_lvbh" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "distributions_inflight_sig_idx" ON "distributions" USING btree ("inflight_sig");