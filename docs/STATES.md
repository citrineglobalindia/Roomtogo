# State-transition map

## Reservation (`bookings.status`) and its effect on inventory (`unit_nights`)

| State | Meaning | Inventory |
|---|---|---|
| `pending_payment` | Website checkout hold created; guest is paying | Nights **held** on specific units until `inventory_holds.expires_at` (default 10 min, configurable). Searches treat an expired, not-yet-swept hold as free. |
| `confirmed` | Payment verified (website) or staff-entered booking | Nights occupied |
| `checked_in` | Guest arrived | Nights occupied |
| `checked_out` | Guest left | Past nights kept for history; nights from today are released on early departure |
| `no_show` | Guest did not arrive | Nights from today onward released |
| `cancelled` | Approved cancellation (staff) | All nights released immediately, even while a refund is still processing |
| `expired` | Hold expired without payment | All nights released |

```
pending_payment ──payment verified (hold active)──────────────▶ confirmed
pending_payment ──hold expires (job or any new allocation)────▶ expired
expired ──late payment AND units still free (transactional)───▶ confirmed
expired ──late payment, units taken──▶ stays expired + payment_exception "paid_after_hold_expired" (refund / alternative)
confirmed ──▶ checked_in ──▶ checked_out
confirmed ──▶ no_show
pending_payment | confirmed ──staff cancel──▶ cancelled
```

Guest **requests** (`booking_requests`: requested → approved | rejected) never change a booking by themselves. Staff approve them through the cancellation or date-change workflow, which shows a fresh availability check and the price difference before anything changes.

## Hold (`inventory_holds.status`)
`active → converted` (payment confirmed) · `active → expired` (time passed) · `active → released` (booking cancelled).

## Payment status (`bookings.payment_status`)
This is derived from the ledger after every money change: `unpaid` · `partially_paid` · `paid` · `overpaid` (for example a duplicate payment, which is flagged for refund). The net amount is captured payments minus **succeeded** refunds.

## Payment order (`payment_orders.status`)
`created → attempted → paid`, or `created → attempted` and stays open for retries. `cancelled` is for orders on cancelled bookings. Status only moves forward, so a late `payment.failed` notification never downgrades a paid order. A retry reuses the open order for the same amount.

## Payment transaction (`payment_transactions`)
- `channel = gateway`: inserted only after the checkout signature is valid **and** the payment has been fetched from the provider (order id, amount, currency and captured status all checked). There is a unique key on `(provider, provider_payment_id)`.
- `channel = offline`: recorded by staff (cash, UPI to property, bank transfer, card terminal) with method, reference, staff id and timestamp.
- `is_excess = true`: a successful payment beyond what was due. It raises an exception and never allocates rooms.

## Refund (`refunds.status`)
`requested → processing → succeeded | failed`.
- `requested` is written before the provider is called. A row lock on the payment, plus a cap of `amount − (requested + processing + succeeded)`, prevents duplicate or excessive refunds.
- `succeeded` is set only when the provider confirms it, through the `refund.processed` webhook or reconciliation. Offline refunds are recorded as succeeded by the owner.
- `failed` raises a `refund_failed` exception.

## Gateway events (`gateway_events`)
Unique on `(provider, event_id)`. Duplicate deliveries return `duplicate`; the error status is retried by the provider.

## Payment exceptions (`payment_exceptions.status`)
`open → resolved`, with a resolution text and the staff member's id. Kinds: `paid_after_hold_expired`, `excess_payment`, `amount_mismatch`, `refund_failed`, `paid_for_cancelled_booking`, `reconciliation_failed`. A partial unique index stops duplicate open exceptions.

## Outbox (`notification_outbox.status`)
`pending → sending → sent`. On error the message goes to `failed`, with backoff retry up to `max_attempts`. `captured_demo` means demo mode: the message is not delivered. `blocked_unconfigured` means no provider is configured; staff can re-queue these after configuring email. Dedupe keys make sure each message is created only once.

## Enquiry
`new → contacted → quoted → closed`, with notes and a follow-up date.

## Review
`pending → approved | rejected`. Approval requires `consent_to_publish`. `source = sample` can never be published in production.
