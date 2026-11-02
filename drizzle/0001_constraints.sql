-- Hand-written integrity constraints (Drizzle cannot express CHECK constraints in this version's schema DSL).
ALTER TABLE "unit_nights" ADD CONSTRAINT "unit_nights_one_owner_ck" CHECK (
  (kind = 'booking' AND booking_unit_id IS NOT NULL AND block_id IS NULL) OR
  (kind = 'block' AND block_id IS NOT NULL AND booking_unit_id IS NULL)
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_dates_ck" CHECK (check_out > check_in AND nights = (check_out - check_in));
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guests_ck" CHECK (adults >= 1 AND children >= 0 AND rooms_count >= 1);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_money_ck" CHECK (
  subtotal_paise >= 0 AND extras_paise >= 0 AND discount_paise >= 0 AND tax_paise >= 0 AND total_paise >= 0
  AND due_now_paise >= 0 AND due_now_paise <= total_paise AND amount_paid_paise >= 0 AND amount_refunded_paise >= 0
  AND amount_refunded_paise <= amount_paid_paise
);
--> statement-breakpoint
ALTER TABLE "booking_units" ADD CONSTRAINT "booking_units_guests_ck" CHECK (adults >= 1 AND children >= 0);
--> statement-breakpoint
ALTER TABLE "booking_nights" ADD CONSTRAINT "booking_nights_money_ck" CHECK (rate_paise >= 0 AND extra_guest_paise >= 0);
--> statement-breakpoint
ALTER TABLE "availability_blocks" ADD CONSTRAINT "blocks_dates_ck" CHECK (end_date > start_date);
--> statement-breakpoint
ALTER TABLE "rate_rules" ADD CONSTRAINT "rate_rules_ck" CHECK (end_date >= start_date AND rate_paise >= 0);
--> statement-breakpoint
ALTER TABLE "date_rates" ADD CONSTRAINT "date_rates_ck" CHECK (rate_paise IS NULL OR rate_paise >= 0);
--> statement-breakpoint
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_occupancy_ck" CHECK (
  base_occupancy >= 1 AND max_adults >= 1 AND max_children >= 0 AND max_occupancy >= base_occupancy
  AND max_occupancy >= 1 AND extra_beds_allowed >= 0 AND min_stay_nights >= 1
  AND (base_rate_paise IS NULL OR base_rate_paise >= 0) AND (weekend_rate_paise IS NULL OR weekend_rate_paise >= 0)
  AND extra_adult_paise >= 0 AND extra_child_paise >= 0
);
--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_txn_amount_ck" CHECK (amount_paise > 0);
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_amount_ck" CHECK (amount_paise > 0);
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_ck" CHECK (amount_paise > 0);
--> statement-breakpoint
ALTER TABLE "property_settings" ADD CONSTRAINT "property_settings_singleton_ck" CHECK (
  id = 1 AND advance_percent BETWEEN 1 AND 100 AND hold_minutes BETWEEN 2 AND 120 AND max_rooms_per_booking BETWEEN 1 AND 20
);
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_ck" CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);
--> statement-breakpoint
-- Only one active staff owner is not required, but at most one open exception per (booking, txn, kind)
CREATE UNIQUE INDEX "payment_exceptions_dedupe_uq" ON "payment_exceptions" (booking_id, kind, coalesce(payment_transaction_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE status = 'open';
