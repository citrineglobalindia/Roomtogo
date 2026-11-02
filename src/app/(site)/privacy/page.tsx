import type { Metadata } from "next";
import { PolicyPage } from "@/components/site/policy-page";

export const metadata: Metadata = { title: "Privacy policy — Room2Go", alternates: { canonical: "/privacy" } };

export default function Page() {
  return <PolicyPage kind="privacy" fallbackTitle="Privacy policy" />;
}
