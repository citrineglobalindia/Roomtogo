"use server";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/ui/form";
import { db } from "@/db";
import * as s from "@/db/schema";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request";
import { safeEqual } from "@/lib/tokens";

/** First-owner bootstrap. Works only while NO staff exist and with the deployment's SETUP_TOKEN. */
export async function setupOwnerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await enforceRateLimit(`setup:${await clientKey()}`, 10, 3600).catch(() => {
    throw new Error("rate");
  });
  const token = String(fd.get("token") ?? "");
  const expected = process.env.SETUP_TOKEN ?? "";
  if (!expected || expected.length < 12 || !safeEqual(token, expected)) return { error: "Invalid setup token." };
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "Enter your name and a valid email." };
  if (password.length < 12) return { error: "Use at least 12 characters for the owner password." };
  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE staff_members IN EXCLUSIVE MODE`);
    const [{ n }] = (await tx.execute<{ n: number }>(sql`SELECT count(*)::int n FROM staff_members`)).rows;
    if (n > 0) return false;
    const ctx = await auth.$context;
    const id = randomUUID();
    await tx.insert(s.user).values({ id, name, email, emailVerified: true });
    await tx.insert(s.account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await ctx.password.hash(password) });
    const [m] = await tx.insert(s.staffMembers).values({ userId: id, role: "owner" }).returning();
    await audit(tx, { type: "system", label: "setup" }, "staff.owner_bootstrapped", "staff", m.id, null, { email });
    return true;
  });
  if (!created) return { error: "Setup has already been completed." };
  redirect("/admin/login");
}
