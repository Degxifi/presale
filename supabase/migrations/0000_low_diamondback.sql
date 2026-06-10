CREATE TABLE "contributions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contributions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"wallet" text NOT NULL,
	"tier" smallint NOT NULL,
	"amount_usdc" numeric(20, 6) NOT NULL,
	"tx_sig" text NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contributions_tx_sig_unique" UNIQUE("tx_sig"),
	CONSTRAINT "contributions_tier_valid" CHECK ("contributions"."tier" in (1, 2, 3)),
	CONSTRAINT "contributions_amount_positive" CHECK ("contributions"."amount_usdc" > 0),
	CONSTRAINT "contributions_status_valid" CHECK ("contributions"."status" in ('pending', 'confirmed'))
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"wallet" text PRIMARY KEY NOT NULL,
	"referral_code" text,
	"referred_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_referred_by_participants_wallet_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."participants"("wallet") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contributions_wallet_idx" ON "contributions" USING btree ("wallet");--> statement-breakpoint
CREATE INDEX "contributions_tier_idx" ON "contributions" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "contributions_created_idx" ON "contributions" USING btree ("created_at" DESC NULLS LAST);