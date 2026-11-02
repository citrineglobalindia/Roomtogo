import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ProfileForm, SignOutButton } from "@/components/site/account-client";
import { Notice } from "@/components/site/sections";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { linkVerifiedBookings } from "@/domain/booking";
import { getSettings } from "@/domain/settings";
import { formatDate, todayInTz } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { getSession } from "@/lib/staff";

export const metadata: Metadata = { title: "Your account — Room2Go", robots: { index: false, follow: false } };

export default async function Account() {
  const session = await getSession();
  if (!session) redirect("/account/login");
  if (session.user.emailVerified) await linkVerifiedBookings(session.user.id);
  const s = await getSettings();
  const today = todayInTz(s.timezone);
  // Strictly scoped to the signed-in user's id.
  const rows = await db.select().from(bookings).where(eq(bookings.userId, session.user.id)).orderBy(desc(bookings.checkIn));
  const visible = rows.filter((b) => b.status !== "expired");
  const upcoming = visible.filter((b) => b.checkOut >= today && b.status !== "cancelled");
  const past = visible.filter((b) => !upcoming.includes(b));
  const renderList = (items: typeof rows) => (
    <ul className="divide-y divide-sand">
      {items.map((b) => (
        <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <span>
            <span className="font-medium">{formatDate(b.checkIn)} → {formatDate(b.checkOut)}</span>
            <span className="block text-xs capitalize text-muted">{b.reference} · {b.status.replace("_", " ")} · {b.paymentStatus.replace("_", " ")} · {formatINR(b.totalPaise)}</span>
          </span>
          <Link href={`/manage-booking/${b.reference}`} className="btn-outline btn-sm">View</Link>
        </li>
      ))}
      {items.length === 0 && <li className="py-3 text-sm text-muted">None.</li>}
    </ul>
  );
  return (
    <div className="container-site max-w-3xl py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-[40px]">Your account</h1>
        <SignOutButton />
      </div>
      <p className="text-muted">{session.user.email}</p>
      {!session.user.emailVerified && <div className="mt-4"><Notice tone="warn">Please verify your email to see bookings made with this address.</Notice></div>}
      <section className="card mt-6 p-6"><h2 className="mb-3 text-2xl">Profile</h2><ProfileForm name={session.user.name} /></section>
      <section className="card mt-6 p-6"><h2 className="text-2xl">Upcoming stays</h2>{renderList(upcoming)}</section>
      <section className="card mt-6 p-6"><h2 className="text-2xl">Past &amp; cancelled</h2>{renderList(past)}</section>
      <p className="mt-6 text-xs text-muted">Bookings appear here when they were made with your verified email address.</p>
    </div>
  );
}
