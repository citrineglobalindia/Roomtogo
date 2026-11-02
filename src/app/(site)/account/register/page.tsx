import type { Metadata } from "next";
import { RegisterForm } from "@/components/site/account-client";
export const metadata: Metadata = { title: "Create account — Room2Go", robots: { index: false } };
export default async function Register({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <div className="container-site max-w-md py-14">
      <h1 className="text-[40px]">Create an account</h1>
      <div className="card mt-6 p-6"><RegisterForm email={email} /></div>
    </div>
  );
}
