# Business inputs still required from Room2Go

Nothing in this list was invented. The demo seed uses clearly flagged SAMPLE values (sample units `DEMO-E1/E2/S1`, sample rates ₹1,000/₹2,000, SAMPLE policies, design-sample testimonials, illustrative photos cropped from the design references). Production hides or refuses all of them. Live instant booking stays closed until every **required** item below is done. The admin **Settings → Launch checklist** tracks this automatically.

| # | Input | Decision needed | Where to enter it | Required for live booking |
|---|---|---|---|---|
| 1 | Accommodation categories | Confirm the categories are Executive Room and Suite Room (design labels), or supply the real ones | Admin → Rooms & units | Yes |
| 2 | Physical units | Unit identifiers and counts per category; which units are sold online and which are kept for other channels | Admin → Rooms & units | Yes |
| 3 | Occupancy | Beds, size, guests included in the rate, maximum adults/children, extra-bed rules | Admin → Rooms & units → Edit category (tick “Facts confirmed”) | Yes |
| 4 | Prices | Base and weekend rates, seasonal rules, extra-guest charges, inclusions, minimum stays | Admin → Rates (tick “approved”) | Yes |
| 5 | Payment rule | Full payment or advance percentage; how the balance is collected | Admin → Settings → Booking, then Confirm | Yes |
| 6 | Payment gateway | Room2Go's own Razorpay merchant account (KYC, settlement bank) — not the agency's; test then live keys; webhook secret | Server environment variables | Yes |
| 7 | Refund authority | Who may approve refunds (built in: owner role only) | Admin → Staff | Yes |
| 8 | Policies | Booking terms, cancellation/refund policy (including no-show and changes), privacy policy, house rules — approved text | Admin → Policies (owner ticks “Approved”) | Yes (house rules recommended) |
| 9 | Check-in/out | Check-in and check-out times. Note: 24/7 support is a separate matter and does not imply 24-hour check-in. | Admin → Settings | Yes |
| 10 | Tax | Applicable tax lines and slabs as confirmed by the accountant, **or** confirmation that none apply. No GST rate or number is pre-filled. | Admin → Settings → Tax, then Confirm | Yes |
| 11 | Invoices | Legal invoice name and address, tax registration number, invoice prefix. Tax invoices stay off until these are set. | Admin → Settings | No (payment receipts work without it) |
| 12 | Channels / PMS | Does Room2Go use a PMS, channel manager or OTAs? Until an integration is supplied, external bookings must be entered manually (or entered as “External booking” blocks). Confirm this process. | Admin → Settings → Confirm “Channel / OTA process” | Yes |
| 13 | Contact | The brief's address, phone and email are pre-confirmed. Still needed: the exact map pin and directions link. | Admin → Settings | Map recommended |
| 14 | WhatsApp | Approved WhatsApp destination. The previous site lists **+91 96328 18611**, separate from the phone number. This is unconfirmed, so it is not used. | Admin → Settings, then Confirm | No (the button stays hidden until confirmed) |
| 15 | Notifications | Staff email address(es) for new-booking, enquiry and exception alerts | Admin → Settings | Recommended |
| 16 | Email sender | Sending domain or mailbox (SMTP or provider), with SPF/DKIM on roomtogo.in | Environment variables | Yes |
| 17 | Photos and logo | Real property photos and the approved logo file. The current wordmark is typeset in the brand font as a placeholder. | Admin → Photos & gallery | Recommended |
| 18 | Amenities | Verify each facility from the old site (Wi-Fi, restaurant, parking, 24/7 assistance, room service, laundry, travel assistance): is it shared or private, included or chargeable? | Admin → Amenities (owner ticks “Verified”) | Unverified items are hidden in production |
| 19 | Reviews | Genuine guest reviews with permission to publish, plus their source. The old site's three named testimonials are not imported, because their provenance is unknown. | Admin → Reviews | No (the section is hidden or shows an invitation when there are none) |
| 20 | About text | The approved property story | Admin → Page content → About | Recommended |
| 21 | Hosting | Domain/DNS access for roomtogo.in, hosting account, PostgreSQL, S3 storage, scheduler, backups, and who maintains them | — | Yes |
| 22 | Data retention | How long guest contact details are kept after checkout (an anonymisation job exists but is off by default) | Admin → Settings | Recommended |
| 23 | Legacy URLs | The old site was a single page (`/index.html` with #anchors), which already redirects to `/`. Supply any other indexed URLs that need redirects. | `next.config.ts` redirects | Before DNS switch |
