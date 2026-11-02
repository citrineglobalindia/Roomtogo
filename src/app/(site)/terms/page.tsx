import type { Metadata } from "next";
import { PolicyPage } from "@/components/site/policy-page";

export const metadata: Metadata = { title: "Booking terms — Room2Go", alternates: { canonical: "/terms" } };

export default function Page() {
  return <PolicyPage kind="terms" fallbackTitle="Booking terms" />;
}
