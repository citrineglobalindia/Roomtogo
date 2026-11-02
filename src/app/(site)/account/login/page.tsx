import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/site/account-client";
export const metadata: Metadata = { title: "Sign in — Room2Go", robots: { index: false } };
export default function Login() {
  return (
    <div className="container-site max-w-md py-14">
      <h1 className="text-[40px]">Sign in</h1>
      <p className="mt-2 text-sm text-muted">An account is optional — you can always book as a guest.</p>
      <div className="card mt-6 p-6"><LoginForm /></div>
      <p className="mt-4 text-sm"><Link className="underline" href="/account/forgot">Forgot password?</Link> · <Link className="underline" href="/account/register">Create an account</Link> · <Link className="underline" href="/manage-booking">Manage a booking without an account</Link></p>
    </div>
  );
}
