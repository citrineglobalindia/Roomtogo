import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { staffMembers, user } from "@/db/schema";
import type { Actor } from "./audit";
import { auth } from "./auth";
import { requireOwnerMfa } from "./config";
import { ForbiddenError } from "./errors";
import { can, type Permission, type StaffRole } from "./permissions";

/** Maximum admin session age regardless of Better Auth refresh. */
const STAFF_SESSION_MAX_HOURS = 12;

export type StaffContext = {
  staffId: string;
  userId: string;
  name: string;
  email: string;
  role: StaffRole;
  twoFactorEnabled: boolean;
  actor: Extract<Actor, { type: "staff" }>;
  can: (p: Permission) => boolean;
};

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export const getStaff = cache(async (): Promise<StaffContext | null> => {
  const session = await getSession();
  if (!session) return null;
  if (Date.now() - new Date(session.session.createdAt).getTime() > STAFF_SESSION_MAX_HOURS * 3600_000) return null;
  const [row] = await db
    .select({ s: staffMembers, u: user })
    .from(staffMembers)
    .innerJoin(user, eq(user.id, staffMembers.userId))
    .where(and(eq(staffMembers.userId, session.user.id), eq(staffMembers.active, true)));
  if (!row) return null;
  const role = row.s.role;
  return {
    staffId: row.s.id,
    userId: row.u.id,
    name: row.u.name,
    email: row.u.email,
    role,
    twoFactorEnabled: Boolean(row.u.twoFactorEnabled),
    actor: { type: "staff", id: row.s.id, label: `${row.u.name} (${role})`, role },
    can: (p) => can(role, p),
  };
});

/** For admin PAGES: redirects to login / MFA setup / forbidden. */
export async function requireStaffPage(perm?: Permission, opts: { allowWithoutMfa?: boolean } = {}): Promise<StaffContext> {
  const s = await getStaff();
  if (!s) redirect("/admin/login");
  if (s.role === "owner" && requireOwnerMfa() && !s.twoFactorEnabled && !opts.allowWithoutMfa) redirect("/admin/security?required=1");
  if (perm && !s.can(perm)) redirect("/admin?denied=1");
  return s;
}

/** For server ACTIONS / route handlers: throws, never trusts hidden UI. */
export async function requireStaff(perm: Permission): Promise<StaffContext> {
  const s = await getStaff();
  if (!s) throw new ForbiddenError("Please sign in as staff.");
  if (s.role === "owner" && requireOwnerMfa() && !s.twoFactorEnabled) throw new ForbiddenError("Two-factor authentication must be enabled for the owner account.");
  if (!s.can(perm)) throw new ForbiddenError();
  return s;
}
