import type { Metadata } from "next";
import { PolicyPage } from "@/components/site/policy-page";

export const metadata: Metadata = { title: "House rules — Room2Go", alternates: { canonical: "/house-rules" } };

export default function Page() {
  return <PolicyPage kind="house_rules" fallbackTitle="House rules" />;
}
