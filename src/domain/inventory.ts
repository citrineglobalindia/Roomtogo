/**
 * Inventory & allocation.
 *
 * `unit_nights` (PK unit_id + night) is the single source of truth for occupancy. Rows exist for:
 *   - bookings in pending_payment (an active hold), confirmed, checked_in, checked_out (history kept)
 *   - no_show / early check-out: rows from "today" onwards are removed
 *   - availability blocks (maintenance, owner use, closures, externally received reservations)
 * cancelled / expired bookings have no rows.
 *
 * A pending booking whose hold has passed `expires_at` but has not yet been swept is treated as FREE by
 * searches, and is swept inside every allocation transaction before inserting, so abandoned checkouts
 * never block inventory even if the background job is late.
 *
 * Allocation inserts every night for one physical unit with ON CONFLICT DO NOTHING inside a savepoint.
 * If fewer rows than nights were inserted, the savepoint is rolled back and the next unit is tried, so a
 * stay is only ever placed on a single unit for its whole duration (no impossible split stays).
 * Concurrent attempts for the last unit serialise on the primary key: at most one succeeds.
 */
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, type DbOrTx, type Tx } from "@/db";
import { availabilityBlocks, bookingUnits, bookings, inventoryHolds, roomTypes, roomUnits, unitNights } from "@/db/schema";
import { eachNight } from "@/lib/dates";
import { AllocationError, UserError } from "@/lib/errors";

/** Expire overdue holds: mark hold expired, booking expired, and free their nights. Safe to run concurrently. */
export async function releaseExpiredHolds(tx: DbOrTx = db): Promise<string[]> {
  const res = await tx.execute<{ booking_id: string }>(sql`
    WITH exp AS (
      UPDATE inventory_holds SET status = 'expired', resolved_at = now()
      WHERE status = 'active' AND expires_at < now()
      RETURNING booking_id
    ), upd AS (
      UPDATE bookings SET status = 'expired', updated_at = now()
      WHERE id IN (SELECT booking_id FROM exp) AND status = 'pending_payment'
      RETURNING id
    ), del AS (
      DELETE FROM unit_nights WHERE booking_unit_id IN (
        SELECT bu.id FROM booking_units bu WHERE bu.booking_id IN (SELECT id FROM upd)
      ) RETURNING 1
    )
    SELECT id AS booking_id FROM upd`);
  return res.rows.map((r) => r.booking_id);
}

/** SQL fragment: unit has no effective occupancy in [checkIn, checkOut). Expired-but-unswept holds count as free. */
function unitFreeSql(checkIn: string, checkOut: string) {
  return sql`NOT EXISTS (
    SELECT 1 FROM unit_nights n
    LEFT JOIN booking_units bu ON bu.id = n.booking_unit_id
    LEFT JOIN inventory_holds h ON h.booking_id = bu.booking_id AND h.status = 'active'
    WHERE n.unit_id = ${roomUnits.id} AND n.night >= ${checkIn} AND n.night < ${checkOut}
      AND NOT (h.id IS NOT NULL AND h.expires_at < now())
  )`;
}

export type FreeUnit = { id: string; label: string; roomTypeId: string };

/** Units of the given types free for the ENTIRE stay. `directOnly` restricts to direct-sale units (website). */
export async function freeUnits(
  opts: { checkIn: string; checkOut: string; roomTypeIds?: string[]; directOnly: boolean; excludeUnitIds?: string[] },
  tx: DbOrTx = db,
): Promise<FreeUnit[]> {
  const conds = [eq(roomUnits.status, "active"), eq(roomTypes.status, "active"), unitFreeSql(opts.checkIn, opts.checkOut)];
  if (opts.directOnly) conds.push(eq(roomUnits.directSale, true));
  if (opts.roomTypeIds?.length) conds.push(inArray(roomUnits.roomTypeId, opts.roomTypeIds));
  if (opts.excludeUnitIds?.length) conds.push(sql`${roomUnits.id} NOT IN ${opts.excludeUnitIds}`);
  return tx
    .select({ id: roomUnits.id, label: roomUnits.label, roomTypeId: roomUnits.roomTypeId })
    .from(roomUnits)
    .innerJoin(roomTypes, eq(roomTypes.id, roomUnits.roomTypeId))
    .where(and(...conds))
    .orderBy(asc(roomUnits.sortOrder), asc(roomUnits.label));
}

/** Count of units free for the whole stay per room type (indicative until a hold is created). */
export async function availabilityByType(checkIn: string, checkOut: string, directOnly = true, tx: DbOrTx = db) {
  const units = await freeUnits({ checkIn, checkOut, directOnly }, tx);
  const counts = new Map<string, number>();
  for (const u of units) counts.set(u.roomTypeId, (counts.get(u.roomTypeId) ?? 0) + 1);
  return counts;
}

