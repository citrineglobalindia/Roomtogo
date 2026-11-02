"use client";
import { useState } from "react";
import { guestRequestAction, requestCodeAction, verifyCodeAction } from "@/app/(site)/booking-actions";
import { ActionForm, SubmitButton } from "@/components/ui/form";

export function AccessCodeFlow({ initialRef = "" }: { initialRef?: string }) {
  const [ref, setRef] = useState<string | null>(null);
  return ref ? (
    <ActionForm action={verifyCodeAction} className="space-y-4">
      <input type="hidden" name="reference" value={ref} />
      <p className="text-sm text-muted">If the details matched, we emailed a 6-digit code for booking <strong>{ref}</strong>.</p>
      <label className="block">
        <span className="field-label">Access code</span>
        <input name="code" className="field text-center text-2xl tracking-[0.5em]" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="one-time-code" />
      </label>
      <SubmitButton>View booking</SubmitButton>
      <button type="button" className="ml-3 text-sm underline" onClick={() => setRef(null)}>
        Start again
      </button>
    </ActionForm>
  ) : (
    <ActionForm action={requestCodeAction} onSuccess={(s) => setRef(String(s?.data?.reference ?? ""))} className="space-y-4">
      <label className="block">
        <span className="field-label">Booking reference</span>
        <input name="reference" className="field uppercase" placeholder="R2G-XXXXXX" defaultValue={initialRef} required />
      </label>
      <label className="block">
        <span className="field-label">Email used for the booking</span>
        <input name="email" type="email" className="field" required autoComplete="email" />
      </label>
      <SubmitButton>Email me an access code</SubmitButton>
    </ActionForm>
  );
}

export function GuestRequestForms({ reference, today }: { reference: string; today: string }) {
  const [tab, setTab] = useState<"none" | "cancellation" | "date_change">("none");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-outline btn-sm" aria-expanded={tab === "date_change"} onClick={() => setTab(tab === "date_change" ? "none" : "date_change")}>
          Request a date change
        </button>
        <button type="button" className="btn-danger btn-sm" aria-expanded={tab === "cancellation"} onClick={() => setTab(tab === "cancellation" ? "none" : "cancellation")}>
          Request cancellation
        </button>
      </div>
      {tab !== "none" && (
        <ActionForm action={guestRequestAction} className="space-y-3 rounded-md border border-sand bg-white p-4">
          <input type="hidden" name="ref" value={reference} />
          <input type="hidden" name="kind" value={tab} />
          {tab === "date_change" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="field-label">New arrival</span>
                <input type="date" name="checkIn" className="field" min={today} required />
              </label>
              <label>
                <span className="field-label">New departure</span>
                <input type="date" name="checkOut" className="field" min={today} required />
              </label>
            </div>
          )}
          <label className="block">
            <span className="field-label">Message (optional)</span>
            <textarea name="message" className="field min-h-[80px]" maxLength={2000} />
          </label>
          <p className="text-xs text-muted">{tab === "cancellation" ? "Your request is reviewed by our team. The booking stays active until the cancellation is approved; any refund follows the policy you accepted." : "Date changes are subject to a fresh availability and price check by our team."}</p>
          <SubmitButton>{tab === "cancellation" ? "Send cancellation request" : "Send date-change request"}</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
