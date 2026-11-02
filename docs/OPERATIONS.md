# Operations, deployment and recovery

## Hosting requirements
- A **Node.js 20.9+** host for Next.js 16 (Vercel, Render, Fly.io, a VM or a container).
- **PostgreSQL 14+** with the standard extensions only. Uses `gen_random_uuid()`; no extensions are needed. Managed providers such as Neon, RDS and Supabase work.
- **S3-compatible object storage** for uploaded photos (S3, R2, B2…). Local disk is refused in production because the app must not depend on one machine's filesystem.
- **A scheduler**: hit `GET /api/cron/all` with `Authorization: Bearer $CRON_SECRET` every 1–5 minutes. Alternatively, run `npm run worker` as a long-running process.
- **SMTP or another transactional email sender** for roomtogo.in, with SPF and DKIM.
- **Razorpay**: Room2Go's own merchant account and a webhook pointing at `https://<domain>/api/webhooks/razorpay`.

## Deploying
```bash
npm ci
npm run db:migrate            # apply drizzle/*.sql
npm run db:seed:base          # first deploy only: settings row (enquiry-only), gallery categories, draft amenities
npm run build && npm start    # or your platform's build/start
```
Then:
1. Open `/admin/setup?token=$SETUP_TOKEN` and create the owner. The page returns 404 once any staff account exists.
2. Sign in and enable two-factor authentication (required for owners in production).
3. Work through **Settings → Launch checklist**. Invite staff from **Staff**.
4. Switch **Booking mode → Instant** only after every required item is green, starting with Razorpay **test** keys on a staging site.
5. Live keys need `ALLOW_LIVE_PAYMENTS=true` as well. That is a deliberate owner decision.

Vercel example (`vercel.json`):
```json
{ "crons": [{ "path": "/api/cron/all", "schedule": "*/5 * * * *" }] }
```
Set `CRON_SECRET` in the project. Vercel Cron sends it as a Bearer token.

## Jobs
| Job | What it does | Cadence |
|---|---|---|
| `expire-holds` | Expires overdue checkout holds and frees their nights. Also runs inside every allocation. | 1–5 min |
| `outbox` | Sends queued emails with retry and backoff; resets stuck sends | 1–5 min |
| `reconcile` | Checks unresolved Razorpay orders (closed browser, missed webhook) and refunds still processing | 5 min |
| `review-invites` | One invitation per checked-out booking (if enabled) | hourly/daily |
| `pre-arrival` | Reminder N days before arrival (if configured) | daily |
| `retention` | Anonymises guest contact details after the retention period (if configured) | daily |

`GET /api/health` reports database status and warns if `expire-holds` hasn't run in 15 minutes. **Admin → Integrations** shows each job's last run and error, plus outbox counts.

## Recovery playbook
- **A guest paid but sees no confirmation.** Open the booking and click *Check with gateway*, or *Payments → Reconcile*. If the hold had expired and the room was resold, an open **payment exception** shows on the booking. Move the guest to another unit, or refund from the payment row, then mark the exception resolved.
- **Duplicate payment.** The second payment is flagged `excess` and raises an exception. Refund that payment from the booking.
- **A refund is stuck in “processing”.** Reconciliation polls the provider. Check the Razorpay dashboard. A failed refund raises an exception.
- **Email outage.** Bookings are unaffected. Fix the configuration, then use *Messages → Retry all failed / blocked*.
- **An external OTA booking arrives.** Create a *New reservation* with source *External platform* (or an *External booking* block) **before** the website can sell those dates.

## Backups and restore
- Enable your provider's automated daily backups with point-in-time recovery (Neon, RDS and Supabase all offer this). Keep 7–30 days.
- A logical backup is also possible: `pg_dump --format=custom "$DATABASE_URL" > room2go-$(date +%F).dump`, stored off-site and encrypted.
- To restore into a new database: `pg_restore --no-owner --dbname "$NEW_DATABASE_URL" room2go-YYYY-MM-DD.dump`. Point `DATABASE_URL` at it, run `npm run db:migrate` (a no-op if current), then *Reconcile* payments to catch anything that happened after the backup.
- Object storage: enable bucket versioning. Media rows reference storage keys.
- Test a restore at least quarterly.

## Monitoring
- Uptime: `/api/health`.
- Errors: connect your platform's log drain or error monitoring (for example Sentry) to the Node runtime. Application errors are logged server-side only. Guests see a generic message, and personal data is kept out of URLs and analytics.

## Security notes
- Every admin server action checks `requireStaff(permission)`. Role matrix: `src/lib/permissions.ts`.
- Security headers are set in `next.config.ts`. `noindex` and `no-store` apply to admin, account, checkout, booking, documents and API routes.
- Uploaded images are decoded and re-encoded to WebP, which strips EXIF and GPS data. Only JPEG, PNG and WebP up to 10 MB are accepted.
- Card data never reaches this application: Razorpay's hosted checkout handles it. Gateway secrets live only in server environment variables.
- Public forms use a honeypot, a minimum fill time and per-client rate limits stored in Postgres. Better Auth has its own database-backed rate limits.

## Staff guide (short)
- **Rooms & units**: a category is what guests book; a unit is the physical room. Set a unit to *inactive* rather than deleting it. The system blocks changes that would break upcoming stays.
- **Rates**: base and weekend rates, seasonal rules (with priority) and date overrides (rate, minimum stay, closed, closed-to-arrival). The 14-night grid shows what guests will be charged.
- **Availability**: maintenance, owner-use, closure and external-booking blocks. A block cannot overwrite an existing reservation.
- **Reservations**: check in and out, no-show, reassign a unit, cancel, date change (with a price-difference preview), adjustments (owner), notes and resend confirmation.
- **Content**: save a draft, preview it, then publish. Policies are versioned, and bookings keep the version the guest accepted.
