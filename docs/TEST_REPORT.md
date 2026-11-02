# Test report — RoomtoGo (2 Nov 2026)

These are actual results from this build environment: Node 22.23, PostgreSQL 16, Chromium (Playwright 1.63).

## Commands and results
| Command | Result |
|---|---|
| `npx tsc --noEmit` | pass |
| `npx eslint src scripts tests` | 0 errors, 2 warnings (intentional full page reload after sign-in) |
| `npx next build` | pass (Next.js 16.4.4, all routes compiled) |
| `npm test` (Vitest, real PostgreSQL `room2go_test`) | **36 / 36 passed** (4 files, ~18 s) |
| `npm run test:e2e` (Playwright vs `next start` + isolated `room2go_e2e`) | **16 / 16 passed** (~45 s) |

## Integration tests (Vitest)
```
✓ tests/integration/booking-inventory.test.ts > date & occupancy validation (server-side) > rejects invalid ranges, past dates, occupancy violations, closures, min-stay and blocks 291ms
✓ tests/integration/booking-inventory.test.ts > date & occupancy validation (server-side) > maintenance blocks remove the unit from sale and cannot overwrite a reservation 275ms
✓ tests/integration/booking-inventory.test.ts > inventory correctness > never creates an impossible split stay: nightly availability across different units is not a continuous stay 206ms
✓ tests/integration/booking-inventory.test.ts > inventory correctness > simultaneous attempts for the final unit: exactly one succeeds, no duplicate unit/night 568ms
✓ tests/integration/booking-inventory.test.ts > inventory correctness > multi-room requests allocate all rooms atomically or nothing 295ms
✓ tests/integration/booking-inventory.test.ts > inventory correctness > adjacent stays: departure and next arrival on the same date are compatible 545ms
✓ tests/integration/booking-inventory.test.ts > inventory correctness > abandoned holds release inventory; expired holds are swept and bookings marked expired 441ms
✓ tests/integration/booking-inventory.test.ts > inventory correctness > staff-entered (offline) bookings block conflicting website sales 461ms
✓ tests/integration/booking-inventory.test.ts > inventory correctness > negotiated manual totals require a reason and are stored as an audited adjustment 245ms
✓ tests/integration/booking-inventory.test.ts > guest booking access isolation > a booking reference + email alone never grants access; OTP and link tokens are booking-specific 318ms
✓ tests/integration/payments.test.ts > payment verification > valid signature + provider-verified capture confirms; booking total comes from server quote 342ms
✓ tests/integration/payments.test.ts > payment verification > altered signature, order or amount cannot confirm a booking 350ms
✓ tests/integration/payments.test.ts > payment verification > failed payment keeps the hold; retry reuses the same reservation and order 278ms
✓ tests/integration/payments.test.ts > recovery & idempotency > closed browser: captured payment is reconciled and confirmed by the background job 302ms
✓ tests/integration/payments.test.ts > recovery & idempotency > duplicate and out-of-order notifications do not duplicate collections, bookings or messages 427ms
✓ tests/integration/payments.test.ts > recovery & idempotency > a second successful payment is flagged as excess and never allocates more rooms 312ms
✓ tests/integration/payments.test.ts > late payment after hold expiry > re-allocates when the unit is still free 291ms
✓ tests/integration/payments.test.ts > late payment after hold expiry > never oversells: if the unit was resold, raises a staff exception and leaves the booking unconfirmed 308ms
✓ tests/integration/payments.test.ts > cancellation & refunds > cancellation releases stock immediately while refunds progress independently and cannot exceed the payment 391ms
✓ tests/integration/payments.test.ts > cancellation & refunds > offline payments are recorded with staff identity and distinguished from gateway payments 309ms
✓ tests/integration/payments.test.ts > pricing snapshot > rate and policy edits do not change a confirmed booking; a date change re-prices with an audited delta 330ms
✓ tests/integration/payments.test.ts > email failure > a failing email provider never cancels a paid booking; messages retry and failures are visible 309ms
✓ tests/integration/pricing-reports-config.test.ts > pricing engine > applies documented precedence: date override > seasonal rule (priority) > weekend > base 270ms
✓ tests/integration/pricing-reports-config.test.ts > pricing engine > charges extra guests per night, adults first, and only when configured 155ms
✓ tests/integration/pricing-reports-config.test.ts > pricing engine > taxes are off by default, and when confirmed are computed per slab with half-up paise rounding 168ms
✓ tests/integration/pricing-reports-config.test.ts > pricing engine > advance payment rule splits due-now and balance; money parsing is exact 206ms
✓ tests/integration/pricing-reports-config.test.ts > reports match a seeded scenario > separates stay revenue, collections, refunds, balances, occupancy and sources 437ms
✓ tests/integration/pricing-reports-config.test.ts > integration honesty & production safety > missing gateway closes online booking; nothing pretends to succeed 198ms
✓ tests/integration/pricing-reports-config.test.ts > integration honesty & production safety > missing email provider marks messages blocked (never 'sent'); demo adapters are refused in production 206ms
✓ tests/integration/pricing-reports-config.test.ts > integration honesty & production safety > production hides sample reviews/photos/policies and requires every blocking setup item 194ms
✓ tests/integration/pricing-reports-config.test.ts > check-in rules > cannot check in before the arrival date 224ms
✓ tests/integration/permissions.test.ts > server actions enforce permissions regardless of UI > unauthenticated and non-staff (public guest account) requests are rejected 387ms
✓ tests/integration/permissions.test.ts > server actions enforce permissions regardless of UI > reception is denied refunds, rates, settings, staff, content and blocks — but can operate reservations 416ms
✓ tests/integration/permissions.test.ts > server actions enforce permissions regardless of UI > content editor cannot touch reservations, guests or money 297ms
✓ tests/integration/permissions.test.ts > server actions enforce permissions regardless of UI > deactivated staff lose access immediately; the last owner cannot be removed 286ms
✓ tests/integration/permissions.test.ts > server actions enforce permissions regardless of UI > owner can refund within limits; refunds are audited 290ms
```

