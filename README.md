# RoomtoGo — Room2Go direct-booking website, booking engine and staff admin

A full-stack implementation of the *Room2Go Website requirements v1.0* brief (Stepstones Solutions, 2 Nov 2026):
- a responsive public website built from the three approved designs;
- a direct-booking engine with transactional inventory;
- Razorpay payments behind an adapter, with refunds and recovery;
- optional guest accounts, plus secure booking management for guests who checked out without one;
- a role-based staff admin panel.

> **Not published, no real money.** Nothing has been deployed, no DNS has changed, no live payments are enabled and no message has been sent to a real guest. The demo uses a clearly labelled simulated gateway and email capture.

## Quick start (local demo)
```bash
cp .env.example .env            # set DATABASE_URL; for the demo set DEMO_MODE=true PAYMENT_PROVIDER=demo EMAIL_PROVIDER=demo
npm ci
npm run db:migrate
npm run db:seed                 # DEMO data (flagged SAMPLE) + 3 staff users with random passwords → .demo-credentials
npm run dev                     # http://localhost:3000   admin: /admin/login
```
In demo mode, captured emails (verification links, access codes, confirmations) appear at `/demo/mailbox`. That page returns 404 outside demo mode.

Production bootstrap: see [docs/OPERATIONS.md](docs/OPERATIONS.md). In short: `db:migrate` → `db:seed:base` → `/admin/setup?token=…` → launch checklist.

## Stack
| Concern | Choice |
|---|---|
| Framework | Next.js **16.4** (App Router, React 19.2, server components + server actions), TypeScript 5 |
| Database | PostgreSQL (tested on 16) via **Drizzle ORM 0.45**, with SQL migrations in `drizzle/` |
| Auth | **Better Auth 1.7**: email/password, verified email, reset, DB sessions, rate limits, TOTP 2FA |
| Payments | **Razorpay** Standard Checkout (official `razorpay` SDK 2.9) behind `PaymentAdapter`; DEMO adapter for development |
| Email | SMTP (`nodemailer`) behind an adapter, with a transactional outbox |
| Storage | S3-compatible (`@aws-sdk/client-s3`) or local disk for development; `sharp` re-encodes uploads |
| Styling | Tailwind CSS 4; Newsreader (serif) + DM Sans (sans), self-hosted via Fontsource (SIL OFL) |
| Tests | Vitest 5 (integration against real Postgres), Playwright 1.63 (end-to-end) |

Versions are pinned in `package-lock.json`.

## Architecture
```
src/
  db/schema.ts            all tables (money = integer paise, dates = property-local YYYY-MM-DD)
  lib/                    config/feature flags, auth, staff permissions, money/date utils, tokens, rate limit, audit
  domain/                 business logic (no UI):
    inventory.ts          unit_nights allocation, holds, blocks, reassignment
    pricing.ts            rate precedence, occupancy, closures, min stay, taxes, payment rule
    booking.ts            lifecycle, manual bookings, date changes, adjustments, guest requests
    payments.ts           orders, verification, webhooks, reconciliation, late/excess payments, refunds
    notifications.ts      outbox + retry; templates.ts
    guest-access.ts       link tokens + reference/OTP access
    reports.ts, enquiries.ts, reviews.ts, content.ts, settings.ts (launch checklist), jobs.ts
  integrations/           payments (razorpay, demo), email, storage
  app/(site)/             public pages + booking flow + account
  app/admin/              staff login/setup/2FA + (panel)/* modules; actions.ts = all admin server actions
  app/api/                auth, payments/verify, webhooks/razorpay, cron/[job], booking-access, admin CSVs, health
```

**Double-selling is prevented by the database.** The `unit_nights` table has `PRIMARY KEY (unit_id, night)`. Holds, confirmed stays and maintenance blocks all insert there. Allocation tries one physical unit for the *whole* stay inside a savepoint and only moves to the next unit if any night conflicts. Two concurrent attempts for the last unit therefore serialise on the key, so a stay is never split across incompatible units.

**Pricing precedence:** date override › seasonal rule (priority) › weekend rate › base rate. Every booking stores a price snapshot (nightly lines, taxes, rules) and a policy snapshot (the policy versions and text the guest accepted). State maps are in [docs/STATES.md](docs/STATES.md).

## Routes
**Public:** `/`, `/about`, `/rooms`, `/rooms/[slug]`, `/amenities`, `/gallery`, `/reviews`, `/reviews/submit`, `/contact`, `/extended-stays`, `/privacy`, `/terms`, `/cancellation-policy`, `/house-rules`.

