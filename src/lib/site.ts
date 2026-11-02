import { cache } from "react";
import type { SiteInfo } from "@/components/site/chrome";
import { getSettings, isConfirmed, onlineBookingStatus } from "@/domain/settings";
import { analyticsConfig, isDemoMode } from "./config";
import { getStaff } from "./staff";

export const getSiteInfo = cache(async (): Promise<SiteInfo & { analytics: boolean }> => {
  const s = await getSettings();
  const status = await onlineBookingStatus();
  const digits = s.phone.replace(/[^\d+]/g, "");
  const wa = s.whatsappNumber && isConfirmed(s, "whatsapp") ? `https://wa.me/${s.whatsappNumber.replace(/\D/g, "")}` : null;
  return {
    name: s.name,
    phone: s.phone,
    phoneHref: `tel:${digits}`,
    email: s.email,
    address: `${s.addressLine}, ${s.city}, ${s.region} ${s.postalCode}`,
    whatsappHref: wa,
    whatsappConfirmed: Boolean(wa),
    mapUrl: s.mapUrl && isConfirmed(s, "map") ? s.mapUrl : null,
    socials: s.socialLinks ?? {},
    demo: isDemoMode(),
    bookingOpen: status.open,
    analytics: analyticsConfig().provider !== "none",
  };
});

/** Draft preview is only honoured for signed-in staff with content permission. */
export async function canPreview(searchParams: Record<string, string | string[] | undefined> | undefined) {
  if (!searchParams || searchParams.preview !== "1") return false;
  const staff = await getStaff();
  return Boolean(staff?.can("content.manage"));
}
