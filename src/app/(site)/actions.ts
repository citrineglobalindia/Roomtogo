"use server";
import type { ActionState } from "@/components/ui/form";
import { submitEnquiry } from "@/domain/enquiries";
import { submitReview } from "@/domain/reviews";
import { safeMessage } from "@/lib/errors";
import { clientKey } from "@/lib/request";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < 1000 ? n : null;
};
const elapsed = (fd: FormData) => {
  const r = Number(str(fd, "_rendered"));
  return r ? Date.now() - r : null;
};

export async function enquiryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const kind = (["general", "extended_stay", "corporate", "booking"].includes(str(fd, "kind")) ? str(fd, "kind") : "general") as "general";
    await submitEnquiry(
      {
        kind,
        name: str(fd, "name"),
        email: str(fd, "email"),
        phone: str(fd, "phone") || null,
        company: str(fd, "company") || null,
        checkIn: str(fd, "checkIn") || null,
        checkOut: str(fd, "checkOut") || null,
        guests: num(fd, "guests"),
        roomsCount: num(fd, "rooms"),
        stayLength: str(fd, "stayLength") || null,
        message: str(fd, "message"),
        website: str(fd, "website"),
        elapsedMs: elapsed(fd),
      },
      await clientKey(),
    );
    return { ok: true, message: "Thank you — your enquiry has been received. Our team will get back to you soon." };
  } catch (e) {
    return { error: safeMessage(e) };
  }
}

export async function reviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const rating = num(fd, "rating");
    await submitReview(
      {
        authorName: str(fd, "authorName"),
        displayLabel: str(fd, "displayLabel"),
        email: str(fd, "email"),
        rating: rating && rating >= 1 && rating <= 5 ? rating : null,
        title: str(fd, "title"),
        body: str(fd, "body"),
        stayMonth: str(fd, "stayMonth"),
        consent: fd.get("consent") === "on",
        inviteToken: str(fd, "invite") || null,
        website: str(fd, "website"),
      },
      await clientKey(),
    );
    return { ok: true, message: "Thank you for sharing your experience. Reviews are published after moderation." };
  } catch (e) {
    return { error: safeMessage(e) };
  }
}