## End-to-end tests (Playwright)
```
[chromium] › tests/e2e/admin.spec.ts:5:7 › staff journeys › owner: offline phone booking blocks the website sale for the last unit (3.3s)
[chromium] › tests/e2e/admin.spec.ts:25:7 › staff journeys › reception sees no refund controls and is redirected from owner modules (3.8s)
[chromium] › tests/e2e/admin.spec.ts:41:7 › staff journeys › content editor: no reservation or guest data, can edit and preview content (2.3s)
[chromium] › tests/e2e/admin.spec.ts:56:7 › staff journeys › calendar shows bookings and holds with a legend; persistence survives reload (2.5s)
[chromium] › tests/e2e/guest.spec.ts:5:7 › guest journeys › book without an account, then manage via reference + one-time code (4.1s)
[chromium] › tests/e2e/guest.spec.ts:35:7 › guest journeys › guest A cannot see guest B's booking, confirmation or receipt by changing the reference (5.0s)
[chromium] › tests/e2e/guest.spec.ts:60:7 › guest journeys › closed browser after payment is recovered by checking with the gateway (1.9s)
[chromium] › tests/e2e/guest.spec.ts:70:7 › guest journeys › failed payment does not confirm; invalid dates are rejected server-side (1.9s)
[chromium] › tests/e2e/guest.spec.ts:81:7 › guest journeys › enquiry form persists submissions (not just a toast) (3.4s)
[chromium] › tests/e2e/ui.spec.ts:4:7 › accessibility & responsive UI › gallery filters and lightbox work with the keyboard and restore focus (940ms)
[chromium] › tests/e2e/ui.spec.ts:24:9 › accessibility & responsive UI › no horizontal overflow at 360px (1.6s)
[chromium] › tests/e2e/ui.spec.ts:24:9 › accessibility & responsive UI › no horizontal overflow at 768px (1.7s)
[chromium] › tests/e2e/ui.spec.ts:24:9 › accessibility & responsive UI › no horizontal overflow at 1024px (2.0s)
[chromium] › tests/e2e/ui.spec.ts:24:9 › accessibility & responsive UI › no horizontal overflow at 1440px (1.9s)
[chromium] › tests/e2e/ui.spec.ts:34:7 › accessibility & responsive UI › mobile menu and booking bar (912ms)
[chromium] › tests/e2e/ui.spec.ts:49:7 › accessibility & responsive UI › private pages are not indexable; public pages have canonical + structured data without ratings (606ms)
```

