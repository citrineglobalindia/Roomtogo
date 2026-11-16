CREATE TABLE IF NOT EXISTS "reservation_otps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL,
  "code_hash" text NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "expires_at" timestamptz NOT NULL,
  "verified_at" timestamptz,
  "consumed_booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "client_key" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reservation_otps_email_idx" ON "reservation_otps" ("email", "created_at");
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "reservation_status" text;
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "confirmation_method" text;
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "reservation_otps" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.reservation_otps FROM anon, authenticated;
  END IF;
END $$;
