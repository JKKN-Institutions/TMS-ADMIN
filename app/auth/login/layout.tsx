import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';

// Poppins is scoped to the sign-in screen only — the rest of the app keeps the
// global Inter stack from globals.css. next/font self-hosts the files at build
// time, so there is no runtime request to Google Fonts and no layout shift.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-login',
});

export const metadata: Metadata = {
  title: 'Sign in · JKKN Smart Transport',
  description:
    'Sign in with your registered JKKN Google account to access transport services.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${poppins.variable} ${poppins.className}`}>{children}</div>
  );
}
