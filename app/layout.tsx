import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";
import { AuthProvider } from "@/providers/auth-provider";
import { ThemeProvider, themeInitScript } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "MYJKKN TMS - Admin Portal",
  description: "Transportation Management System - Admin Portal",
  // Favicon comes from the app/icon.png file convention (JKKN logo) — Next
  // generates the <link rel="icon"> tags automatically.
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
        </ThemeProvider>
      </body>
    </html>
  );
}
