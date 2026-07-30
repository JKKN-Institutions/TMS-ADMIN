import type { Metadata, Viewport } from "next";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";
import { AuthProvider } from "@/providers/auth-provider";
import { ThemeProvider, themeInitScript } from "@/components/theme-provider";
import PwaProvider from "@/components/pwa/pwa-provider";

export const metadata: Metadata = {
  title: "MYJKKN TMS - Admin Portal",
  description: "Transportation Management System - Admin Portal",
  applicationName: "JKKN TMS",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "JKKN TMS",
  },
  // GOTCHA: declaring `icons` at all DISABLES the app/icon.png file convention.
  // Next only injects file-convention icons when metadata.icons is undefined
  // (resolve-metadata.js: `if (!resolvedMetadata.icons)`), so it replaces rather
  // than merges — an `icons` block with only `apple` silently drops the favicon.
  // Every icon we want must therefore be listed here explicitly.
  //
  // These all derive from the app/icon.png master via scripts/generate-pwa-icons.js
  // and are precached by public/sw.js. We point at the 192/512 variants rather than
  // the raw /icon.png route because the master is 1080x1080 (~141 KB) — far too
  // heavy to ship as a tab icon on every cold load.
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#16a34a" },
    { media: "(prefers-color-scheme: dark)", color: "#14532d" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      {/* suppressHydrationWarning: browser extensions (ColorZilla → cz-shortcut-listen,
          Grammarly, etc.) mutate <body> attributes before React hydrates. Like the
          <html> tag above, this suppresses only THIS element's own attribute mismatch
          — it does NOT mask genuine hydration bugs in child components. */}
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>{children}</AuthProvider>
          </QueryProvider>
          {/* PWA install/update affordances + service-worker registration for all
              four portals. Outside QueryProvider/AuthProvider — needs neither. */}
          <PwaProvider />
        </ThemeProvider>
      </body>
    </html>
  );
}
