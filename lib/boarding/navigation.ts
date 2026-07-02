import { LayoutDashboard, Route as RouteIcon, Users, ListChecks, ScanLine, MapPin, MessageCircle, type LucideIcon } from 'lucide-react';

export interface BoardingNavItem {
  name: string;
  shortName?: string;
  href: string;
  icon: LucideIcon;
}

/** Boarding-staff portal destinations (shared by the sidebar + mobile bottom nav). */
export const boardingNavigation: BoardingNavItem[] = [
  { name: 'Dashboard', href: '/boarding/dashboard', icon: LayoutDashboard },
  { name: 'My Route', shortName: 'Route', href: '/boarding/routes', icon: RouteIcon },
  { name: 'Passengers', shortName: 'Riders', href: '/boarding/passengers', icon: Users },
  { name: 'Live Location', shortName: 'Live', href: '/boarding/live-track', icon: MapPin },
  { name: 'Attendance', href: '/boarding/attendance', icon: ListChecks },
  { name: 'Scan', href: '/boarding/scan', icon: ScanLine },
  { name: 'Grievances', href: '/boarding/grievances', icon: MessageCircle },
];

const TITLES: Record<string, string> = {
  '/boarding/dashboard': 'Dashboard',
  '/boarding/routes': 'My Route',
  '/boarding/passengers': 'Passengers',
  '/boarding/live-track': 'Live Location',
  '/boarding/attendance': 'Attendance',
  '/boarding/scan': 'Scan Boarding Pass',
  '/boarding/grievances': 'Grievances',
};

/** Page title for the header — handles the dynamic roster route too. */
export function deriveBoardingPageTitle(pathname: string): string {
  if (pathname.startsWith('/boarding/routes/')) return 'Route Roster';
  return TITLES[pathname] ?? 'Boarding';
}
