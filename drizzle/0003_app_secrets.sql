CREATE TABLE IF NOT EXISTS "app_secrets" (
  "key" text PRIMARY KEY,
  "value" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "app_secrets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.app_secrets FROM anon, authenticated;
  END IF;
END $$;
