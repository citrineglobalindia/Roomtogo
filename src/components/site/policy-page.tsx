import { PageHero, Notice } from "@/components/site/sections";
import { publishedPolicy } from "@/domain/content";
import { formatDateTime } from "@/lib/dates";

export async function PolicyPage({ kind, fallbackTitle }: { kind: "privacy" | "terms" | "cancellation" | "house_rules"; fallbackTitle: string }) {
  const p = await publishedPolicy(kind);
  return (
    <>
      <PageHero title={p?.title ?? fallbackTitle} subtitle={p ? `Version ${p.version} · published ${formatDateTime(p.publishedAt)}` : undefined} />
      <section className="container-site max-w-3xl py-12">
        {!p ? (
          <Notice tone="info">This policy is being finalised by Room2Go. Please contact us for details.</Notice>
        ) : (
          <>
            {(p.isSample || !p.approved) && (
              <div className="mb-6">
                <Notice tone="warn">This is a SAMPLE placeholder that has not been approved by Room2Go. It is visible only in demo mode.</Notice>
              </div>
            )}
            <div className="prose-r2g whitespace-pre-line text-ink/85">{p.body}</div>
          </>
        )}
      </section>
    </>
  );
}
