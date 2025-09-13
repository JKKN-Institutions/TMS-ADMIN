import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/auth-context";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MyJKKN Child App",
  description: "A child application integrated with MyJKKN authentication",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider
          autoValidate={true}
          autoRefresh={true}
          refreshInterval={10 * 60 * 1000} // 10 minutes
        >
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
