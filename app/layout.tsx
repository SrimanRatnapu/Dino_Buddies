import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import "@/styles/globals.css";

// Atkinson Hyperlegible Next (Braille Institute), as specified by the Stitch design system.
// Next has no fallback metrics for this font, so "swap" would reflow the page
// (and move the big buttons) when it arrives. "optional" uses it only if it is
// ready on first paint (it is preloaded, and cached after the first visit), and
// otherwise keeps the system font for that visit: no layout shift either way.
const font = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "optional",
  adjustFontFallback: false,
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
});

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