/** Try to occupy every night of the stay on one specific unit. Returns false on any conflict (savepoint rolled back). */
async function tryOccupyUnit(tx: Tx, bookingUnitId: string, unitId: string, nights: string[]): Promise<boolean> {
  try {
    await tx.transaction(async (sp) => {
      const inserted = await sp
        .insert(unitNights)
        .values(nights.map((night) => ({ unitId, night, kind: "booking" as const, bookingUnitId })))
        .onConflictDoNothing()
        .returning({ night: unitNights.night });
      if (inserted.length !== nights.length) throw new AllocationError();
    });
    return true;
  } catch (e) {
    if (e instanceof AllocationError) return false;
    throw e;
  }
}

export type AllocationRequest = { roomTypeId: string; adults: number; children: number; preferredUnitId?: string | null };

/**
 * Allocate all requested rooms for a booking atomically (call inside a transaction).
 * Throws AllocationError if ANY room cannot be placed — the caller's transaction then rolls back,
 * so no partial hidden reservation survives.
 */
export async function allocateRooms(
  tx: Tx,
  bookingId: string,
  checkIn: string,
  checkOut: string,
  rooms: AllocationRequest[],
  opts: { directOnly: boolean },
): Promise<{ bookingUnitId: string; unitId: string; unitLabel: string; roomTypeId: string }[]> {
  await releaseExpiredHolds(tx);
  const nights = eachNight(checkIn, checkOut);
  const used: string[] = [];
  const result: { bookingUnitId: string; unitId: string; unitLabel: string; roomTypeId: string }[] = [];
  for (const room of rooms) {
    const candidates = await freeUnits(
      { checkIn, checkOut, roomTypeIds: [room.roomTypeId], directOnly: opts.directOnly, excludeUnitIds: used },
      tx,
    );
    if (room.preferredUnitId) {
      const idx = candidates.findIndex((c) => c.id === room.preferredUnitId);
      if (idx < 0) throw new AllocationError("The selected unit is not available for the whole stay.");
      candidates.unshift(...candidates.splice(idx, 1));
    }
    if (candidates.length === 0) throw new AllocationError();
    const [bu] = await tx
      .insert(bookingUnits)
      .values({ bookingId, roomTypeId: room.roomTypeId, unitId: candidates[0].id, adults: room.adults, children: room.children })
      .returning({ id: bookingUnits.id });
    let placed: FreeUnit | null = null;
    for (const c of room.preferredUnitId ? candidates.slice(0, 1) : candidates) {
      if (await tryOccupyUnit(tx, bu.id, c.id, nights)) {
        placed = c;
        break;
      }
    }
    if (!placed) throw new AllocationError();
    await tx.update(bookingUnits).set({ unitId: placed.id }).where(eq(bookingUnits.id, bu.id));
    used.push(placed.id);
    result.push({ bookingUnitId: bu.id, unitId: placed.id, unitLabel: placed.label, roomTypeId: placed.roomTypeId });
  }
  return result;
}

/**
 * Re-occupy nights for an existing booking whose rows were released (late payment after hold expiry,
 * or date change). Prefers the originally assigned unit, else any free unit of the same type.
 */
export async function reallocateBooking(tx: Tx, bookingId: string, checkIn: string, checkOut: string, directOnly: boolean) {
  await releaseExpiredHolds(tx);
  const nights = eachNight(checkIn, checkOut);
  const bus = await tx.select().from(bookingUnits).where(eq(bookingUnits.bookingId, bookingId));
  const used: string[] = [];
  for (const bu of bus) {
    const candidates = await freeUnits({ checkIn, checkOut, roomTypeIds: [bu.roomTypeId], directOnly, excludeUnitIds: used }, tx);
    const ordered = [...candidates.filter((c) => c.id === bu.unitId), ...candidates.filter((c) => c.id !== bu.unitId)];
    let placed: string | null = null;
    for (const c of ordered) {
      if (await tryOccupyUnit(tx, bu.id, c.id, nights)) {
        placed = c.id;
        break;
      }
    }
    if (!placed) throw new AllocationError();
    if (placed !== bu.unitId) await tx.update(bookingUnits).set({ unitId: placed }).where(eq(bookingUnits.id, bu.id));
    used.push(placed);
  }
}

/** Release occupancy for a booking. `fromNight` releases only nights >= fromNight (no-show / early departure). */
export async function releaseBookingNights(tx: DbOrTx, bookingId: string, fromNight?: string) {
  const buIds = tx.select({ id: bookingUnits.id }).from(bookingUnits).where(eq(bookingUnits.bookingId, bookingId));
  const conds = [inArray(unitNights.bookingUnitId, buIds)];
  if (fromNight) conds.push(gte(unitNights.night, fromNight));
  await tx.delete(unitNights).where(and(...conds));
}

