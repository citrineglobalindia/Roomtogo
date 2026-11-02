import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/site/account-client";
import { Logo } from "@/components/site/chrome";
import { getStaff, getSession } from "@/lib/staff";

export const metadata = { title: "Staff sign in" };

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getStaff()) redirect("/admin");
  const session = await getSession();
  const { next } = await searchParams;
  const safeNext = next?.startsWith("/admin") ? next : "/admin";
  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <Logo />
      <h1 className="mt-6 text-3xl">Staff sign in</h1>
      {session && <p className="mt-2 rounded bg-gold-100 p-2 text-xs text-gold-700">You are signed in as {session.user.email}, which is not an active staff account.</p>}
      <div className="mt-6 rounded-lg border border-sand bg-white p-6"><LoginForm next={safeNext} staff /></div>
      <p className="mt-4 text-xs text-muted"><Link href="/admin/reset" className="underline">Forgot password?</Link> · Staff accounts are created by the owner. Public sign-up never grants admin access.</p>
    </main>
  );
}
