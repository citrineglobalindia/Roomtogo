/**
 * Room2Go database schema (Drizzle ORM / PostgreSQL).
 *
 * Conventions
 * - Money: integer paise (INR minor unit). Never floats.
 * - Stay dates: `date` columns as 'YYYY-MM-DD' strings in the property timezone (Asia/Kolkata).
 *   Arrival inclusive, departure exclusive.
 * - Timestamps: timestamptz (UTC instants).
 * - Inventory protection: `unit_nights` has PRIMARY KEY (unit_id, night). Every booking allocation and
 *   availability block writes one row per unit per night, so the database itself rejects double-selling.
 * - Hand-written constraints that Drizzle cannot express live in drizzle/0001_constraints.sql.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  bigint,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();
const day = (name: string) => date(name, { mode: "string" });

/* ------------------------------------------------------------------ */
/* Better Auth core tables (guest + staff identities)                  */
/* ------------------------------------------------------------------ */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: ts("locked_until"),
  },
  (t) => [index("two_factor_user_idx").on(t.userId), index("two_factor_secret_idx").on(t.secret)],
);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* ------------------------------------------------------------------ */
/* Staff                                                               */
/* ------------------------------------------------------------------ */
export const staffRole = pgEnum("staff_role", ["owner", "reception", "content"]);

