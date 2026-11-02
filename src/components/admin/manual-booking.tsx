"use client";
import { useState } from "react";
import { manualBookingAction } from "@/app/admin/actions";
import { AForm, CB, F, S, TA } from "./forms";

export function ManualBookingForm({ types, units, defaults }: { types: { id: string; name: string }[]; units: { id: string; label: string; roomTypeId: string; free: boolean }[]; defaults: Record<string, string> }) {
  const [rows, setRows] = useState([{ roomTypeId: defaults.roomTypeId || types[0]?.id || "" }]);
  return (
    <AForm action={manualBookingAction} submit="Create confirmed reservation" submitClass="btn-primary">
      <div className="grid gap-3 sm:grid-cols-3">
        <S label="Source" name="source" options={[["phone", "Phone"], ["whatsapp", "WhatsApp"], ["walk_in", "Walk-in"], ["email", "Email"], ["external_ota", "External platform (OTA)"], ["other", "Other"]]} />
        <F label="External reference (OTA / channel)" name="externalRef" />
        <div />
        <F label="Arrival" name="checkIn" type="date" required defaultValue={defaults.checkIn} />
        <F label="Departure" name="checkOut" type="date" required defaultValue={defaults.checkOut} />
        <div className="grid grid-cols-2 gap-3">
          <F label="Adults" name="adults" type="number" min={1} defaultValue={defaults.adults ?? "2"} required />
          <F label="Children" name="children" type="number" min={0} defaultValue="0" />
        </div>
      </div>
      <fieldset className="space-y-2 rounded-md border border-sand p-3">
        <legend className="px-1 text-xs font-semibold">Rooms</legend>
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <label><span className="field-label">Category</span>
              <select name="roomTypeId" className="field" value={r.roomTypeId} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { roomTypeId: e.target.value } : x)))}>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label><span className="field-label">Unit (optional)</span>
              <select name="unitId" className="field" defaultValue="">
                <option value="">Auto-assign</option>
                {units.filter((u) => u.roomTypeId === r.roomTypeId).map((u) => <option key={u.id} value={u.id}>{u.label}{defaults.checkIn ? (u.free ? " — free" : " — occupied") : ""}</option>)}
              </select>
            </label>
            {rows.length > 1 && <button type="button" className="btn-outline btn-sm self-end" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>}
          </div>
        ))}
        <button type="button" className="btn-outline btn-sm" onClick={() => setRows([...rows, { roomTypeId: types[0]?.id ?? "" }])}>Add room</button>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <F label="Lead guest name" name="leadName" required />
        <F label="Email" name="leadEmail" type="email" required />
        <F label="Phone" name="leadPhone" type="tel" required />
      </div>
      <TA label="Special requests (guest-visible)" name="specialRequests" rows={2} />
      <div className="grid gap-3 sm:grid-cols-2">
        <F label="Agreed total (₹) — leave blank to use configured rates" name="agreedTotal" inputMode="decimal" hint="A different amount is recorded as an audited adjustment." />
        <F label="Reason for agreed total" name="adjustmentReason" />
      </div>
      <CB label="Email a confirmation to the guest" name="sendConfirmation" defaultChecked />
      <p className="text-xs text-muted">Uses the same availability, closure and conflict rules as the website. The reservation is confirmed with payment due; record any money received from the reservation page.</p>
    </AForm>
  );
}
