import type { Metadata } from "next";
import { ForgotForm } from "@/components/site/account-client";
export const metadata: Metadata = { title: "Reset password — Room2Go", robots: { index: false } };
export default function Forgot() {
  return (
    <div className="container-site max-w-md py-14">
      <h1 className="text-[40px]">Reset your password</h1>
      <div className="card mt-6 p-6"><ForgotForm /></div>
    </div>
  );
}
