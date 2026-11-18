CREATE TABLE IF NOT EXISTS "data_patches" (
  "key" text PRIMARY KEY,
  "applied_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "data_patches" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.data_patches FROM anon, authenticated;
  END IF;
END $$;
