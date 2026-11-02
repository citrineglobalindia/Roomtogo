import Link from "next/link";
import { ActionButton, AForm, CB, F, S, TA } from "@/components/admin/forms";
import { PageHeader, Panel, Unconfirmed } from "@/components/admin/ui";
import { CONFIRMABLE_FACTS, getSettings, isConfirmed, setupChecklist, type ConfirmableFact } from "@/domain/settings";
import { formatDateTime } from "@/lib/dates";
import { paiseToRupeeInput } from "@/lib/money";
import { requireStaffPage } from "@/lib/staff";
import { confirmFactAction, saveSettingsAction } from "../../actions";

export const metadata = { title: "Settings & setup" };

export default async function Settings() {
  await requireStaffPage("settings.manage");
  const s = await getSettings();
  const list = await setupChecklist();
  const done = list.filter((i) => i.done).length;
  return (
    <>
      <PageHeader title="Settings & launch checklist" subtitle="Unconfirmed business facts stay marked until the owner confirms them. Live instant booking only opens when every required item is done." />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <Panel title={`Launch checklist (${done}/${list.length})`}>
            <ul className="space-y-2 text-sm">
              {list.map((i) => (
                <li key={i.key} className="flex items-start gap-2">
                  <span aria-hidden className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${i.done ? "bg-forest-700 text-white" : i.blocking ? "bg-red-200 text-red-900" : "bg-stone-200"}`}>{i.done ? "✓" : i.blocking ? "!" : ""}</span>
                  <span>
                    <Link href={i.href} className="underline-offset-2 hover:underline">{i.label}</Link>
                    <span className="sr-only">{i.done ? " (done)" : i.blocking ? " (required, open)" : " (recommended, open)"}</span>
                    {!i.blocking && <span className="ml-1 text-xs text-muted">(recommended)</span>}
                    {i.detail && <span className="block text-xs text-muted">{i.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">See BUSINESS_INPUTS.md in the project for the full list of client decisions.</p>
          </Panel>
          <Panel title="Owner confirmations">
            <ul className="space-y-2 text-sm">
              {(Object.keys(CONFIRMABLE_FACTS) as ConfirmableFact[]).map((f) => (
                <li key={f} className="flex items-center justify-between gap-2">
                  <span>{CONFIRMABLE_FACTS[f]}<Unconfirmed show={!isConfirmed(s, f)} />{isConfirmed(s, f) && <span className="block text-xs text-muted">Confirmed by {s.confirmedFields[f].by} · {formatDateTime(s.confirmedFields[f].at)}</span>}</span>
                  <ActionButton action={confirmFactAction} hidden={{ fact: f, op: isConfirmed(s, f) ? "unconfirm" : "confirm" }} label={isConfirmed(s, f) ? "Revoke" : "Confirm"} confirm={isConfirmed(s, f) ? undefined : `Confirm: ${CONFIRMABLE_FACTS[f]} — are the saved values approved by Room2Go?`} />
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <Panel title="Property & booking settings">
          <AForm action={saveSettingsAction} submit="Save settings" className="space-y-5">
            <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-2 font-semibold">Property</legend>
              <F label="Display name" name="name" defaultValue={s.name} required />
              <F label="Legal / invoice name" name="legalName" defaultValue={s.legalName} />
              <F label="Address line" name="addressLine" defaultValue={s.addressLine} required />
              <F label="City" name="city" defaultValue={s.city} required />
              <F label="State" name="region" defaultValue={s.region} required />
              <F label="PIN code" name="postalCode" defaultValue={s.postalCode} required />
              <F label="Phone" name="phone" defaultValue={s.phone} required />
              <F label="Email" name="email" defaultValue={s.email} required type="email" />
              <F label="WhatsApp number (property-approved)" name="whatsappNumber" defaultValue={s.whatsappNumber} hint="Shown only after you confirm it below." />
              <F label="Google Maps link" name="mapUrl" defaultValue={s.mapUrl} />
              <F label="Map latitude" name="mapLat" defaultValue={s.mapLat} />
              <F label="Map longitude" name="mapLng" defaultValue={s.mapLng} />
              <F label="Check-in time (HH:MM)" name="checkInTime" defaultValue={s.checkInTime} placeholder="e.g. 12:00" />
              <F label="Check-out time (HH:MM)" name="checkOutTime" defaultValue={s.checkOutTime} placeholder="e.g. 11:00" />
              {["instagram", "facebook", "linkedin"].map((k) => <F key={k} label={`${k} URL`} name={`social_${k}`} defaultValue={s.socialLinks[k]} />)}
            </fieldset>
            <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-2 font-semibold">Booking</legend>
              <S label="Online booking mode" name="bookingMode" defaultValue={s.bookingMode} options={[["enquiry_only", "Enquiry only (safe default)"], ["instant", "Instant booking with payment"]]} />
              <F label="Checkout hold (minutes)" name="holdMinutes" type="number" min={2} max={120} defaultValue={s.holdMinutes} />
              <S label="Payment rule" name="paymentRule" defaultValue={s.paymentRule} options={[["full", "Full payment at booking"], ["advance", "Advance now, balance at property"]]} />
              <F label="Advance %" name="advancePercent" type="number" min={1} max={100} defaultValue={s.advancePercent} />
              <F label="Max rooms per online booking" name="maxRoomsPerBooking" type="number" min={1} max={20} defaultValue={s.maxRoomsPerBooking} />
              <F label="Booking window (days ahead)" name="bookingWindowDays" type="number" min={1} defaultValue={s.bookingWindowDays} />
            </fieldset>
            <fieldset className="space-y-3"><legend className="mb-2 font-semibold">Tax & invoices (requires accountant confirmation)</legend>
              <CB label="Apply taxes to bookings" name="taxEnabled" defaultChecked={s.taxEnabled} />
              <TA label="Tax lines: Label | percent | min nightly ₹ (optional) | max nightly ₹ (optional)" name="taxRules" rows={3} defaultValue={s.taxRules.map((t) => [t.label, t.rateBps / 100, paiseToRupeeInput(t.minNightlyPaise), paiseToRupeeInput(t.maxNightlyPaise)].join(" | ")).join("\n")} hint="No rates are pre-filled. Enter only what your accountant has confirmed." />
              <div className="grid gap-3 sm:grid-cols-2">
                <F label="Tax registration number" name="taxRegistrationNumber" defaultValue={s.taxRegistrationNumber} />
                <F label="Invoice prefix" name="invoicePrefix" defaultValue={s.invoicePrefix} />
              </div>
              <CB label="Issue tax invoices (needs legal name, registration and confirmed tax)" name="taxInvoicesEnabled" defaultChecked={s.taxInvoicesEnabled} />
            </fieldset>
            <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-2 font-semibold">Messages & data</legend>
              <F label="Staff notification emails (comma separated)" name="notificationEmails" defaultValue={s.notificationEmails.join(", ")} />
              <F label="Pre-arrival reminder (days before; blank = off)" name="preArrivalReminderDays" type="number" min={0} defaultValue={s.preArrivalReminderDays} />
              <F label="Anonymise guest contact after (days; blank = keep)" name="guestDataRetentionDays" type="number" min={30} defaultValue={s.guestDataRetentionDays} />
              <div className="self-end"><CB label="Send review invitations after check-out" name="reviewInvitesEnabled" defaultChecked={s.reviewInvitesEnabled} /></div>
            </fieldset>
          </AForm>
        </Panel>
      </div>
    </>
  );
}