## Acceptance checklist mapping (brief §14)
| Check | Evidence |
|---|---|
| Visual review | `docs/screenshots/{home,gallery,reviews,rooms,book}-{360,768,1024,1440}.png`, plus admin screenshots; mapping in the README |
| Persistence | Admin settings survive a reload (e2e); every entity is stored in PostgreSQL; e2e runs against `next start` |
| Guest checkout | e2e “book without an account, then manage via reference + one-time code” |
| Account isolation | e2e “guest A cannot see guest B's booking…”; integration “a booking reference + email alone never grants access” |
| Staff permissions | integration `permissions.test.ts` (real server actions called directly); e2e reception/content journeys and CSV 403s |
| Date validation | integration “rejects invalid ranges, past dates, occupancy, closures, min-stay and blocks”; e2e invalid range |
| Continuous stay | integration “never creates an impossible split stay” |
| Simultaneous final-room attempts | integration (6 concurrent attempts → exactly 1 succeeds, no duplicate unit-nights) |
| Multi-room request | integration “all rooms atomically or nothing” |
| Adjacent stays | integration “departure and next arrival on the same date” |
| Hold expiry | integration “abandoned holds release inventory…” |
| Payment verification | integration “altered signature, order or amount cannot confirm” |
| Payment recovery | integration reconciliation test; e2e “closed browser … recovered” |
| Duplicate notifications | integration “duplicate and out-of-order notifications …” |
| Late payment | integration “never oversells … staff exception” and “re-allocates when free” |
| Pricing snapshot | integration “rate and policy edits do not change a confirmed booking” |
| Cancellation/refund | integration “cancellation releases stock immediately while refunds progress …” |
| Offline booking | integration + e2e “offline phone booking blocks the website sale” |
| Email failure | integration “a failing email provider never cancels a paid booking …” |
| Reporting | integration “reports match a seeded scenario” |
| Integration honesty | integration “missing gateway closes online booking …”, “missing email provider marks messages blocked …” |
| Production content | integration “production hides sample reviews/photos/policies …”; no default credentials (demo staff passwords are random, written to a gitignored file) |
| Deployment | Fresh setup used for every e2e run: drop schema → migrate → seed → `next start`. Hosted deployment was **not** performed (by instruction). |

## Not tested here (requires client credentials or network)
- Razorpay sandbox calls (orders, payments, refunds, webhook delivery). The adapter follows the documented API and signature scheme; all payment logic was exercised through the DEMO adapter, which implements the same interface.
- Real SMTP delivery, S3 uploads, Vercel/host cron, and two-factor enrolment with a real authenticator app (the UI and flow are built).
- Screen-reader testing with NVDA/VoiceOver. Keyboard navigation of the lightbox, forms and menus was tested automatically.

## Measured page weight and timing (local production build, 1440 px, uncompressed bytes, no CDN)
| Page | JS | CSS | Images | Fonts | TTFB | LCP | CLS |
|---|---|---|---|---|---|---|---|
| / | 478 KB | 62 KB | 152 KB | 111 KB | 31 ms | 292 ms | 0.022 |
| /gallery | 478 KB | 62 KB | 267 KB | 93 KB | 27 ms | 216 ms | 0 |
| /reviews | 471 KB | 62 KB | 58 KB | 93 KB | 28 ms | 176 ms | 0.003 |
| /book | 471 KB | 62 KB | 0 KB | 93 KB | 23 ms | 152 ms | 0 |

These are localhost lab numbers, not field Core Web Vitals. Measure again on the production host with Lighthouse or CrUX.
