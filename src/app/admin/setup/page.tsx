import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { AForm, F } from "@/components/admin/forms";
import { db } from "@/db";
import { setupOwnerAction } from "./actions";

export const metadata = { title: "Initial setup" };

export default async function Setup({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const [{ n }] = (await db.execute<{ n: number }>(sql`SELECT count(*)::int n FROM staff_members`)).rows;
  if (n > 0) notFound(); // never exposed after the first owner exists
  const { token } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-5 py-16">
      <h1 className="text-3xl">Create the owner account</h1>
      <p className="mt-2 text-sm text-muted">One-time setup. Requires the setup token: the SETUP_TOKEN environment variable or, on hosted demos, the value of SETUP_TOKEN in the database table app_secrets (Supabase → Table Editor). After this, staff are invited from Admin → Staff.</p>
      <div className="mt-6 rounded-lg border border-sand bg-white p-6">
        <AForm action={setupOwnerAction} submit="Create owner" submitClass="btn-primary w-full">
          <F label="Setup token" name="token" defaultValue={token ?? ""} required type="password" />
          <F label="Your name" name="name" required />
          <F label="Email" name="email" type="email" required />
          <F label="Password (min. 12 characters)" name="password" type="password" minLength={12} required />
        </AForm>
      </div>
    </main>
  );
}
