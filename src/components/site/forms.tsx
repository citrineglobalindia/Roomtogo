"use client";
import { enquiryAction, reviewAction } from "@/app/(site)/actions";
import { ActionForm, Honeypot, SubmitButton } from "@/components/ui/form";
import { track } from "@/lib/analytics";

function Field({ label, name, type = "text", required = false, autoComplete, ...rest }: { label: string; name: string; type?: string; required?: boolean; autoComplete?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="field-label">
        {label} {required && <span aria-hidden className="text-danger">*</span>}
      </span>
      <input className="field" name={name} type={type} required={required} autoComplete={autoComplete} {...rest} />
    </label>
  );
}

export function EnquiryForm({ kind, today, defaults }: { kind: "general" | "extended_stay" | "corporate"; today: string; defaults?: Record<string, string> }) {
  const longStay = kind !== "general";
  return (
    <ActionForm action={enquiryAction} resetOnSuccess onSuccess={() => track("generate_lead", { enquiry_type: kind })} className="relative space-y-4">
      <Honeypot />
      {longStay ? (
        <fieldset>
          <legend className="field-label">Enquiry type</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="kind" value="extended_stay" defaultChecked={kind === "extended_stay"} /> Weekly / monthly stay
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="kind" value="corporate" defaultChecked={kind === "corporate"} /> Corporate stay
            </label>
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="kind" value="general" />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" name="name" required autoComplete="name" maxLength={120} />
        <Field label="Email" name="email" type="email" required autoComplete="email" maxLength={200} />
        <Field label="Phone" name="phone" type="tel" autoComplete="tel" maxLength={20} />
        {longStay && <Field label="Company (required for corporate stays)" name="company" autoComplete="organization" maxLength={160} />}
      </div>
      {longStay && (
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Arrival" name="checkIn" type="date" min={today} defaultValue={defaults?.checkIn} required />
          <Field label="Departure" name="checkOut" type="date" min={today} defaultValue={defaults?.checkOut} required />
          <Field label="Guests" name="guests" type="number" min={1} max={200} defaultValue={defaults?.guests ?? "1"} required />
          <Field label="Rooms" name="rooms" type="number" min={1} max={50} defaultValue="1" />
        </div>
      )}
      {longStay && (
        <label className="block">
          <span className="field-label">Length of stay</span>
          <select name="stayLength" className="field">
            <option value="weekly">About a week or more</option>
            <option value="monthly">A month or more</option>
            <option value="other">Other / not sure</option>
          </select>
        </label>
      )}
      <label className="block">
        <span className="field-label">
          {longStay ? "Requirements" : "Message"} <span aria-hidden className="text-danger">*</span>
        </span>
        <textarea name="message" className="field min-h-[130px]" required minLength={5} maxLength={4000} placeholder={longStay ? "Room preferences, billing details, special requirements…" : "How can we help?"} />
      </label>
      <p className="text-xs text-muted">We use your details only to respond to this enquiry. See our <a className="underline" href="/privacy">privacy policy</a>.</p>
      <SubmitButton>Send enquiry</SubmitButton>
    </ActionForm>
  );
}

export function ReviewForm({ invite }: { invite?: string }) {
  return (
    <ActionForm action={reviewAction} resetOnSuccess className="relative space-y-4">
      <Honeypot />
      {invite && <input type="hidden" name="invite" value={invite} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" name="authorName" required maxLength={80} autoComplete="name" />
        <Field label="Email (never published)" name="email" type="email" required autoComplete="email" />
        <Field label="Show as (optional, e.g. “Business traveller”)" name="displayLabel" maxLength={60} />
        <Field label="Month of stay" name="stayMonth" type="month" />
      </div>
      <label className="block">
        <span className="field-label">Rating (optional)</span>
        <select name="rating" className="field" defaultValue="">
          <option value="">No rating</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} / 5
            </option>
          ))}
        </select>
      </label>
      <Field label="Title (optional)" name="title" maxLength={120} />
      <label className="block">
        <span className="field-label">
          Your review <span aria-hidden className="text-danger">*</span>
        </span>
        <textarea name="body" className="field min-h-[150px]" required minLength={20} maxLength={3000} />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" className="mt-1" /> I agree that Room2Go may publish this review (with the name or label above) after moderation.
      </label>
      <SubmitButton>Submit review</SubmitButton>
    </ActionForm>
  );
}
