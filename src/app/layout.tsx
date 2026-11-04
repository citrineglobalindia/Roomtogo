import type { Metadata, Viewport } from "next";
import "./globals.css";
import { publicBaseUrl } from "@/lib/config";

export const metadata: Metadata = {
  metadataBase: new URL(publicBaseUrl()),
  title: { default: "Room2Go — J. P. Nagar, Bengaluru", template: "%s" },
  description: "Book comfortable serviced-apartment rooms directly with Room2Go in J. P. Nagar 2nd Phase, Bengaluru.",
  openGraph: { siteName: "Room2Go", locale: "en_IN", type: "website" },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { themeColor: "#faf6ef", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
