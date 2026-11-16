import { redirect } from "next/navigation";

/** Online payment is no longer part of the guest flow: reservations are confirmed by email OTP and paid later. */
export default async function PayRedirect({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  redirect(`/booking/confirmation?ref=${encodeURIComponent(ref)}`);
}
