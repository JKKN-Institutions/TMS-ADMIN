'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { usePermissions } from '@/hooks/use-permissions';
import { studentNavigation } from '@/lib/student/navigation';
import { cn } from '@/lib/utils';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const { isStudent, isSuperAdmin } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user || !profile) {
      router.replace(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    // The proxy is the real server-side boundary; this is a fast client guard.
    // Gate on ROLE (not can()) because the client merged-permissions RPC ignores
    // the profiles.role fallback that grants students their keys server-side.
    if (!isStudent && !isSuperAdmin) router.replace('/dashboard');
  }, [loading, user, profile, isStudent, isSuperAdmin, router, pathname]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-card">
        <div className="h-14 flex items-center px-4 font-semibold">JKKN Transport</div>
        <nav className="flex-1 px-2 space-y-1">
          {studentNavigation.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return item.comingSoon ? (
              <span
                key={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground/60 cursor-not-allowed"
              >
                <Icon className="h-4 w-4" /> {item.name}
                <span className="ml-auto text-[10px] uppercase tracking-wide">soon</span>
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm',
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground hover:bg-muted'
                )}
              >
                <Icon className="h-4 w-4" /> {item.name}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={signOut}
          className="m-2 px-3 py-2 text-sm text-left text-destructive hover:bg-muted rounded-md"
        >
          Sign out
        </button>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b flex items-center px-4 justify-between">
          <span className="font-medium md:hidden">JKKN Transport</span>
          <span className="text-sm text-muted-foreground truncate">
            {profile.full_name || profile.email}
          </span>
        </header>
        <main className="flex-1 p-4 pb-20 md:pb-4">{children}</main>
      </div>

      {/* Mobile bottom nav (built items only) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t bg-card flex justify-around py-2">
        {studentNavigation
          .filter((i) => !i.comingSoon)
          .slice(0, 5)
          .map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center text-[11px]',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5" /> {item.name}
              </Link>
            );
          })}
      </nav>
    </div>
  );
}
