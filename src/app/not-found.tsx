import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-6 py-24 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 text-[44px]">We couldn’t find that page.</h1>
      <p className="mt-3 text-muted">It may have moved, or the link may have expired.</p>
      <Link href="/" className="btn-primary mt-8">Back to Room2Go</Link>
    </main>
  );
}
