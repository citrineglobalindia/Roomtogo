export type StaffRole = "owner" | "reception" | "content";

export const PERMISSIONS = [
  "dashboard.view",
  "bookings.view",
  "bookings.manage", // create manual bookings, assign units, check in/out, no-show, resolve requests
  "bookings.cancel",
  "bookings.modify_price", // audited price adjustments / date changes with charge deltas
  "calendar.view",
  "inventory.view",
  "inventory.manage", // room types, units
  "availability.manage", // blocks, closures
  "rates.manage",
  "payments.view",
  "payments.record_offline",
  "payments.reconcile",
  "refunds.manage",
  "exceptions.resolve",
  "guests.view",
  "guests.notes",
  "enquiries.manage",
  "content.manage",
  "media.manage",
  "reviews.moderate",
  "reports.view",
  "staff.manage",
  "settings.manage",
  "audit.view",
  "outbox.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  reception: [
    "dashboard.view",
    "bookings.view",
    "bookings.manage",
    "bookings.cancel",
    "calendar.view",
    "inventory.view",
    "payments.view",
    "payments.record_offline",
    "guests.view",
    "guests.notes",
    "enquiries.manage",
    "outbox.view",
  ],
  content: ["content.manage", "media.manage", "reviews.moderate"],
};

export function can(role: StaffRole | null | undefined, perm: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(perm);
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Owner / administrator",
  reception: "Reception / operations",
  content: "Content editor",
};
