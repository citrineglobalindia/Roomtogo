import { and, eq, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import {
  amenities,
  mediaAssets,
  policyVersions,
  propertySettings,
  roomTypes,
  roomUnits,
  staffMembers,
} from "@/db/schema";
import { emailConfig, isDemoMode, paymentConfig, storageConfig, channelConfig } from "@/lib/config";

export type Settings = typeof propertySettings.$inferSelect;

export async function getSettings(tx: DbOrTx = db): Promise<Settings> {
  const [row] = await tx.select().from(propertySettings).where(eq(propertySettings.id, 1));
  if (!row) throw new Error("Property settings missing — run `npm run db:seed` (or the production bootstrap) first.");
  return row;
}

/** Facts the owner confirms explicitly. Unconfirmed facts are shown with an "unconfirmed" marker in admin. */
export const CONFIRMABLE_FACTS = {
  contact: "Address, phone and email",
  map: "Exact map pin and directions link",
  whatsapp: "WhatsApp destination number",
  times: "Check-in and check-out times",
  payment_rule: "Full / advance payment rule and balance collection",
  tax: "Tax configuration (or confirmation that no tax lines apply)",
  channel_process: "Inventory process with OTAs / other channels verified",
  notifications: "Staff notification recipients",
} as const;
export type ConfirmableFact = keyof typeof CONFIRMABLE_FACTS;

export function isConfirmed(s: Settings, f: ConfirmableFact) {
  return Boolean(s.confirmedFields?.[f]);
}

export type ChecklistItem = { key: string; label: string; done: boolean; detail?: string; blocking: boolean; href: string };

export async function setupChecklist(): Promise<ChecklistItem[]> {
  const s = await getSettings();
  const pay = paymentConfig();
  const mail = emailConfig();
  const store = storageConfig();
  const types = await db.select().from(roomTypes).where(eq(roomTypes.status, "active"));
  const published = types.filter((t) => t.publicStatus === "published");
  const units = await db.select().from(roomUnits).where(eq(roomUnits.status, "active"));
  const policies = await db
    .select()
    .from(policyVersions)
    .where(eq(policyVersions.status, "published"));
  const realPhotos = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.status, "published"), eq(mediaAssets.isSample, false)));
  const unverifiedAmenities = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(amenities)
    .where(and(eq(amenities.verified, false), eq(amenities.status, "published")));
  const owners = await db.select({ n: sql<number>`count(*)::int` }).from(staffMembers).where(eq(staffMembers.role, "owner"));

  const policyOk = (k: "privacy" | "terms" | "cancellation" | "house_rules") =>
    policies.some((p) => p.kind === k && p.approved && !p.isSample);

  const items: ChecklistItem[] = [
    { key: "owner", label: "Owner account created", done: (owners[0]?.n ?? 0) > 0, blocking: true, href: "/admin/staff" },
    { key: "contact", label: CONFIRMABLE_FACTS.contact, done: isConfirmed(s, "contact"), blocking: true, href: "/admin/settings" },
    { key: "map", label: CONFIRMABLE_FACTS.map, done: isConfirmed(s, "map") && !!s.mapLat && !!s.mapLng, blocking: false, href: "/admin/settings" },
    { key: "whatsapp", label: CONFIRMABLE_FACTS.whatsapp, done: isConfirmed(s, "whatsapp") && !!s.whatsappNumber, blocking: false, href: "/admin/settings" },
    { key: "times", label: CONFIRMABLE_FACTS.times, done: isConfirmed(s, "times") && !!s.checkInTime && !!s.checkOutTime, blocking: true, href: "/admin/settings" },
    {
      key: "room_types",
      label: "Room categories confirmed (occupancy, beds, size) and published",
      done: published.length > 0 && published.every((t) => t.factsConfirmed),
      detail: `${published.length} published, ${published.filter((t) => !t.factsConfirmed).length} unconfirmed`,
      blocking: true,
      href: "/admin/rooms",
    },
    {
      key: "units",
      label: "Physical units entered (real identifiers, not sample units)",
      done: published.length > 0 && published.every((t) => units.some((u) => u.roomTypeId === t.id && !u.isSample)),
      detail: `${units.length} active units, ${units.filter((u) => u.isSample).length} sample`,
      blocking: true,
      href: "/admin/rooms",
    },
    {
      key: "rates",
      label: "Approved rates for every published room category",
      done: published.length > 0 && published.every((t) => t.baseRatePaise != null && !t.ratesAreSample),
      detail: published.filter((t) => t.ratesAreSample).length ? "Sample rates present" : undefined,
      blocking: true,
      href: "/admin/rates",
    },
    { key: "policy_cancellation", label: "Cancellation & refund policy approved", done: policyOk("cancellation"), blocking: true, href: "/admin/content/policies" },
    { key: "policy_terms", label: "Booking terms approved", done: policyOk("terms"), blocking: true, href: "/admin/content/policies" },
    { key: "policy_privacy", label: "Privacy policy approved", done: policyOk("privacy"), blocking: true, href: "/admin/content/policies" },
    { key: "policy_house", label: "House rules approved", done: policyOk("house_rules"), blocking: false, href: "/admin/content/policies" },
    { key: "payment_rule", label: CONFIRMABLE_FACTS.payment_rule, done: isConfirmed(s, "payment_rule"), blocking: true, href: "/admin/settings" },
    { key: "tax", label: CONFIRMABLE_FACTS.tax, done: isConfirmed(s, "tax"), blocking: true, href: "/admin/settings" },
    {
      key: "gateway",
      label: "Payment gateway (Room2Go's own merchant account)",
      done: pay.provider === "razorpay",
      detail: pay.provider === "none" ? pay.reason : pay.provider === "demo" ? "DEMO gateway — no real payments" : `Razorpay ${pay.mode}`,
      blocking: true,
      href: "/admin/settings/integrations",
    },
    {
      key: "webhook",
      label: "Payment webhook secret configured",
      done: pay.provider === "razorpay" && !!pay.webhookSecret,
      blocking: true,
      href: "/admin/settings/integrations",
    },
    {
      key: "email",
      label: "Transactional email sender configured",
      done: mail.provider === "smtp",
      detail: mail.provider === "none" ? mail.reason : mail.provider === "demo" ? "DEMO capture — emails are not delivered" : undefined,
      blocking: true,
      href: "/admin/settings/integrations",
    },
    { key: "notifications", label: CONFIRMABLE_FACTS.notifications, done: isConfirmed(s, "notifications") && s.notificationEmails.length > 0, blocking: false, href: "/admin/settings" },
    {
      key: "storage",
      label: "Media storage (S3-compatible) configured",
      done: store.provider === "s3",
      detail: store.provider === "none" ? store.reason : store.provider === "local" ? "Local disk (development only)" : undefined,
      blocking: false,
      href: "/admin/settings/integrations",
    },
    { key: "photos", label: "Real property photos uploaded and published", done: (realPhotos[0]?.n ?? 0) > 0, blocking: false, href: "/admin/content/media" },
    { key: "amenities", label: "Published amenities verified by client", done: (unverifiedAmenities[0]?.n ?? 0) === 0, blocking: false, href: "/admin/content/amenities" },
    {
      key: "channel",
      label: "Channel / OTA inventory process agreed",
      done: isConfirmed(s, "channel_process"),
      detail: channelConfig().note,
      blocking: true,
      href: "/admin/settings",
    },
  ];
  return items;
}

export type BookingAvailability =
  | { open: true; demo: boolean }
  | { open: false; reasons: string[]; demo: boolean };

/**
 * Whether online instant booking is open. Production requires every blocking checklist item.
 * Demo mode allows booking with sample data and the DEMO gateway, always labelled.
 */
export async function onlineBookingStatus(): Promise<BookingAvailability> {
  const s = await getSettings();
  const demo = isDemoMode();
  const reasons: string[] = [];
  if (s.bookingMode !== "instant") reasons.push("Online booking is set to enquiry-only by the property.");
  const pay = paymentConfig();
  if (pay.provider === "none") reasons.push(`Payments unavailable: ${pay.reason}`);
  if (!demo) {
    const items = await setupChecklist();
    for (const i of items) if (i.blocking && !i.done) reasons.push(`Setup incomplete: ${i.label}`);
  }
  return reasons.length ? { open: false, reasons, demo } : { open: true, demo };
}
