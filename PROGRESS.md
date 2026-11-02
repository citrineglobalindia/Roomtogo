# RoomtoGo build progress

## Completed (v1.0 implementation, 2 Nov 2026)
- [x] Scaffold: Next.js 16.4, Drizzle + PostgreSQL migrations (with CHECK constraints), Better Auth, Tailwind 4
- [x] Inventory engine (`unit_nights` PK protection, single-unit continuous allocation, holds, blocks, reassignment)
- [x] Pricing engine (precedence, extra guests, closures, min stay, configurable tax slabs, advance rule, snapshots)
- [x] Booking lifecycle, manual bookings, guest requests, date changes with price delta, audited adjustments
- [x] Payments: Razorpay + DEMO adapters, verification, webhooks, idempotency, reconciliation, late/excess payments, offline payments, refunds, exceptions
- [x] Outbox notifications + templates; enquiries; reviews (moderation, invites); reports + CSV; background jobs + worker; health
- [x] Public site from the three designs (all routes in the brief), booking flow, manage-booking (link + OTP), documents, guest accounts
- [x] Admin panel: overview, reservations, calendar, manual booking, rooms/units, availability, rates, payments, guests, enquiries, content/policies/FAQs/amenities/media, reviews, reports, staff, settings + launch checklist, integrations, messages, audit; owner setup + 2FA
- [x] SEO (metadata, canonical, sitemap, robots, verified-facts JSON-LD), analytics layer (consent, no personal data), security headers, noindex/no-store on private routes
- [x] Tests: 36 integration + 16 e2e passing; screenshots at 360/768/1024/1440
- [x] Docs: README, BUSINESS_INPUTS.md, .env.example, docs/STATES.md, docs/OPERATIONS.md, docs/TEST_REPORT.md

## Next (needs client inputs — see BUSINESS_INPUTS.md)
- [ ] Replace sample units/rates/policies/photos/testimonials with approved data; verify amenities
- [ ] Razorpay sandbox end-to-end with Room2Go's merchant test keys; then live
- [ ] SMTP sender + DNS; S3 bucket; scheduler; hosting + backups
- [ ] Decide OTA/PMS process (sync not implemented; manual entry only)
- [ ] Field Core Web Vitals and screen-reader review on the hosted staging site
