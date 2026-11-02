import { auditLogs } from "@/db/schema";
import type { DbOrTx } from "@/db";

export type Actor =
  | { type: "staff"; id: string; label: string; role: "owner" | "reception" | "content" }
  | { type: "guest"; id?: string | null; label?: string }
  | { type: "system"; label: string };

export async function audit(
  tx: DbOrTx,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string | null,
  before?: unknown,
  after?: unknown,
) {
  await tx.insert(auditLogs).values({
    actorType: actor.type,
    actorId: actor.type === "staff" ? actor.id : actor.type === "guest" ? (actor.id ?? null) : null,
    actorLabel: actor.type === "system" ? actor.label : (actor.label ?? null),
    action,
    entityType,
    entityId,
    before: before === undefined ? null : (before as object),
    after: after === undefined ? null : (after as object),
  });
}

export const SYSTEM: Actor = { type: "system", label: "system" };