/** Move one allocated room to a different unit for its remaining stay. Conflicts abort without changes. */
export async function reassignUnit(tx: Tx, bookingUnitId: string, newUnitId: string, fromNight: string | null) {
  const [bu] = await tx.select().from(bookingUnits).where(eq(bookingUnits.id, bookingUnitId)).for("update");
  if (!bu) throw new UserError("Allocation not found.");
  const [b] = await tx.select().from(bookings).where(eq(bookings.id, bu.bookingId));
  const [unit] = await tx.select().from(roomUnits).where(eq(roomUnits.id, newUnitId));
  if (!unit || unit.status !== "active") throw new UserError("Target unit is inactive.");
  const start = fromNight && fromNight > b.checkIn ? fromNight : b.checkIn;
  const nights = eachNight(start, b.checkOut);
  if (nights.length === 0) throw new UserError("No remaining nights to move.");
  await tx.delete(unitNights).where(and(eq(unitNights.bookingUnitId, bu.id), gte(unitNights.night, start)));
  const ok = await tryOccupyUnit(tx, bu.id, newUnitId, nights);
  if (!ok) throw new AllocationError("That unit is not free for the remaining nights of this stay.");
  if (start === b.checkIn) {
    await tx.update(bookingUnits).set({ unitId: newUnitId, roomTypeId: unit.roomTypeId }).where(eq(bookingUnits.id, bu.id));
  } else {
    // Mid-stay move: keep history by recording the new unit; prior nights stay on the old unit rows.
    await tx.update(bookingUnits).set({ unitId: newUnitId }).where(eq(bookingUnits.id, bu.id));
  }
  return { from: bu.unitId, to: newUnitId, nights: nights.length };
}

export type Conflict = { night: string; kind: string; reference: string | null };

/** Create an availability block. Refuses (with conflict list) rather than overwriting active reservations. */
export async function createBlock(
  tx: Tx,
  input: { unitId: string; startDate: string; endDate: string; kind: "maintenance" | "owner_use" | "closure" | "external"; reason: string; staffId: string },
) {
  if (input.endDate <= input.startDate) throw new UserError("End date must be after start date.");
  await releaseExpiredHolds(tx);
  const nights = eachNight(input.startDate, input.endDate);
  const conflicts = await tx
    .select({ night: unitNights.night, kind: unitNights.kind, reference: bookings.reference })
    .from(unitNights)
    .leftJoin(bookingUnits, eq(bookingUnits.id, unitNights.bookingUnitId))
    .leftJoin(bookings, eq(bookings.id, bookingUnits.bookingId))
    .where(and(eq(unitNights.unitId, input.unitId), gte(unitNights.night, input.startDate), lt(unitNights.night, input.endDate)));
  if (conflicts.length) {
    throw new UserError(
      `Cannot block: ${conflicts.length} night(s) already occupied (${[...new Set(conflicts.map((c) => c.reference ?? "another block"))].join(", ")}). Move or cancel those first.`,
      "conflict",
    );
  }
  const [block] = await tx
    .insert(availabilityBlocks)
    .values({ unitId: input.unitId, startDate: input.startDate, endDate: input.endDate, kind: input.kind, reason: input.reason, createdByStaffId: input.staffId })
    .returning();
  const inserted = await tx
    .insert(unitNights)
    .values(nights.map((night) => ({ unitId: input.unitId, night, kind: "block" as const, blockId: block.id })))
    .onConflictDoNothing()
    .returning({ night: unitNights.night });
  if (inserted.length !== nights.length) throw new UserError("Another reservation took these dates just now. Please refresh and retry.", "conflict");
  return block;
}

export async function releaseBlock(tx: DbOrTx, blockId: string, staffId: string) {
  await tx.delete(unitNights).where(eq(unitNights.blockId, blockId));
  const [b] = await tx
    .update(availabilityBlocks)
    .set({ releasedAt: new Date(), releasedByStaffId: staffId })
    .where(eq(availabilityBlocks.id, blockId))
    .returning();
  return b;
}

/** Occupancy grid for the admin calendar. */
export async function calendarOccupancy(from: string, to: string) {
  const rows = await db.execute<{
    unit_id: string;
    night: string;
    kind: "booking" | "block";
    booking_id: string | null;
    reference: string | null;
    status: string | null;
    lead_name: string | null;
    hold_expires_at: Date | null;
    hold_status: string | null;
    block_kind: string | null;
    block_reason: string | null;
  }>(sql`
    SELECT n.unit_id, to_char(n.night, 'YYYY-MM-DD') AS night, n.kind,
      b.id AS booking_id, b.reference, b.status, b.lead_name,
      h.expires_at AS hold_expires_at, h.status AS hold_status,
      ab.kind AS block_kind, ab.reason AS block_reason
    FROM unit_nights n
    LEFT JOIN booking_units bu ON bu.id = n.booking_unit_id
    LEFT JOIN bookings b ON b.id = bu.booking_id
    LEFT JOIN inventory_holds h ON h.booking_id = b.id
    LEFT JOIN availability_blocks ab ON ab.id = n.block_id
    WHERE n.night >= ${from} AND n.night < ${to}`);
  return rows.rows;
}

export { inventoryHolds };
