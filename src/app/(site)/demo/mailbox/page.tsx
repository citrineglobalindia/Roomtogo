import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationOutbox } from "@/db/schema";
import { processOutbox } from "@/domain/notifications";
import { isDemoMode } from "@/lib/config";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "DEMO mailbox", robots: { index: false, follow: false } };

/** Development-only view of captured (undelivered) emails. 404 outside demo mode. */
export default async function Mailbox({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  if (!isDemoMode()) notFound();
  await processOutbox(50);
  const { to } = await searchParams;
  const rows = await db.select().from(notificationOutbox).where(to ? eq(notificationOutbox.toAddress, to.toLowerCase()) : undefined).orderBy(desc(notificationOutbox.createdAt)).limit(30);
  return (
    <div className="container-site py-10">
      <h1 className="text-[36px]">DEMO mailbox</h1>
      <p className="text-sm text-muted">Captured messages — NOT delivered. Exists only in demo mode so you can follow verification, access-code and confirmation emails.</p>
      <form className="my-4 flex gap-2"><input name="to" defaultValue={to} placeholder="filter by recipient" className="field max-w-xs" /><button className="btn-outline btn-sm">Filter</button></form>
      <ul className="space-y-4">
        {rows.map((m) => (
          <li key={m.id} className="card p-4" data-testid="demo-mail">
            <p className="text-xs text-muted">{formatDateTime(m.createdAt)} · to {m.toAddress} · {m.status}</p>
            <p className="font-medium">{m.subject}</p>
            <pre className="mt-2 whitespace-pre-wrap text-xs text-ink/80">{m.text}</pre>
          </li>
        ))}
      </ul>
    </div>
  );
}
