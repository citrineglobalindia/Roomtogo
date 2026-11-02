CREATE TYPE "public"."active_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."amenity_charge" AS ENUM('included', 'chargeable', 'on_request', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."amenity_scope" AS ENUM('in_room', 'shared', 'service');--> statement-breakpoint
CREATE TYPE "public"."block_kind" AS ENUM('maintenance', 'owner_use', 'closure', 'external');--> statement-breakpoint
CREATE TYPE "public"."booking_mode" AS ENUM('enquiry_only', 'instant');--> statement-breakpoint
CREATE TYPE "public"."booking_source" AS ENUM('website', 'phone', 'whatsapp', 'walk_in', 'email', 'external_ota', 'other');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending_payment', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show', 'expired');--> statement-breakpoint
CREATE TYPE "public"."enquiry_kind" AS ENUM('general', 'extended_stay', 'corporate', 'booking');--> statement-breakpoint
CREATE TYPE "public"."enquiry_status" AS ENUM('new', 'contacted', 'quoted', 'closed');--> statement-breakpoint
CREATE TYPE "public"."exception_kind" AS ENUM('paid_after_hold_expired', 'excess_payment', 'amount_mismatch', 'refund_failed', 'reconciliation_failed', 'paid_for_cancelled_booking');--> statement-breakpoint
CREATE TYPE "public"."hold_status" AS ENUM('active', 'converted', 'expired', 'released');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'sending', 'sent', 'failed', 'captured_demo', 'blocked_unconfigured');--> statement-breakpoint
CREATE TYPE "public"."payment_channel" AS ENUM('gateway', 'offline');--> statement-breakpoint
CREATE TYPE "public"."payment_order_status" AS ENUM('created', 'attempted', 'paid', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_rule" AS ENUM('full', 'advance');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'partially_paid', 'paid', 'overpaid');--> statement-breakpoint
CREATE TYPE "public"."payment_txn_status" AS ENUM('captured', 'failed', 'pending');--> statement-breakpoint
CREATE TYPE "public"."policy_kind" AS ENUM('privacy', 'terms', 'cancellation', 'house_rules');--> statement-breakpoint
CREATE TYPE "public"."publish_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('requested', 'processing', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."request_kind" AS ENUM('cancellation', 'date_change');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('requested', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."review_source" AS ENUM('website_form', 'stay_invitation', 'google', 'booking_com', 'email', 'other', 'sample');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('owner', 'reception', 'content');--> statement-breakpoint
CREATE TYPE "public"."unit_night_kind" AS ENUM('booking', 'block');--> statement-breakpoint
CREATE TABLE "access_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amenities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text DEFAULT 'check' NOT NULL,
	"scope" "amenity_scope" DEFAULT 'shared' NOT NULL,
	"charge" "amenity_charge" DEFAULT 'unknown' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"show_in_strip" boolean DEFAULT false NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"actor_label" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"kind" "block_kind" DEFAULT 'maintenance' NOT NULL,
	"reason" text NOT NULL,
	"created_by_staff_id" uuid,
	"released_at" timestamp with time zone,
	"released_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"reason" text NOT NULL,
	"kind" text DEFAULT 'manual' NOT NULL,
	"staff_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_nights" (
	"booking_unit_id" uuid NOT NULL,
	"night" date NOT NULL,
	"rate_paise" integer NOT NULL,
	"extra_guest_paise" integer DEFAULT 0 NOT NULL,
	"rate_source" text NOT NULL,
	CONSTRAINT "booking_nights_booking_unit_id_night_pk" PRIMARY KEY("booking_unit_id","night")
);
--> statement-breakpoint
CREATE TABLE "booking_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"kind" "request_kind" NOT NULL,
	"status" "request_status" DEFAULT 'requested' NOT NULL,
	"requested_check_in" date,
	"requested_check_out" date,
	"guest_message" text,
	"staff_response" text,
	"resolved_by_staff_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"adults" integer NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"status" "booking_status" NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"source" "booking_source" DEFAULT 'website' NOT NULL,
	"external_ref" text,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"nights" integer NOT NULL,
	"adults" integer NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"rooms_count" integer NOT NULL,
	"guest_id" uuid NOT NULL,
	"user_id" text,
	"lead_name" text NOT NULL,
	"lead_email" text NOT NULL,
	"lead_phone" text NOT NULL,
	"arrival_eta" text,
	"special_requests" text,
	"currency" text DEFAULT 'INR' NOT NULL,
	"subtotal_paise" integer NOT NULL,
	"extras_paise" integer DEFAULT 0 NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"tax_paise" integer DEFAULT 0 NOT NULL,
	"total_paise" integer NOT NULL,
	"due_now_paise" integer NOT NULL,
	"amount_paid_paise" integer DEFAULT 0 NOT NULL,
	"amount_refunded_paise" integer DEFAULT 0 NOT NULL,
	"price_snapshot" jsonb NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"policy_accepted_at" timestamp with time zone,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"manage_token_hash" text,
	"manage_token_expires_at" timestamp with time zone,
	"created_by_staff_id" uuid,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"checked_in_at" timestamp with time zone,
	"checked_out_at" timestamp with time zone,
	"conversion_tracked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "content_blocks" (
	"key" text PRIMARY KEY NOT NULL,
	"draft" jsonb NOT NULL,
	"published" jsonb,
	"published_at" timestamp with time zone,
	"updated_by_staff_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "date_rates" (
	"room_type_id" uuid NOT NULL,
	"night" date NOT NULL,
	"rate_paise" integer,
	"min_stay_nights" integer,
	"closed" boolean DEFAULT false NOT NULL,
	"closed_to_arrival" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "date_rates_room_type_id_night_pk" PRIMARY KEY("room_type_id","night")
);
--> statement-breakpoint
CREATE TABLE "demo_gateway_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"refunded_paise" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "enquiry_kind" NOT NULL,
	"status" "enquiry_status" DEFAULT 'new' NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"company" text,
	"check_in" date,
	"check_out" date,
	"guests" integer,
	"rooms_count" integer,
	"stay_length" text,
	"message" text NOT NULL,
	"follow_up_date" date,
	"assigned_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiry_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enquiry_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "gallery_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "gateway_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "guest_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"user_id" text,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"marketing_opt_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"status" "hold_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_holds_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"job" text PRIMARY KEY NOT NULL,
	"last_started_at" timestamp with time zone,
	"last_finished_at" timestamp with time zone,
	"last_status" text,
	"last_error" text,
	"last_result" jsonb
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"url" text NOT NULL,
	"alt" text NOT NULL,
	"caption" text,
	"width" integer,
	"height" integer,
	"mime_type" text NOT NULL,
	"bytes" integer,
	"is_sample" boolean DEFAULT false NOT NULL,
	"category_id" uuid,
	"room_type_id" uuid,
	"in_gallery" boolean DEFAULT true NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"uploaded_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"template" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"text" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"booking_id" uuid,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 6 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"provider_message_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_outbox_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "payment_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"payment_transaction_id" uuid,
	"kind" "exception_kind" NOT NULL,
	"details" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_by_staff_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_mode" text NOT NULL,
	"provider_order_id" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"purpose" text DEFAULT 'booking' NOT NULL,
	"status" "payment_order_status" DEFAULT 'created' NOT NULL,
	"last_reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"payment_order_id" uuid,
	"channel" "payment_channel" NOT NULL,
	"provider" text,
	"provider_payment_id" text,
	"method" text,
	"reference" text,
	"amount_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" "payment_txn_status" NOT NULL,
	"verified_via" text,
	"is_excess" boolean DEFAULT false NOT NULL,
	"recorded_by_staff_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "policy_kind" NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"rules" jsonb,
	"is_sample" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text DEFAULT 'Room2Go' NOT NULL,
	"legal_name" text,
	"address_line" text NOT NULL,
	"locality" text,
	"city" text NOT NULL,
	"region" text NOT NULL,
	"postal_code" text NOT NULL,
	"country" text DEFAULT 'IN' NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"whatsapp_number" text,
	"map_lat" text,
	"map_lng" text,
	"map_url" text,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"check_in_time" text,
	"check_out_time" text,
	"hold_minutes" integer DEFAULT 10 NOT NULL,
	"booking_mode" "booking_mode" DEFAULT 'enquiry_only' NOT NULL,
	"payment_rule" "payment_rule" DEFAULT 'full' NOT NULL,
	"advance_percent" integer DEFAULT 100 NOT NULL,
	"max_rooms_per_booking" integer DEFAULT 4 NOT NULL,
	"booking_window_days" integer DEFAULT 365 NOT NULL,
	"tax_enabled" boolean DEFAULT false NOT NULL,
	"tax_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tax_invoices_enabled" boolean DEFAULT false NOT NULL,
	"tax_registration_number" text,
	"invoice_prefix" text DEFAULT 'R2G' NOT NULL,
	"notification_emails" text[] DEFAULT '{}'::text[] NOT NULL,
	"social_links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"review_invites_enabled" boolean DEFAULT false NOT NULL,
	"pre_arrival_reminder_days" integer,
	"guest_data_retention_days" integer,
	"confirmed_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "rate_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"days_of_week" integer[],
	"rate_paise" integer NOT NULL,
	"min_stay_nights" integer,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"payment_transaction_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"status" "refund_status" DEFAULT 'requested' NOT NULL,
	"provider" text,
	"provider_refund_id" text,
	"channel" "payment_channel" NOT NULL,
	"reason" text NOT NULL,
	"failure_reason" text,
	"requested_by_staff_id" uuid NOT NULL,
	"approved_by_staff_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_invitations_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_name" text NOT NULL,
	"display_label" text,
	"email" text,
	"rating" integer,
	"title" text,
	"body" text NOT NULL,
	"stay_month" text,
	"source" "review_source" NOT NULL,
	"source_url" text,
	"booking_id" uuid,
	"consent_to_publish" boolean DEFAULT false NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"moderated_by_staff_id" uuid,
	"moderated_at" timestamp with time zone,
	"moderation_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_type_amenities" (
	"room_type_id" uuid NOT NULL,
	"amenity_id" uuid NOT NULL,
	CONSTRAINT "room_type_amenities_room_type_id_amenity_id_pk" PRIMARY KEY("room_type_id","amenity_id")
);
--> statement-breakpoint
CREATE TABLE "room_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"bed_configuration" text,
	"size_sqft" integer,
	"base_occupancy" integer DEFAULT 2 NOT NULL,
	"max_adults" integer DEFAULT 2 NOT NULL,
	"max_children" integer DEFAULT 0 NOT NULL,
	"max_occupancy" integer DEFAULT 2 NOT NULL,
	"extra_beds_allowed" integer DEFAULT 0 NOT NULL,
	"inclusions" text[] DEFAULT '{}'::text[] NOT NULL,
	"base_rate_paise" integer,
	"weekend_rate_paise" integer,
	"weekend_days" integer[] DEFAULT '{5,6}'::int[] NOT NULL,
	"extra_adult_paise" integer DEFAULT 0 NOT NULL,
	"extra_child_paise" integer DEFAULT 0 NOT NULL,
	"min_stay_nights" integer DEFAULT 1 NOT NULL,
	"rates_are_sample" boolean DEFAULT false NOT NULL,
	"facts_confirmed" boolean DEFAULT false NOT NULL,
	"cover_media_id" uuid,
	"status" "active_status" DEFAULT 'active' NOT NULL,
	"public_status" "publish_status" DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_types_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "room_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_type_id" uuid NOT NULL,
	"label" text NOT NULL,
	"floor" text,
	"status" "active_status" DEFAULT 'active' NOT NULL,
	"direct_sale" boolean DEFAULT true NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_units_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "staff_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_members_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "unit_nights" (
	"unit_id" uuid NOT NULL,
	"night" date NOT NULL,
	"kind" "unit_night_kind" NOT NULL,
	"booking_unit_id" uuid,
	"block_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_nights_unit_id_night_pk" PRIMARY KEY("unit_id","night")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_challenges" ADD CONSTRAINT "access_challenges_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_unit_id_room_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."room_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_adjustments" ADD CONSTRAINT "booking_adjustments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_nights" ADD CONSTRAINT "booking_nights_booking_unit_id_booking_units_id_fk" FOREIGN KEY ("booking_unit_id") REFERENCES "public"."booking_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_notes" ADD CONSTRAINT "booking_notes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_units" ADD CONSTRAINT "booking_units_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_units" ADD CONSTRAINT "booking_units_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_units" ADD CONSTRAINT "booking_units_unit_id_room_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."room_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_rates" ADD CONSTRAINT "date_rates_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry_notes" ADD CONSTRAINT "enquiry_notes_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_notes" ADD CONSTRAINT "guest_notes_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_holds" ADD CONSTRAINT "inventory_holds_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_category_id_gallery_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."gallery_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_payment_transaction_id_payment_transactions_id_fk" FOREIGN KEY ("payment_transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_order_id_payment_orders_id_fk" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_rules" ADD CONSTRAINT "rate_rules_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_transaction_id_payment_transactions_id_fk" FOREIGN KEY ("payment_transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_invitations" ADD CONSTRAINT "review_invitations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_type_amenities" ADD CONSTRAINT "room_type_amenities_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_type_amenities" ADD CONSTRAINT "room_type_amenities_amenity_id_amenities_id_fk" FOREIGN KEY ("amenity_id") REFERENCES "public"."amenities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_units" ADD CONSTRAINT "room_units_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_nights" ADD CONSTRAINT "unit_nights_unit_id_room_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."room_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_nights" ADD CONSTRAINT "unit_nights_booking_unit_id_booking_units_id_fk" FOREIGN KEY ("booking_unit_id") REFERENCES "public"."booking_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_nights" ADD CONSTRAINT "unit_nights_block_id_availability_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."availability_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_challenges_booking_idx" ON "access_challenges" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "blocks_unit_idx" ON "availability_blocks" USING btree ("unit_id","start_date");--> statement-breakpoint
CREATE INDEX "booking_requests_booking_idx" ON "booking_requests" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_units_booking_idx" ON "booking_units" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_units_unit_idx" ON "booking_units" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "bookings_dates_idx" ON "bookings" USING btree ("check_in","check_out");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bookings_guest_idx" ON "bookings" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "bookings_user_idx" ON "bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bookings_email_idx" ON "bookings" USING btree (lower("lead_email"));--> statement-breakpoint
CREATE INDEX "enquiries_status_idx" ON "enquiries" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_events_uq" ON "gateway_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guests_email_uq" ON "guests" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "holds_active_expiry_idx" ON "inventory_holds" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "media_category_idx" ON "media_assets" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "media_room_type_idx" ON "media_assets" USING btree ("room_type_id");--> statement-breakpoint
CREATE INDEX "outbox_due_idx" ON "notification_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "outbox_booking_idx" ON "notification_outbox" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payment_exceptions_status_idx" ON "payment_exceptions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_orders_provider_order_uq" ON "payment_orders" USING btree ("provider","provider_order_id");--> statement-breakpoint
CREATE INDEX "payment_orders_booking_idx" ON "payment_orders" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_txn_provider_payment_uq" ON "payment_transactions" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE INDEX "payment_txn_booking_idx" ON "payment_transactions" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payment_txn_received_idx" ON "payment_transactions" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_kind_version_uq" ON "policy_versions" USING btree ("kind","version");--> statement-breakpoint
CREATE INDEX "rate_rules_type_dates_idx" ON "rate_rules" USING btree ("room_type_id","start_date","end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_provider_refund_uq" ON "refunds" USING btree ("provider","provider_refund_id");--> statement-breakpoint
CREATE INDEX "refunds_booking_idx" ON "refunds" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "reviews_status_idx" ON "reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "units_room_type_idx" ON "room_units" USING btree ("room_type_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_user_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "unit_nights_night_idx" ON "unit_nights" USING btree ("night");--> statement-breakpoint
CREATE INDEX "unit_nights_booking_unit_idx" ON "unit_nights" USING btree ("booking_unit_id");--> statement-breakpoint
CREATE INDEX "unit_nights_block_idx" ON "unit_nights" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");