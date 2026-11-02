import Link from "next/link";
import { EnableTwoFactor } from "@/components/admin/auth-client";
import { requireStaffPage } from "@/lib/staff";
import { requireOwnerMfa } from "@/lib/config";

export const metadata = { title: "Account security" };

export default async function Security({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const staff = await requireStaffPage(undefined, { allowWithoutMfa: true });
  const { required } = await searchParams;
  return (
    <main className="mx-auto max-w-lg px-5 py-16">
      <h1 className="text-3xl">Account security</h1>
      {required && <p className="mt-3 rounded bg-gold-100 p-3 text-sm text-gold-700">Owner accounts must use two-factor authentication before accessing the admin panel.</p>}
      <div className="mt-6 rounded-lg border border-sand bg-white p-6">
        <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wider">Two-factor authentication (TOTP)</h2>
        <EnableTwoFactor enabled={staff.twoFactorEnabled} />
        <p className="mt-4 text-xs text-muted">{requireOwnerMfa() ? "Required for owners in this deployment." : "Recommended; required for owners in production."}</p>
      </div>
      <Link href="/admin" className="mt-6 inline-block text-sm underline">Back to admin</Link>
    </main>
  );
}