/** Staff membership is a separate table: public sign-up can never create a row here. */
export const staffMembers = pgTable("staff_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "restrict" }),
  role: staffRole("role").notNull(),
  active: boolean("active").notNull().default(true),
  createdByStaffId: uuid("created_by_staff_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ */
/* Property settings, content, policies                                */
/* ------------------------------------------------------------------ */
export const bookingMode = pgEnum("booking_mode", ["enquiry_only", "instant"]);
export const paymentRule = pgEnum("payment_rule", ["full", "advance"]);

/**
 * Singleton row (id = 1). Every business fact that the brief marks as unconfirmed has a matching
 * entry in `confirmedFields` once the owner confirms it in the admin settings screen.
 */
export const propertySettings = pgTable("property_settings", {
  id: integer("id").primaryKey().default(1),
  name: text("name").notNull().default("Room2Go"),
  legalName: text("legal_name"),
  addressLine: text("address_line").notNull(),
  locality: text("locality"),
  city: text("city").notNull(),
  region: text("region").notNull(),
  postalCode: text("postal_code").notNull(),
  country: text("country").notNull().default("IN"),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  whatsappNumber: text("whatsapp_number"),
  mapLat: text("map_lat"),
  mapLng: text("map_lng"),
  mapUrl: text("map_url"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  currency: text("currency").notNull().default("INR"),
  checkInTime: text("check_in_time"),
  checkOutTime: text("check_out_time"),
  holdMinutes: integer("hold_minutes").notNull().default(10),
  bookingMode: bookingMode("booking_mode").notNull().default("enquiry_only"),
  paymentRule: paymentRule("payment_rule").notNull().default("full"),
  advancePercent: integer("advance_percent").notNull().default(100),
  maxRoomsPerBooking: integer("max_rooms_per_booking").notNull().default(4),
  bookingWindowDays: integer("booking_window_days").notNull().default(365),
  /** Tax rules are inert until the owner/accountant confirms them. */
  taxEnabled: boolean("tax_enabled").notNull().default(false),
  taxRules: jsonb("tax_rules").$type<TaxRule[]>().notNull().default([]),
  taxInvoicesEnabled: boolean("tax_invoices_enabled").notNull().default(false),
  taxRegistrationNumber: text("tax_registration_number"),
  invoicePrefix: text("invoice_prefix").notNull().default("R2G"),
  notificationEmails: text("notification_emails").array().notNull().default(sql`'{}'::text[]`),
  socialLinks: jsonb("social_links").$type<Record<string, string>>().notNull().default({}),
  reviewInvitesEnabled: boolean("review_invites_enabled").notNull().default(false),
  preArrivalReminderDays: integer("pre_arrival_reminder_days"),
  guestDataRetentionDays: integer("guest_data_retention_days"),
  /** Which business facts have been confirmed by the owner: { fieldName: { by, at } } */
  confirmedFields: jsonb("confirmed_fields").$type<Record<string, { by: string; at: string }>>().notNull().default({}),
  updatedAt: updatedAt(),
});

export type TaxRule = {
  label: string;
  /** basis points of the taxable amount, e.g. 1200 = 12% */
  rateBps: number;
  /** Optional per-night tariff slab (inclusive min, inclusive max) in paise */
  minNightlyPaise?: number | null;
  maxNightlyPaise?: number | null;
};

export const publishStatus = pgEnum("publish_status", ["draft", "published", "archived"]);

/** Editable page content blocks with separate draft / published payloads (preview = draft). */
export const contentBlocks = pgTable("content_blocks", {
  key: text("key").primaryKey(),
  draft: jsonb("draft").$type<Record<string, unknown>>().notNull(),
  published: jsonb("published").$type<Record<string, unknown>>(),
  publishedAt: ts("published_at"),
  updatedByStaffId: uuid("updated_by_staff_id"),
  updatedAt: updatedAt(),
});

export const policyKind = pgEnum("policy_kind", ["privacy", "terms", "cancellation", "house_rules"]);

/** Policies are versioned. Bookings reference the version (and keep a text snapshot) they accepted. */
export const policyVersions = pgTable(
  "policy_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: policyKind("kind").notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: publishStatus("status").notNull().default("draft"),
    /** true only after the owner explicitly confirms the text is approved */
    approved: boolean("approved").notNull().default(false),
    /** Structured cancellation rule used for refund suggestions (optional) */
    rules: jsonb("rules").$type<CancellationRules | null>(),
    isSample: boolean("is_sample").notNull().default(false),
    publishedAt: ts("published_at"),
    createdByStaffId: uuid("created_by_staff_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("policy_kind_version_uq").on(t.kind, t.version)],
);

export type CancellationRules = {
  /** free cancellation if cancelled at least N hours before check-in time */
  freeCancellationHours?: number | null;
  /** percentage (bps) of total refundable after the free window */
  lateRefundBps?: number | null;
  noShowRefundBps?: number | null;
};

export const faqs = pgTable("faqs", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  status: publishStatus("status").notNull().default("draft"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const amenityScope = pgEnum("amenity_scope", ["in_room", "shared", "service"]);
export const amenityCharge = pgEnum("amenity_charge", ["included", "chargeable", "on_request", "unknown"]);

export const amenities = pgTable("amenities", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon").notNull().default("check"),
  scope: amenityScope("scope").notNull().default("shared"),
  charge: amenityCharge("charge").notNull().default("unknown"),
  /** Must be confirmed by the client before it is published in production. */
  verified: boolean("verified").notNull().default(false),
  showInStrip: boolean("show_in_strip").notNull().default(false),
  status: publishStatus("status").notNull().default("draft"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const galleryCategories = pgTable("gallery_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storageKey: text("storage_key").notNull().unique(),
    url: text("url").notNull(),
    alt: text("alt").notNull(),
    caption: text("caption"),
    width: integer("width"),
    height: integer("height"),
    mimeType: text("mime_type").notNull(),
    bytes: integer("bytes"),
    /** Illustrative / sample asset — never presented as a real property photo in production */
    isSample: boolean("is_sample").notNull().default(false),
    categoryId: uuid("category_id").references(() => galleryCategories.id, { onDelete: "set null" }),
    roomTypeId: uuid("room_type_id"),
    inGallery: boolean("in_gallery").notNull().default(true),
    status: publishStatus("status").notNull().default("draft"),
    sortOrder: integer("sort_order").notNull().default(0),
    uploadedByStaffId: uuid("uploaded_by_staff_id"),
    createdAt: createdAt(),
  },
  (t) => [index("media_category_idx").on(t.categoryId), index("media_room_type_idx").on(t.roomTypeId)],
);

/* ------------------------------------------------------------------ */
/* Accommodation inventory                                              */
/* ------------------------------------------------------------------ */
export const activeStatus = pgEnum("active_status", ["active", "inactive"]);

export const roomTypes = pgTable("room_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  summary: text("summary").notNull().default(""),
  description: text("description").notNull().default(""),
  bedConfiguration: text("bed_configuration"),
  sizeSqft: integer("size_sqft"),
  /** Guests included in the base nightly rate */
  baseOccupancy: integer("base_occupancy").notNull().default(2),
  maxAdults: integer("max_adults").notNull().default(2),
  maxChildren: integer("max_children").notNull().default(0),
  maxOccupancy: integer("max_occupancy").notNull().default(2),
  extraBedsAllowed: integer("extra_beds_allowed").notNull().default(0),
  inclusions: text("inclusions").array().notNull().default(sql`'{}'::text[]`),
  /** Base nightly rate. NULL = no approved rate yet (not bookable online). */
  baseRatePaise: integer("base_rate_paise"),
  /** Optional weekend rate applied to nights whose weekday is in `weekendDays` (0=Sun .. 6=Sat) */
  weekendRatePaise: integer("weekend_rate_paise"),
  weekendDays: integer("weekend_days").array().notNull().default(sql`'{5,6}'::int[]`),
  extraAdultPaise: integer("extra_adult_paise").notNull().default(0),
  extraChildPaise: integer("extra_child_paise").notNull().default(0),
  minStayNights: integer("min_stay_nights").notNull().default(1),
  /** Rates on this room type are sample/demo values — must be replaced before production */
  ratesAreSample: boolean("rates_are_sample").notNull().default(false),
  /** Room facts (occupancy, beds, size) confirmed by the client */
  factsConfirmed: boolean("facts_confirmed").notNull().default(false),
  coverMediaId: uuid("cover_media_id"),
  status: activeStatus("status").notNull().default("active"),
  publicStatus: publishStatus("public_status").notNull().default("draft"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const roomTypeAmenities = pgTable(
  "room_type_amenities",
  {
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "cascade" }),
    amenityId: uuid("amenity_id")
      .notNull()
      .references(() => amenities.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roomTypeId, t.amenityId] })],
);

export const roomUnits = pgTable(
  "room_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "restrict" }),
    label: text("label").notNull().unique(),
    floor: text("floor"),
    status: activeStatus("status").notNull().default("active"),
    /** Unit is allocated to direct (website) sales. Units reserved for other channels are excluded online. */
    directSale: boolean("direct_sale").notNull().default(true),
    isSample: boolean("is_sample").notNull().default(false),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("units_room_type_idx").on(t.roomTypeId)],
);

/** Seasonal / day-of-week rate rules. Precedence: date override > rule (priority desc) > weekend > base. */
export const rateRules = pgTable(
  "rate_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startDate: day("start_date").notNull(),
    endDate: day("end_date").notNull(), // inclusive
    daysOfWeek: integer("days_of_week").array(), // null = all days
    ratePaise: integer("rate_paise").notNull(),
    minStayNights: integer("min_stay_nights"),
    priority: integer("priority").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("rate_rules_type_dates_idx").on(t.roomTypeId, t.startDate, t.endDate)],
);

/** Explicit per-date overrides (highest precedence), including closures. */
export const dateRates = pgTable(
  "date_rates",
  {
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "cascade" }),
    night: day("night").notNull(),
    ratePaise: integer("rate_paise"),
    minStayNights: integer("min_stay_nights"),
    closed: boolean("closed").notNull().default(false),
    closedToArrival: boolean("closed_to_arrival").notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.roomTypeId, t.night] })],
);

