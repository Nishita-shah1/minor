CREATE TABLE "share_openpgp_envelopes" (
	"share_id" uuid PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"armored_public_key" text NOT NULL,
	"armored_message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "share_openpgp_envelopes" ADD CONSTRAINT "share_openpgp_envelopes_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;