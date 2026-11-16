"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkPaymentStatusAction, confirmReservationAction, sendReservationOtpAction, verifyReservationOtpAction } from "@/app/(site)/booking-actions";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { track } from "@/lib/analytics";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Lead-guest details + email OTP. "Confirm Reservation" stays disabled until every required field is
 * valid AND the email has been verified with the 6-digit code. No payment is taken online.
 */
export function GuestDetailsForm({ hidden, totalPaise, cancellationTitle, children }: { hidden: Record<string, string | string[]>; totalPaise: number; cancellationTitle: string; children?: React.ReactNode }) {
  useEffect(() => track("begin_checkout", { value: totalPaise / 100, currency: "INR" }), [totalPaise]);
  const [state, formAction, submitting] = useActionState(confirmReservationAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [formValid, setFormValid] = useState(false);
  const [email, setEmail] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [otpMsg, setOtpMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [busy, startTransition] = useTransition();

  const emailOk = EMAIL_RE.test(email.trim());
  const verified = verifiedEmail !== null && verifiedEmail === email.trim().toLowerCase();
  const canConfirm = formValid && verified && !submitting;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const recheck = () => setFormValid(Boolean(formRef.current?.checkValidity()));
  useEffect(recheck, [email]);

  const sendOtp = () =>
    startTransition(async () => {
      setOtpMsg(null);
      const r = await sendReservationOtpAction(email.trim());
      if (r.ok) {
        setSentTo(email.trim().toLowerCase());
        setCode("");
        setOtpMsg({ tone: "ok", text: r.message });
      } else setOtpMsg({ tone: "err", text: r.error });
      if (r.resendInSeconds) setCooldown(r.resendInSeconds);
    });
  const verifyOtp = () =>
    startTransition(async () => {
      setOtpMsg(null);
      const r = await verifyReservationOtpAction(email.trim(), code);
      if (r.ok) {
        setVerifiedEmail(email.trim().toLowerCase());
        setOtpMsg({ tone: "ok", text: "Email verified — you can now confirm your reservation." });
      } else setOtpMsg({ tone: "err", text: r.error });
    });

  return (
    <form ref={formRef} action={formAction} className="space-y-5" onInput={recheck} onChange={recheck} noValidate={false}>
      {Object.entries(hidden).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x, i) => <input key={`${k}${i}`} type="hidden" name={k} value={x} />))}
      <input type="hidden" name="displayedTotal" value={totalPaise} />
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="field-label">Lead guest full name *</span>
          <input name="leadName" className="field" required minLength={2} maxLength={120} autoComplete="name" />
        </label>
        <label className="block">
          <span className="field-label">Mobile number (with country code) *</span>
          <input name="leadPhone" type="tel" className="field" required autoComplete="tel" placeholder="+91 …" pattern="[+\d][\d\s-]{6,19}" />
        </label>
        <label className="block">
          <span className="field-label">Estimated arrival time (optional)</span>
          <input name="arrivalEta" type="time" className="field" />
        </label>

        {/* Email + OTP verification */}
        <div className="rounded-[10px] border border-gold-300/50 bg-cream-100/60 p-4 sm:col-span-2 sm:p-5">
          <label className="block">
            <span className="field-label">Email *</span>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                name="leadEmail"
                type="email"
                className="field flex-1"
                required
                autoComplete="email"
                value={email}
                readOnly={verified}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (verifiedEmail && e.target.value.trim().toLowerCase() !== verifiedEmail) setVerifiedEmail(null);
                }}
                aria-describedby="otp-help"
              />
              {verified ? (
                <span className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[var(--radius-card)] bg-forest-100 px-4 text-sm font-medium text-forest-800" role="status">
                  <Icon name="check" size={16} /> Verified
                </span>
              ) : (
                <button type="button" className="btn-outline shrink-0" disabled={!emailOk || busy || cooldown > 0} onClick={sendOtp}>
                  {busy && !sentTo ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : sentTo ? "Resend OTP" : "Send OTP"}
                </button>
              )}
            </div>
          </label>
          <p id="otp-help" className="mt-1.5 text-xs text-muted">
            {verified ? (
              <button type="button" className="underline" onClick={() => { setVerifiedEmail(null); setSentTo(null); setCode(""); setOtpMsg(null); }}>Use a different email</button>
            ) : (
              "We'll email a 6-digit code to confirm it's you. No payment is taken now."
            )}
          </p>
          {sentTo && !verified && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="block flex-1">
                <span className="field-label">6-digit code</span>
                <input
                  className="field tracking-[0.4em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  aria-label="One-time code"
                />
              </label>
              <button type="button" className="btn-primary shrink-0" disabled={code.length !== 6 || busy} onClick={verifyOtp}>
                {busy ? "Checking…" : "Verify OTP"}
              </button>
            </div>
          )}
          {otpMsg && (
            <p role={otpMsg.tone === "err" ? "alert" : "status"} className={`mt-2 text-sm ${otpMsg.tone === "err" ? "text-danger" : "text-forest-800"}`}>
              {otpMsg.text}
            </p>
          )}
        </div>

        <label className="block sm:col-span-2">
          <span className="field-label">Special requests (optional)</span>
          <textarea name="specialRequests" className="field min-h-[90px]" maxLength={1000} placeholder="Requests are subject to availability." />
        </label>
      </div>
      {children}
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="acceptPolicies" required className="mt-1 h-4 w-4" />
        <span>
          I have read and accept the <a href="/terms" target="_blank" className="underline">booking terms</a>, the{" "}
          <a href="/cancellation-policy" target="_blank" className="underline">{cancellationTitle.toLowerCase()}</a> and the <a href="/house-rules" target="_blank" className="underline">house rules</a>. *
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm text-muted">
        <input type="checkbox" name="marketingOptIn" className="mt-1 h-4 w-4" />
        <span>Optional: send me occasional offers from Room2Go. (Booking does not subscribe you.)</span>
      </label>
      <button type="submit" className="btn-gold w-full sm:w-auto" disabled={!canConfirm} aria-disabled={!canConfirm}>
        {submitting ? "Confirming…" : (<><Icon name="check" size={16} /> Confirm Reservation</>)}
      </button>
      <p className="text-xs text-muted">
        {verified
          ? formValid
            ? "No payment is taken online — pay later by UPI or at the property."
            : "Complete the required fields and accept the terms to confirm."
          : "Verify your email to enable “Confirm Reservation”. No payment is taken online — pay later by UPI or at the property."}
      </p>
    </form>
  );
}

