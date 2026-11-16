import { cache } from "react";
import type { SiteInfo } from "@/components/site/chrome";
import { getSettings, isConfirmed, onlineBookingStatus } from "@/domain/settings";
import { analyticsConfig, isDemoMode } from "./config";
import { getStaff } from "./staff";

export const getSiteInfo = cache(async (): Promise<SiteInfo & { analytics: boolean }> => {
  const s = await getSettings();
  const status = await onlineBookingStatus();
  const digits = s.phone.replace(/[^\d+]/g, "");
  const address = `${s.addressLine}, ${s.city}, ${s.region} ${s.postalCode}`;
  const mapOk = isConfirmed(s, "map");
  const hasPin = mapOk && s.mapLat && s.mapLng;
  const wa = s.whatsappNumber && isConfirmed(s, "whatsapp") ? `https://wa.me/${s.whatsappNumber.replace(/\D/g, "")}` : null;
  return {
    name: s.name,
    phone: s.phone,
    phoneHref: `tel:${digits}`,
    email: s.email,
    address,
    whatsappHref: wa,
    whatsappConfirmed: Boolean(wa),
    mapUrl: s.mapUrl && mapOk ? s.mapUrl : null,
    // Embedded map: the business listing (name + address), centred on the confirmed pin
    mapEmbedUrl: hasPin ? `https://www.google.com/maps?q=${encodeURIComponent(`${s.name}, ${address}`)}&ll=${s.mapLat},${s.mapLng}&z=16&hl=en&output=embed` : null,
    directionsUrl: hasPin ? `https://www.google.com/maps/dir/?api=1&destination=${s.mapLat},${s.mapLng}` : s.mapUrl && mapOk ? s.mapUrl : null,
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
