"use client";
import { useState } from "react";
import QRCode from "qrcode";
import { authClient } from "@/lib/auth-client";

export function TwoFactorVerify({ next = "/admin" }: { next?: string }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const code = String(new FormData(e.currentTarget).get("code"));
        const r = await authClient.twoFactor.verifyTotp({ code, trustDevice: false });
        if (r.error) setErr("That code is not valid. Try the latest code from your authenticator app.");
        else window.location.href = next;
      }}
    >
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <label className="block"><span className="field-label">Authenticator code</span><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className="field text-center text-2xl tracking-[0.4em]" /></label>
      <button className="btn-primary w-full">Verify</button>
    </form>
  );
}

export function EnableTwoFactor({ enabled }: { enabled: boolean }) {
  const [qr, setQr] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (enabled) return <p className="text-sm text-forest-800">Two-factor authentication is enabled on this account.</p>;
  return (
    <div className="space-y-4">
      {!uri ? (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            const r = await authClient.twoFactor.enable({ password: String(new FormData(e.currentTarget).get("password")) });
            if (r.error || !r.data || !("totpURI" in r.data)) return setErr("Password incorrect.");
            setUri(r.data.totpURI);
            setCodes(r.data.backupCodes);
            setQr(await QRCode.toDataURL(r.data.totpURI));
          }}
        >
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <label className="block"><span className="field-label">Confirm your password</span><input type="password" name="password" required className="field" autoComplete="current-password" /></label>
          <button className="btn-primary btn-sm">Set up authenticator app</button>
        </form>
      ) : (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt="QR code for your authenticator app" width={180} height={180} />}
          <p className="break-all text-xs text-muted">Or enter manually: {new URL(uri).searchParams.get("secret")}</p>
          <details className="text-xs"><summary className="cursor-pointer">Backup codes (store safely)</summary><pre className="mt-2">{codes.join("\n")}</pre></details>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await authClient.twoFactor.verifyTotp({ code: String(new FormData(e.currentTarget).get("code")) });
              if (r.error) setErr("Code not valid.");
              else { setMsg("Two-factor authentication enabled."); setTimeout(() => (window.location.href = "/admin"), 800); }
            }}
          >
            <input name="code" className="field max-w-[160px]" inputMode="numeric" maxLength={6} required placeholder="123456" />
            <button className="btn-primary btn-sm">Verify &amp; enable</button>
          </form>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          {msg && <p role="status" className="text-sm text-forest-800">{msg}</p>}
        </div>
      )}
    </div>
  );
}
