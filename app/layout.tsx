import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import "@/styles/globals.css";

// Atkinson Hyperlegible Next (Braille Institute), as specified by the Stitch design system.
const font = Atkinson_Hyperlegible_Next({ subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: "Wildlife Described",
  description: "Point your camera at an exhibit or animal and hear it described aloud.",
  applicationName: "Wildlife Described",
  appleWebApp: { capable: true, title: "Wildlife Described", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={font.className}>
      <body>{children}</body>
    </html>
  );
}
