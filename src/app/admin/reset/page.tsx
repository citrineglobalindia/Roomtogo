import { ForgotForm, ResetForm } from "@/components/site/account-client";
export const metadata = { title: "Set password" };
export default async function StaffReset({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-3xl">{token ? "Set your password" : "Reset staff password"}</h1>
      <div className="mt-6 rounded-lg border border-sand bg-white p-6">{token ? <ResetForm token={token} after="/admin/login" /> : <ForgotForm redirectTo="/admin/reset" />}</div>
    </main>
  );
}