export function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState(() => Math.max(0, new Date(expiresAt).getTime() - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, new Date(expiresAt).getTime() - Date.now())), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <p className={`flex items-center gap-2 text-sm ${left < 120000 ? "text-danger" : "text-forest-800"}`} aria-live="off">
      <Icon name="clock" size={16} />
      {left > 0 ? (
        <>
          Room held for <strong className="tabular-nums">{m}:{String(s).padStart(2, "0")}</strong>
        </>
      ) : (
        "Your hold has expired. Please search again."
      )}
    </p>
  );
}

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void };
  }
}

export function RazorpayPayButton({ options, label }: { options: Record<string, unknown>; label: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(() => typeof window !== "undefined" && Boolean(window.Razorpay));
  useEffect(() => {
    if (window.Razorpay) return;
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => setReady(true);
    s.onerror = () => setErr("Could not load the payment window. Check your connection and try again.");
    document.body.appendChild(s);
  }, []);
  const open = () => {
    if (!window.Razorpay) return;
    setErr(null);
    const rzp = new window.Razorpay({
      ...options,
      handler: async (resp: Record<string, string>) => {
        setBusy(true);
        const r = await fetch("/api/payments/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(resp) });
        const j = await r.json().catch(() => ({}));
        if (j.redirect) router.push(j.redirect);
        else {
          setBusy(false);
          setErr(j.error ?? "We could not verify the payment yet. If money was debited, your booking will be confirmed automatically once verified.");
        }
      },
      modal: { ondismiss: () => setBusy(false) },
    });
    rzp.on("payment.failed", () => setErr("Payment failed or was cancelled. You can try again while your room is held."));
    rzp.open();
  };
  return (
    <div className="space-y-3">
      {err && <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-danger">{err}</p>}
      <button className="btn-primary w-full" disabled={!ready || busy} onClick={open}>
        <Icon name="lock" size={16} /> {busy ? "Verifying payment…" : label}
      </button>
    </div>
  );
}

export function CheckStatusButton({ reference }: { reference: string }) {
  return (
    <ActionForm action={checkPaymentStatusAction} className="space-y-3">
      <input type="hidden" name="ref" value={reference} />
      <SubmitButton className="btn-outline w-full" pendingText="Checking with payment provider…">Check payment status</SubmitButton>
    </ActionForm>
  );
}
