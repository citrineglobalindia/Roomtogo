import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { AdminNav, type NavItem } from "@/components/admin/sidebar";
import { SignOutButton } from "@/components/site/account-client";
import { db } from "@/db";
import { bookingRequests, enquiries, notificationOutbox, paymentExceptions, reviews } from "@/db/schema";
import { isDemoMode } from "@/lib/config";
import { ROLE_LABELS, type Permission } from "@/lib/permissions";
import { requireStaffPage } from "@/lib/staff";

const count = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const st = await requireStaffPage();
  const n = sql<number>`count(*)::int`;
  const [exceptions, newEnquiries, pendingReviews, requests, failedMsgs] = await Promise.all([
    st.can("payments.view") ? count(db.select({ n }).from(paymentExceptions).where(eq(paymentExceptions.status, "open"))) : 0,
    st.can("enquiries.manage") ? count(db.select({ n }).from(enquiries).where(eq(enquiries.status, "new"))) : 0,
    st.can("reviews.moderate") ? count(db.select({ n }).from(reviews).where(eq(reviews.status, "pending"))) : 0,
    st.can("bookings.view") ? count(db.select({ n }).from(bookingRequests).where(eq(bookingRequests.status, "requested"))) : 0,
    st.can("outbox.view") ? count(db.select({ n }).from(notificationOutbox).where(and(sql`${notificationOutbox.status} IN ('failed','blocked_unconfigured')`))) : 0,
  ]);
  const item = (perm: Permission | null, href: string, label: string, badge?: number): NavItem | null => (perm === null || st.can(perm) ? { href, label, badge } : null);
  const groups = [
    { title: "Operations", items: [item(null, "/admin", "Overview"), item("bookings.view", "/admin/reservations", "Reservations", requests), item("calendar.view", "/admin/calendar", "Calendar"), item("bookings.manage", "/admin/reservations/new", "New reservation"), item("enquiries.manage", "/admin/enquiries", "Enquiries", newEnquiries), item("guests.view", "/admin/guests", "Guests")] },
    { title: "Money", items: [item("payments.view", "/admin/payments", "Payments & refunds", exceptions), item("reports.view", "/admin/reports", "Reports")] },
    { title: "Inventory", items: [item("inventory.view", "/admin/rooms", "Rooms & units"), item("availability.manage", "/admin/availability", "Availability & blocks"), item("rates.manage", "/admin/rates", "Rates & rules")] },
    { title: "Website", items: [item("content.manage", "/admin/content", "Page content"), item("content.manage", "/admin/content/policies", "Policies"), item("content.manage", "/admin/content/faqs", "FAQs"), item("content.manage", "/admin/content/amenities", "Amenities"), item("media.manage", "/admin/content/media", "Photos & gallery"), item("reviews.moderate", "/admin/reviews", "Reviews", pendingReviews)] },
    { title: "System", items: [item("settings.manage", "/admin/settings", "Settings & setup"), item("settings.manage", "/admin/settings/integrations", "Integrations"), item("staff.manage", "/admin/staff", "Staff"), item("outbox.view", "/admin/messages", "Messages", failedMsgs), item("audit.view", "/admin/audit", "Audit log")] },
  ]
    .map((g) => ({ ...g, items: g.items.filter(Boolean) as NavItem[] }))
    .filter((g) => g.items.length);
  return (
    <div className="lg:pl-60">
      <AdminNav groups={groups} />
      <header className="sticky top-0 z-30 flex items-center justify-end gap-4 border-b border-sand bg-white/95 px-5 py-2.5 pl-16 text-sm backdrop-blur lg:pl-5">
        {isDemoMode() && <span className="mr-auto rounded bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-700">DEMO MODE — sample data, simulated payments</span>}
        <Link href="/" className="text-muted hover:text-forest-800" target="_blank">View site</Link>
        <Link href="/admin/security" className="text-muted hover:text-forest-800">Security</Link>
        <span className="hidden text-muted sm:inline">{st.name} · {ROLE_LABELS[st.role]}</span>
        <SignOutButton to="/admin/login" />
      </header>
      <main className="px-5 py-6 sm:px-8">{children}</main>
    </div>
  );
}
