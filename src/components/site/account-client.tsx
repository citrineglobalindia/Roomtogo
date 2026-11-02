"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

function Msg({ err, ok }: { err: string | null; ok: string | null }) {
  if (err) return <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-danger">{err}</p>;
  if (ok) return <p role="status" className="rounded-md border border-forest-600/40 bg-forest-100 px-4 py-3 text-sm text-forest-800">{ok}</p>;
  return null;
}

const GENERIC = "We couldn't complete that. Check your details and try again.";

export function LoginForm({ next = "/account", staff = false }: { next?: string; staff?: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const fd = new FormData(e.currentTarget);
        const r = await authClient.signIn.email({ email: String(fd.get("email")), password: String(fd.get("password")), callbackURL: next });
        setBusy(false);
        if (r.error) setErr(r.error.status === 403 ? "Please verify your email first — check your inbox for the link." : r.error.status === 429 ? "Too many attempts. Please wait a few minutes." : "Incorrect email or password.");
        else if (!(r.data as { twoFactorRedirect?: boolean })?.twoFactorRedirect) window.location.href = next;
      }}
    >
      <Msg err={err} ok={null} />
      <label className="block"><span className="field-label">Email</span><input name="email" type="email" required autoComplete="email" className="field" /></label>
      <label className="block"><span className="field-label">Password</span><input name="password" type="password" required autoComplete="current-password" className="field" /></label>
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : staff ? "Sign in to admin" : "Sign in"}</button>
    </form>
  );
}

export function RegisterForm({ email = "" }: { email?: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (String(fd.get("password")) !== String(fd.get("confirm"))) return setErr("Passwords do not match.");
        setBusy(true);
        setErr(null);
        const r = await authClient.signUp.email({ name: String(fd.get("name")), email: String(fd.get("email")), password: String(fd.get("password")), callbackURL: "/account" });
        setBusy(false);
        if (r.error) setErr(r.error.status === 422 && /password/i.test(r.error.message ?? "") ? "Password must be at least 10 characters." : r.error.status === 429 ? "Too many attempts. Please wait." : GENERIC);
        else setOk("Check your email to confirm your address. Then you can sign in.");
      }}
    >
      <Msg err={err} ok={ok} />
      <label className="block"><span className="field-label">Full name</span><input name="name" required autoComplete="name" className="field" /></label>
      <label className="block"><span className="field-label">Email</span><input name="email" type="email" defaultValue={email} required autoComplete="email" className="field" /></label>
      <label className="block"><span className="field-label">Password (min. 10 characters)</span><input name="password" type="password" minLength={10} required autoComplete="new-password" className="field" /></label>
      <label className="block"><span className="field-label">Confirm password</span><input name="confirm" type="password" minLength={10} required autoComplete="new-password" className="field" /></label>
      <p className="text-xs text-muted">Creating an account does not subscribe you to marketing.</p>
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
    </form>
  );
}

export function ForgotForm({ redirectTo = "/account/reset" }: { redirectTo?: string }) {
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const fd = new FormData(e.currentTarget);
        await authClient.requestPasswordReset({ email: String(fd.get("email")), redirectTo });
        setBusy(false);
        setOk("If an account exists for that email, a reset link is on its way.");
      }}
    >
      <Msg err={null} ok={ok} />
      <label className="block"><span className="field-label">Email</span><input name="email" type="email" required autoComplete="email" className="field" /></label>
      <button className="btn-primary w-full" disabled={busy}>Send reset link</button>
    </form>
  );
}

export function ResetForm({ token, after = "/account/login" }: { token: string; after?: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const r = await authClient.resetPassword({ newPassword: String(fd.get("password")), token });
        if (r.error) setErr("This reset link is invalid or has expired. Request a new one.");
        else {
          setOk("Password updated. You can now sign in.");
          setTimeout(() => (window.location.href = after), 1200);
        }
      }}
    >
      <Msg err={err} ok={ok} />
      <label className="block"><span className="field-label">New password (min. 10 characters)</span><input name="password" type="password" minLength={10} required autoComplete="new-password" className="field" /></label>
      <button className="btn-primary w-full">Set new password</button>
    </form>
  );
}

export function SignOutButton({ to = "/" }: { to?: string }) {
  return (
    <button className="btn-outline btn-sm" onClick={async () => { await authClient.signOut(); window.location.href = to; }}>
      Sign out
    </button>
  );
}

export function ProfileForm({ name }: { name: string }) {
  const [ok, setOk] = useState<string | null>(null);
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); await authClient.updateUser({ name: String(fd.get("name")) }); setOk("Saved."); }}>
      <label className="flex-1"><span className="field-label">Name</span><input name="name" defaultValue={name} className="field" required /></label>
      <button className="btn-outline">Save</button>
      {ok && <span role="status" className="text-sm text-forest-700">{ok}</span>}
    </form>
  );
}