export const blockKind = pgEnum("block_kind", ["maintenance", "owner_use", "closure", "external"]);

export const availabilityBlocks = pgTable(
  "availability_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => roomUnits.id, { onDelete: "restrict" }),
    startDate: day("start_date").notNull(),
    endDate: day("end_date").notNull(), // exclusive
    kind: blockKind("kind").notNull().default("maintenance"),
    reason: text("reason").notNull(),
    createdByStaffId: uuid("created_by_staff_id"),
    releasedAt: ts("released_at"),
    releasedByStaffId: uuid("released_by_staff_id"),
    createdAt: createdAt(),
  },
  (t) => [index("blocks_unit_idx").on(t.unitId, t.startDate)],
);

/* ------------------------------------------------------------------ */
/* Guests, bookings                                                    */
/* ------------------------------------------------------------------ */
export const guests = pgTable(
  "guests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    marketingOptInAt: ts("marketing_opt_in_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("guests_email_uq").on(sql`lower(${t.email})`)],
);

/** Staff-only notes about a guest; never rendered in guest-facing views. */
export const guestNotes = pgTable("guest_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  guestId: uuid("guest_id")
    .notNull()
    .references(() => guests.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id").notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export const bookingStatus = pgEnum("booking_status", [
  "pending_payment",
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
  "expired",
]);

