import type { Metadata } from "next";
import { AccessCodeFlow } from "@/components/site/manage-client";
import { Notice, PageHero } from "@/components/site/sections";

export const metadata: Metadata = { title: "Manage your booking — Room2Go", robots: { index: false } };

export default async function Manage({ searchParams }: { searchParams: Promise<{ invalid?: string; ref?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <PageHero title="Manage your booking" subtitle="Use the link in your confirmation email, or verify with your booking reference and a one-time code." />
      <section className="container-site max-w-md py-12">
        {sp.invalid && (
          <div className="mb-4">
            <Notice tone="error">That link is invalid or has expired. Request an access code below.</Notice>
          </div>
        )}
        <div className="card p-6">
          <AccessCodeFlow initialRef={sp.ref} />
        </div>
      </section>
    </>
  );
}
