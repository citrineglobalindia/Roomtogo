export const dynamic = "force-dynamic";
export default function DocLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-cream-200 py-8 print:bg-white print:py-0">{children}</div>;
}
