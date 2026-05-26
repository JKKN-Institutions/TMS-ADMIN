import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MYJKKN TMS - Admin Portal",
  description: "Transportation Management System - Admin Portal",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