export const bookingSource = pgEnum("booking_source", [
  "website",
  "phone",
  "whatsapp",
  "walk_in",
  "email",
  "external_ota",
  "other",
]);

export const paymentStatus = pgEnum("payment_status", ["unpaid", "partially_paid", "paid", "overpaid"]);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").notNull().unique(),
    status: bookingStatus("status").notNull(),
    paymentStatus: paymentStatus("payment_status").notNull().default("unpaid"),
    source: bookingSource("source").notNull().default("website"),
    externalRef: text("external_ref"),
    checkIn: day("check_in").notNull(),
    checkOut: day("check_out").notNull(),
    nights: integer("nights").notNull(),
    adults: integer("adults").notNull(),
    children: integer("children").notNull().default(0),
    roomsCount: integer("rooms_count").notNull(),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "restrict" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    leadName: text("lead_name").notNull(),
    leadEmail: text("lead_email").notNull(),
    leadPhone: text("lead_phone").notNull(),
    arrivalEta: text("arrival_eta"),
    specialRequests: text("special_requests"),
    currency: text("currency").notNull().default("INR"),
    subtotalPaise: integer("subtotal_paise").notNull(),
    extrasPaise: integer("extras_paise").notNull().default(0),
    discountPaise: integer("discount_paise").notNull().default(0),
    taxPaise: integer("tax_paise").notNull().default(0),
    /** Total at booking time + approved adjustments */
    totalPaise: integer("total_paise").notNull(),
    dueNowPaise: integer("due_now_paise").notNull(),
    amountPaidPaise: integer("amount_paid_paise").notNull().default(0),
    amountRefundedPaise: integer("amount_refunded_paise").notNull().default(0),
    /** Immutable snapshot of the quote (nightly lines, tax lines, rules used) at booking time */
    priceSnapshot: jsonb("price_snapshot").notNull(),
    /** Payment rule + policy versions/text accepted by the guest */
    policySnapshot: jsonb("policy_snapshot").notNull(),
    policyAcceptedAt: ts("policy_accepted_at"),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    /** Demo/test booking — excluded from production reports */
    isDemo: boolean("is_demo").notNull().default(false),
    manageTokenHash: text("manage_token_hash"),
    manageTokenExpiresAt: ts("manage_token_expires_at"),
    createdByStaffId: uuid("created_by_staff_id"),
    confirmedAt: ts("confirmed_at"),
    cancelledAt: ts("cancelled_at"),
    cancelReason: text("cancel_reason"),
    checkedInAt: ts("checked_in_at"),
    checkedOutAt: ts("checked_out_at"),
    conversionTrackedAt: ts("conversion_tracked_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("bookings_dates_idx").on(t.checkIn, t.checkOut),
    index("bookings_status_idx").on(t.status),
    index("bookings_guest_idx").on(t.guestId),
    index("bookings_user_idx").on(t.userId),
    index("bookings_email_idx").on(sql`lower(${t.leadEmail})`),
  ],
);

