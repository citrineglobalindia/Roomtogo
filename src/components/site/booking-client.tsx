"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkPaymentStatusAction, createHoldAction, demoGatewayAction } from "@/app/(site)/booking-actions";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { track } from "@/lib/analytics";

export function GuestDetailsForm({ hidden, totalPaise, cancellationTitle, children }: { hidden: Record<string, string | string[]>; totalPaise: number; cancellationTitle: string; children?: React.ReactNode }) {
  useEffect(() => track("begin_checkout", { value: totalPaise / 100, currency: "INR" }), [totalPaise]);
  return (
    <ActionForm action={createHoldAction} className="space-y-5">
      {Object.entries(hidden).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x, i) => <input key={`${k}${i}`} type="hidden" name={k} value={x} />))}
      <input type="hidden" name="displayedTotal" value={totalPaise} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="field-label">Lead guest full name *</span>
          <input name="leadName" className="field" required minLength={2} maxLength={120} autoComplete="name" />
        </label>
        <label className="block">
          <span className="field-label">Email *</span>
          <input name="leadEmail" type="email" className="field" required autoComplete="email" />
        </label>
        <label className="block">
          <span className="field-label">Mobile number (with country code) *</span>
          <input name="leadPhone" type="tel" className="field" required autoComplete="tel" placeholder="+91 …" pattern="[+\d][\d\s-]{6,19}" />
        </label>
        <label className="block">
          <span className="field-label">Estimated arrival time (optional)</span>
          <input name="arrivalEta" type="time" className="field" />
        </label>
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
      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Reserving your room…">
        <Icon name="lock" size={16} /> Reserve &amp; continue to payment
      </SubmitButton>
      <p className="text-xs text-muted">Your room is held for a few minutes while you pay. Availability is confirmed only when the hold is created.</p>
    </ActionForm>
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

export function DemoGatewayButtons({ orderId }: { orderId: string }) {
  const [state, action] = useActionState(demoGatewayAction, null);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="orderId" value={orderId} />
      <button name="outcome" value="success" className="btn-primary w-full">Simulate successful payment</button>
      <button name="outcome" value="fail" className="btn-outline w-full">Simulate failed payment</button>
      <button name="outcome" value="close" className="btn-outline w-full">Simulate payment, then browser closed (tests recovery)</button>
    </form>
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
