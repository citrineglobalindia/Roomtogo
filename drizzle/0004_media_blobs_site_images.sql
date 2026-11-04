CREATE TABLE IF NOT EXISTS "media_blobs" (
  "key" text PRIMARY KEY,
  "content_type" text NOT NULL,
  "body" bytea NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_images" (
  "slot" text PRIMARY KEY,
  "media_id" uuid NOT NULL REFERENCES "media_assets"("id") ON DELETE CASCADE,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "gallery_sort_order" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE "media_assets" SET "gallery_sort_order" = "sort_order";
--> statement-breakpoint
ALTER TABLE "media_blobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "site_images" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.media_blobs FROM anon, authenticated;
    REVOKE ALL ON TABLE public.site_images FROM anon, authenticated;
  END IF;
END $$;