/** One row per allocated physical unit in a booking. */
export const bookingUnits = pgTable(
  "booking_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "restrict" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => roomUnits.id, { onDelete: "restrict" }),
    adults: integer("adults").notNull(),
    children: integer("children").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("booking_units_booking_idx").on(t.bookingId), index("booking_units_unit_idx").on(t.unitId)],
);

/** Nightly price snapshot per allocated unit. */
export const bookingNights = pgTable(
  "booking_nights",
  {
    bookingUnitId: uuid("booking_unit_id")
      .notNull()
      .references(() => bookingUnits.id, { onDelete: "cascade" }),
    night: day("night").notNull(),
    ratePaise: integer("rate_paise").notNull(),
    extraGuestPaise: integer("extra_guest_paise").notNull().default(0),
    rateSource: text("rate_source").notNull(),
  },
  (t) => [primaryKey({ columns: [t.bookingUnitId, t.night] })],
);

export const unitNightKind = pgEnum("unit_night_kind", ["booking", "block"]);

/**
 * Authoritative occupancy. PRIMARY KEY (unit_id, night) makes overlapping allocation impossible:
 * holds (pending_payment bookings), confirmed stays and maintenance blocks all insert here.
 */
export const unitNights = pgTable(
  "unit_nights",
  {
    unitId: uuid("unit_id")
      .notNull()
      .references(() => roomUnits.id, { onDelete: "restrict" }),
    night: day("night").notNull(),
    kind: unitNightKind("kind").notNull(),
    bookingUnitId: uuid("booking_unit_id").references(() => bookingUnits.id, { onDelete: "cascade" }),
    blockId: uuid("block_id").references(() => availabilityBlocks.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.unitId, t.night] }),
    index("unit_nights_night_idx").on(t.night),
    index("unit_nights_booking_unit_idx").on(t.bookingUnitId),
    index("unit_nights_block_idx").on(t.blockId),
  ],
);

export const holdStatus = pgEnum("hold_status", ["active", "converted", "expired", "released"]);

export const inventoryHolds = pgTable(
  "inventory_holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: "cascade" }),
    status: holdStatus("status").notNull().default("active"),
    expiresAt: ts("expires_at").notNull(),
    resolvedAt: ts("resolved_at"),
    createdAt: createdAt(),
  },
  (t) => [index("holds_active_expiry_idx").on(t.status, t.expiresAt)],
);

export const requestKind = pgEnum("request_kind", ["cancellation", "date_change"]);
export const requestStatus = pgEnum("request_status", ["requested", "approved", "rejected", "withdrawn"]);

/** Guest-originated cancellation / date-change requests (separate from approved cancellations). */
export const bookingRequests = pgTable(
  "booking_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    kind: requestKind("kind").notNull(),
    status: requestStatus("status").notNull().default("requested"),
    requestedCheckIn: day("requested_check_in"),
    requestedCheckOut: day("requested_check_out"),
    guestMessage: text("guest_message"),
    staffResponse: text("staff_response"),
    resolvedByStaffId: uuid("resolved_by_staff_id"),
    resolvedAt: ts("resolved_at"),
    createdAt: createdAt(),
  },
  (t) => [index("booking_requests_booking_idx").on(t.bookingId)],
);

/** Audited staff price adjustments (positive = additional charge, negative = reduction). */
export const bookingAdjustments = pgTable("booking_adjustments", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "cascade" }),
  amountPaise: integer("amount_paise").notNull(),
  reason: text("reason").notNull(),
  kind: text("kind").notNull().default("manual"), // manual | date_change
  staffId: uuid("staff_id").notNull(),
  createdAt: createdAt(),
});

export const bookingNotes = pgTable("booking_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id").notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

