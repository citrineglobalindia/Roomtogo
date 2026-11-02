import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Room2Go admin", template: "%s · Room2Go admin" }, robots: { index: false, follow: false } };
export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-cream-200/60">{children}</div>;
}
