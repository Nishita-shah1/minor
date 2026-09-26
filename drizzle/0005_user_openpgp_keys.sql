CREATE TABLE "user_openpgp_keys" (
	"clerk_user_id" text PRIMARY KEY NOT NULL,
	"armored_public_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