/** Booking-reference + OTP challenges for guest-checkout access. Only a hash of the code is stored. */
export const accessChallenges = pgTable(
  "access_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
    consumedAt: ts("consumed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("access_challenges_booking_idx").on(t.bookingId)],
);

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */
export const paymentOrderStatus = pgEnum("payment_order_status", ["created", "attempted", "paid", "failed", "cancelled"]);

export const paymentOrders = pgTable(
  "payment_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(), // razorpay | demo
    providerMode: text("provider_mode").notNull(), // test | live | demo
    providerOrderId: text("provider_order_id").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    purpose: text("purpose").notNull().default("booking"), // booking | balance
    status: paymentOrderStatus("status").notNull().default("created"),
    lastReconciledAt: ts("last_reconciled_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("payment_orders_provider_order_uq").on(t.provider, t.providerOrderId),
    index("payment_orders_booking_idx").on(t.bookingId),
  ],
);

export const paymentChannel = pgEnum("payment_channel", ["gateway", "offline"]);
export const paymentTxnStatus = pgEnum("payment_txn_status", ["captured", "failed", "pending"]);

/**
 * Money received. `channel = gateway` rows are created only after server-side verification with the
 * provider. `channel = offline` rows are staff-recorded cash/bank/UPI receipts and are labelled so.
 */
export const paymentTransactions = pgTable(
  "payment_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    paymentOrderId: uuid("payment_order_id").references(() => paymentOrders.id),
    channel: paymentChannel("channel").notNull(),
    provider: text("provider"),
    providerPaymentId: text("provider_payment_id"),
    method: text("method"), // upi | card | netbanking | cash | bank_transfer | ...
    reference: text("reference"),
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    status: paymentTxnStatus("status").notNull(),
    verifiedVia: text("verified_via"), // checkout_signature | webhook | reconciliation | staff
    /** Payment beyond the amount due (duplicate success) — flagged for refund, never allocates rooms */
    isExcess: boolean("is_excess").notNull().default(false),
    recordedByStaffId: uuid("recorded_by_staff_id"),
    receivedAt: ts("received_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("payment_txn_provider_payment_uq").on(t.provider, t.providerPaymentId),
    index("payment_txn_booking_idx").on(t.bookingId),
    index("payment_txn_received_idx").on(t.receivedAt),
  ],
);

export const refundStatus = pgEnum("refund_status", ["requested", "processing", "succeeded", "failed"]);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    paymentTransactionId: uuid("payment_transaction_id")
      .notNull()
      .references(() => paymentTransactions.id),
    amountPaise: integer("amount_paise").notNull(),
    status: refundStatus("status").notNull().default("requested"),
    provider: text("provider"),
    providerRefundId: text("provider_refund_id"),
    /** offline refunds (cash/bank) are recorded by staff and labelled */
    channel: paymentChannel("channel").notNull(),
    reason: text("reason").notNull(),
    failureReason: text("failure_reason"),
    requestedByStaffId: uuid("requested_by_staff_id").notNull(),
    approvedByStaffId: uuid("approved_by_staff_id"),
    completedAt: ts("completed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("refunds_provider_refund_uq").on(t.provider, t.providerRefundId),
    index("refunds_booking_idx").on(t.bookingId),
  ],
);

/** Processed gateway notification IDs (idempotency). */
export const gatewayEvents = pgTable(
  "gateway_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    status: text("status").notNull().default("received"), // received | processed | ignored | error
    error: text("error"),
    receivedAt: ts("received_at").notNull().defaultNow(),
    processedAt: ts("processed_at"),
  },
  (t) => [uniqueIndex("gateway_events_uq").on(t.provider, t.eventId)],
);

export const exceptionKind = pgEnum("exception_kind", [
  "paid_after_hold_expired",
  "excess_payment",
  "amount_mismatch",
  "refund_failed",
  "reconciliation_failed",
  "paid_for_cancelled_booking",
]);

export const paymentExceptions = pgTable(
  "payment_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    paymentTransactionId: uuid("payment_transaction_id").references(() => paymentTransactions.id),
    kind: exceptionKind("kind").notNull(),
    details: text("details").notNull(),
    status: text("status").notNull().default("open"), // open | resolved
    resolution: text("resolution"),
    resolvedByStaffId: uuid("resolved_by_staff_id"),
    resolvedAt: ts("resolved_at"),
    createdAt: createdAt(),
  },
  (t) => [index("payment_exceptions_status_idx").on(t.status)],
);

