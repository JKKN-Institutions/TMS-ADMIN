import {
  LayoutDashboard, Route, QrCode, ClipboardCheck, Receipt,
  MessageCircle, Bell, MapPin, User, CalendarCheck,
} from 'lucide-react';
import type { ComponentType } from 'react';

export interface StudentNavItem {
  name: string;
  /** Compact label for tight surfaces (e.g. the mobile bottom bar). Falls back to `name`. */
  shortName?: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** Pages not built yet render disabled. Drop the flag as each phase lands. */
  comingSoon?: boolean;
}

// Confirmed v1 (pass-based): no per-trip booking/schedules. Boarding Pass replaces
// per-trip tickets. Only Home/Profile exist in Phase 1; the rest unlock
// in later phases and render disabled until then.
export const studentNavigation: StudentNavItem[] = [
  { name: 'Home', href: '/student/dashboard', icon: LayoutDashboard },
  { name: 'My Route', href: '/student/routes', icon: Route },
  { name: 'Book Bus', shortName: 'Book', href: '/student/bookings', icon: CalendarCheck },
  { name: 'Boarding Pass', shortName: 'Pass', href: '/student/pass', icon: QrCode },
  { name: 'My Attendance', shortName: 'Attendance', href: '/student/attendance', icon: ClipboardCheck },
  { name: 'Transport Fees', shortName: 'Fees', href: '/student/fees', icon: Receipt },
  { name: 'Grievances', href: '/student/grievances', icon: MessageCircle },
  { name: 'Notifications', href: '/student/notifications', icon: Bell },
  { name: 'Live Track', href: '/student/live-track', icon: MapPin },
  { name: 'Profile', href: '/student/profile', icon: User },
];

// Resolve the header title from the current path (mirrors the admin derivePageTitle).
export function deriveStudentPageTitle(path: string): string {
  const match = studentNavigation
    .filter((i) => path === i.href || path.startsWith(i.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (match) return match.name;
  const seg = path.split('/').filter(Boolean)[1];
  if (!seg) return 'Home';
  return seg.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
