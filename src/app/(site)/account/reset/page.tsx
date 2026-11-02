import type { Metadata } from "next";
import { ResetForm } from "@/components/site/account-client";
import { Notice } from "@/components/site/sections";
export const metadata: Metadata = { title: "Choose a new password — Room2Go", robots: { index: false } };
export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return (
    <div className="container-site max-w-md py-14">
      <h1 className="text-[40px]">Choose a new password</h1>
      <div className="card mt-6 p-6">{token && !error ? <ResetForm token={token} /> : <Notice tone="error">This reset link is invalid or has expired.</Notice>}</div>
    </div>
  );
}