/** Demo gateway records — only used when PAYMENT_PROVIDER=demo outside production. */
export const demoGatewayPayments = pgTable("demo_gateway_payments", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull(), // captured | failed | refunded
  refundedPaise: integer("refunded_paise").notNull().default(0),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Enquiries, reviews                                                  */
/* ------------------------------------------------------------------ */
export const enquiryKind = pgEnum("enquiry_kind", ["general", "extended_stay", "corporate", "booking"]);
export const enquiryStatus = pgEnum("enquiry_status", ["new", "contacted", "quoted", "closed"]);

export const enquiries = pgTable(
  "enquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: enquiryKind("kind").notNull(),
    status: enquiryStatus("status").notNull().default("new"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    company: text("company"),
    checkIn: day("check_in"),
    checkOut: day("check_out"),
    guests: integer("guests"),
    roomsCount: integer("rooms_count"),
    stayLength: text("stay_length"), // weekly | monthly | other
    message: text("message").notNull(),
    followUpDate: day("follow_up_date"),
    assignedStaffId: uuid("assigned_staff_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("enquiries_status_idx").on(t.status, t.createdAt)],
);

export const enquiryNotes = pgTable("enquiry_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  enquiryId: uuid("enquiry_id")
    .notNull()
    .references(() => enquiries.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id").notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export const reviewStatus = pgEnum("review_status", ["pending", "approved", "rejected"]);
export const reviewSource = pgEnum("review_source", ["website_form", "stay_invitation", "google", "booking_com", "email", "other", "sample"]);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorName: text("author_name").notNull(),
    /** Shown publicly instead of name if the reviewer prefers, e.g. "Business traveller" */
    displayLabel: text("display_label"),
    email: text("email"),
    rating: integer("rating"),
    title: text("title"),
    body: text("body").notNull(),
    stayMonth: text("stay_month"),
    source: reviewSource("source").notNull(),
    sourceUrl: text("source_url"),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    consentToPublish: boolean("consent_to_publish").notNull().default(false),
    status: reviewStatus("status").notNull().default("pending"),
    moderatedByStaffId: uuid("moderated_by_staff_id"),
    moderatedAt: ts("moderated_at"),
    moderationNote: text("moderation_note"),
    createdAt: createdAt(),
  },
  (t) => [index("reviews_status_idx").on(t.status)],
);

export const reviewInvitations = pgTable("review_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id")
    .notNull()
    .unique()
    .references(() => bookings.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Notifications outbox, audit, app rate limit                         */
/* ------------------------------------------------------------------ */
export const outboxStatus = pgEnum("outbox_status", [
  "pending",
  "sending",
  "sent",
  "failed",
  "captured_demo",
  "blocked_unconfigured",
]);

export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: text("channel").notNull().default("email"),
    template: text("template").notNull(),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    text: text("text").notNull(),
    /** Unique key that prevents duplicate messages, e.g. "booking-confirmed:<bookingId>" */
    dedupeKey: text("dedupe_key").notNull().unique(),
    bookingId: uuid("booking_id"),
    status: outboxStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(6),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    lockedUntil: ts("locked_until"),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    sentAt: ts("sent_at"),
    createdAt: createdAt(),
  },
  (t) => [index("outbox_due_idx").on(t.status, t.nextAttemptAt), index("outbox_booking_idx").on(t.bookingId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorType: text("actor_type").notNull(), // staff | guest | system
    actorId: text("actor_id"),
    actorLabel: text("actor_label"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_created_idx").on(t.createdAt)],
);

/** Fixed-window rate limiter for public forms / OTP endpoints (works across instances). */
export const appRateLimits = pgTable("app_rate_limits", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull(),
});

export const jobRuns = pgTable("job_runs", {
  job: text("job").primaryKey(),
  lastStartedAt: ts("last_started_at"),
  lastFinishedAt: ts("last_finished_at"),
  lastStatus: text("last_status"),
  lastError: text("last_error"),
  lastResult: jsonb("last_result"),
});
