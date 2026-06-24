import { LayoutDashboard, Route, Users, MapPin, User } from 'lucide-react';
import type { ComponentType } from 'react';

export interface DriverNavItem {
  name: string;
  /** Compact label for tight surfaces (e.g. the mobile bottom bar). Falls back to `name`. */
  shortName?: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  comingSoon?: boolean;
}

// Driver = read-only shell in v1. Only Dashboard is built; the rest land in later
// phases (routes detail, passenger roster, live location broadcast).
export const driverNavigation: DriverNavItem[] = [
  { name: 'Dashboard', href: '/driver/dashboard', icon: LayoutDashboard },
  { name: 'My Routes', shortName: 'Routes', href: '/driver/routes', icon: Route },
  { name: 'Passengers', shortName: 'Riders', href: '/driver/passengers', icon: Users },
  { name: 'Live Location', shortName: 'Live', href: '/driver/location', icon: MapPin },
  { name: 'Profile', href: '/driver/profile', icon: User },
];

// Resolve the header title from the current path (mirrors deriveStudentPageTitle).
export function deriveDriverPageTitle(path: string): string {
  const match = driverNavigation
    .filter((i) => path === i.href || path.startsWith(i.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (match) return match.name;
  const seg = path.split('/').filter(Boolean)[1];
  if (!seg) return 'Dashboard';
  return seg.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
