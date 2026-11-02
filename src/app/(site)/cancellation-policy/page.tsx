import type { Metadata } from "next";
import { PolicyPage } from "@/components/site/policy-page";

export const metadata: Metadata = { title: "Cancellation policy — Room2Go", alternates: { canonical: "/cancellation-policy" } };

export default function Page() {
  return <PolicyPage kind="cancellation" fallbackTitle="Cancellation policy" />;
}