**Booking:** `/book` → `/checkout` → `/checkout/pay/[ref]` → (Razorpay modal | `/demo-gateway/[orderId]`) → `/booking/confirmation`. Also `/manage-booking`, `/manage-booking/[ref]` and `/documents/[ref]/{receipt,confirmation,invoice}`.

**Guest account:** `/account`, `/account/{login,register,forgot,reset}`.

**Staff admin:**
- Access: `/admin/login`, `/admin/setup`, `/admin/security`.
- Operations: `/admin` (overview), `/admin/reservations[/new|/[id]]`, `/admin/calendar`, `/admin/enquiries`, `/admin/guests`.
- Money and inventory: `/admin/payments`, `/admin/reports`, `/admin/rooms`, `/admin/availability`, `/admin/rates`.
- Website: `/admin/content`, `/admin/content/{policies,faqs,amenities,media}`, `/admin/reviews`.
- System: `/admin/settings[/integrations]`, `/admin/staff`, `/admin/messages`, `/admin/audit`.

**Roles** (`src/lib/permissions.ts`), enforced in every server action and route:
- **Owner:** everything.
- **Reception:** reservations, assignments, check-in/out, guest contact, enquiries, offline payments. No refunds, rates, settings or staff.
- **Content editor:** content, photos, FAQs, review moderation. No guest or financial data.

## Tests (actual results)
```bash
npm test            # Vitest integration (needs Postgres; uses room2go_test, rebuilt each run)
npm run build && npm run test:e2e   # Playwright: rebuilds + seeds isolated room2go_e2e DB, starts `next start` on :3100
```
Results from this build are listed in [docs/TEST_REPORT.md](docs/TEST_REPORT.md).

## Visual review
Screenshots at 360 / 768 / 1024 / 1440 px are in `docs/screenshots/` (`home-*`, `gallery-*`, `reviews-*`, `rooms-*`, `book-*`, plus `admin-*`). Regenerate them with `npm run screenshots` while a server is running. Mapping to the references:
- `Room2Go Bengaluru Stay Website Restoration(1).png` → `home-1440.png`: same section order — hero, amenity strip, about, rooms, amenities, gallery, testimonials, location, FAQ, CTA, footer.
- `Room2Go gallery_ A closer look-4.png` → `gallery-1440.png`: category pills, asymmetric grid, captions, expand icons, CTA band, footer.
- `Room2Go testimonials in a warm hotel lounge-3.png` → `reviews-1440.png`: photographic hero, design-preview notice, tinted cards, share-your-experience panel, booking CTA.

**Sample assets:** photos in `public/sample/` are crops of the AI-generated design references. They are labelled “Illustrative sample” on every page and hidden in production. **Replace them** with real photos via Admin → Photos & gallery, and supply the real logo (the wordmark is currently typeset in Newsreader).

## Remaining configuration dependencies (honest list)
See [BUSINESS_INPUTS.md](BUSINESS_INPUTS.md) for the business decisions. Technical dependencies:
1. **Razorpay:** create Room2Go's merchant account, add test keys and the webhook secret, run a sandbox payment and refund end-to-end, then go live with `ALLOW_LIVE_PAYMENTS=true`. The Razorpay adapter is implemented to Razorpay's documented API and signature scheme. It has **not** been exercised against Razorpay's sandbox from this environment, because no credentials or network access were available. All payment logic was tested through the DEMO adapter, which uses the same interface.
2. **Email:** configure an SMTP sender and DNS (SPF/DKIM). Until then, messages show as `blocked_unconfigured` (never “sent”).
3. **Storage:** create an S3-compatible bucket.
4. **Scheduler:** call `/api/cron/all` every 1–5 minutes.
5. **Hosting and database backups:** see OPERATIONS.md.
6. **OTA/PMS sync is NOT implemented.** No provider or credentials were supplied. External platforms are not synchronised: staff enter OTA bookings manually, and units can be excluded from online sale. Instant booking across several channels must not go live until this process is agreed.
7. **Optional, not built:** WhatsApp/SMS automation (contact buttons only), coupons and packages, automatic long-stay pricing, multilingual pages, housekeeping. Extension points: `discountPaise` in pricing, the adapter folders, and outbox channels.
8. **Core Web Vitals** have not been measured with Lighthouse or CrUX here. Measured page weights are in TEST_REPORT.md.
