import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "@/styles/globals.css";

// Built with tasteskill (.claude/skills/design-taste-frontend). The kit lives in public/assets and is
// loaded as plain files, in the order starter.html gives. The :root block is exactly what
// `start.mjs css --page software --palette blue-black-cornflower --type plex --radius round` printed.
const ROOT_TOKENS = `:root {
  --p-bg: #0a0d14; --p-surface: #131824; --p-ink: #e9edf3; --p-muted: #8891a1;
  --p-accent: #5ab9fc; --p-accent-ink: #0a0d14; --p-action: #5ab9fc; --p-action-ink: #0a0d14;
  --p-inv-bg: #e9edf3; --p-inv-surface: #d7dbe1; --p-inv-ink: #0a0d14; --p-inv-muted: #54575f;
  --p-inv-accent: #0a0d14; --p-inv-accent-ink: #e9edf3; --p-inv-action: #0a0d14; --p-inv-action-ink: #e9edf3;
  --font-display: "IBM Plex Sans", system-ui, sans-serif;
  --font-text: "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  --display-weight: 500;
  --display-tracking: -0.025em;
  --display-tracking-xl: -0.035em;
  --ly-scale: 0.98;
}`;

// The hero's entrance and the moments guard, before the first paint (starter.html keeps both).
const HEAD_GUARDS =
  "document.documentElement.classList.add('m-enter');setTimeout(()=>document.documentElement.classList.add('m-enter-done'),700);" +
  "document.documentElement.classList.add('mo-js');setTimeout(()=>document.documentElement.classList.add('mo-safe'),2500);";

const TITLE = "Wildlife Described: a talking camera for blind museum and zoo visitors";
const DESCRIPTION =
  "Point a phone at a dinosaur skeleton or a giraffe and hear what it is, how big it is and how it stands.";

export const metadata: Metadata = {
  // The share card needs an absolute URL; set SITE_URL to the deployed address (DEPLOY.md).
  metadataBase: process.env.SITE_URL ? new URL(process.env.SITE_URL) : undefined,
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Wildlife Described",
  appleWebApp: { capable: true, title: "Wildlife Described", statusBarStyle: "black" },
  openGraph: { type: "website", title: TITLE, description: DESCRIPTION, images: ["/share.jpg"] },
  twitter: { card: "summary_large_image" },
  other: { "site-kind": "software", "page-type": "software" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0d14",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The kit's head script adds classes to <html> before React hydrates, so its attributes differ by design.
    <html
      lang="en"
      data-type="software"
      data-radius="round"
      data-ground="sand"
      data-buttons="solid"
      data-motion=""
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wdth,wght@85..100,400..700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
        <link rel="stylesheet" href="/assets/system.css" />
        <link rel="stylesheet" href="/assets/ui/cards.css" />
        <link rel="stylesheet" href="/assets/motion/motion.css" />
        <link rel="stylesheet" href="/assets/backgrounds/backgrounds.css" />
        <link rel="stylesheet" href="/assets/layout/layout.css" />
        <link rel="stylesheet" href="/assets/icons/icon.css" />
        <style dangerouslySetInnerHTML={{ __html: ROOT_TOKENS }} />
        <link rel="stylesheet" href="/assets/ui/base.css" />
        <link rel="stylesheet" href="/assets/ui/code/fragment.css" />
        <link rel="stylesheet" href="/assets/ui/chat/fragment.css" />
        <link rel="stylesheet" href="/assets/ui/voice/fragment.css" />
        <script dangerouslySetInnerHTML={{ __html: HEAD_GUARDS }} />
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/assets/backgrounds/backgrounds.js" />
        <link rel="modulepreload" href="/assets/moments/moments.js" />
        <link rel="modulepreload" href="/assets/moments/lib.js" />
        <link rel="modulepreload" href="/assets/moments/liquid-type/moment.js" />
      </head>
      <body>
        {children}
        {/* After hydration, so the kit never edits markup React is still matching. */}
        <Script type="module" src="/assets/system.js" strategy="afterInteractive" />
        <Script type="module" src="/assets/motion/motion.js" strategy="afterInteractive" />
        <Script type="module" src="/assets/layout/layout.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
