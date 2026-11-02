import type { Metadata } from "next";
import { ReviewForm } from "@/components/site/forms";
import { PageHero } from "@/components/site/sections";

export const metadata: Metadata = { title: "Share your experience — Room2Go", robots: { index: false } };

export default async function SubmitReview({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  return (
    <>
      <PageHero eyebrow="Reviews" title="Share your experience." subtitle="Reviews are read by our team and published only with your consent after moderation." />
      <section className="container-site max-w-2xl py-12">
        <ReviewForm invite={invite} />
      </section>
    </>
  );
}
