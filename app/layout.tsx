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
  // Favicon comes from the app/icon.png file convention (JKKN logo) — Next
  // generates the <link rel="icon"> tags automatically. The manifest is
  // auto-linked from app/manifest.ts.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "JKKN TMS",
  },
  icons: {
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
