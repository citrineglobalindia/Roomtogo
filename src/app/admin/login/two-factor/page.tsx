import { TwoFactorVerify } from "@/components/admin/auth-client";
export const metadata = { title: "Two-factor verification" };
export default async function TwoFactor({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-3xl">Two-factor verification</h1>
      <div className="mt-6 rounded-lg border border-sand bg-white p-6"><TwoFactorVerify next={next?.startsWith("/") ? next : "/admin"} /></div>
    </main>
  );
}
