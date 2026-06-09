'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { usePermissions } from '@/hooks/use-permissions';

export default function BoardingLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const { can, isSuperAdmin, isLoading } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();

  // Boarding staff have the transport_boarding role via user_roles, so can() works
  // (unlike learners/drivers). Server proxy is the real gate; this is UX.
  const allowed = isSuperAdmin || can('tms.attendance.scan');

  useEffect(() => {
    if (loading) return;
    if (!user || !profile) {
      router.replace(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, profile, router, pathname]);

  if (loading || !profile || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-muted-foreground text-sm">
        You don&apos;t have boarding access. Ask an admin to assign you to a route.
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-14 border-b flex items-center px-4 justify-between">
        <span className="font-semibold">JKKN Transport · Boarding</span>
        <button onClick={signOut} className="text-sm text-destructive">
          Sign out
        </button>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
