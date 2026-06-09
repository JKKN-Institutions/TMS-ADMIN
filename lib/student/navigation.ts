import {
  LayoutDashboard, Route, QrCode, ClipboardCheck, CreditCard,
  MessageCircle, Bell, MapPin, User, Settings,
} from 'lucide-react';
import type { ComponentType } from 'react';

export interface StudentNavItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** Pages not built yet render disabled. Drop the flag as each phase lands. */
  comingSoon?: boolean;
}

// Confirmed v1 (pass-based): no per-trip booking/schedules. Boarding Pass replaces
// per-trip tickets. Only Home/Profile/Settings exist in Phase 1; the rest unlock
// in later phases and render disabled until then.
export const studentNavigation: StudentNavItem[] = [
  { name: 'Home', href: '/student/dashboard', icon: LayoutDashboard },
  { name: 'My Route', href: '/student/routes', icon: Route },
  { name: 'Boarding Pass', href: '/student/pass', icon: QrCode, comingSoon: true },
  { name: 'My Attendance', href: '/student/attendance', icon: ClipboardCheck, comingSoon: true },
  { name: 'Payments', href: '/student/payments', icon: CreditCard, comingSoon: true },
  { name: 'Grievances', href: '/student/grievances', icon: MessageCircle, comingSoon: true },
  { name: 'Notifications', href: '/student/notifications', icon: Bell },
  { name: 'Live Track', href: '/student/live-track', icon: MapPin, comingSoon: true },
  { name: 'Profile', href: '/student/profile', icon: User },
  { name: 'Settings', href: '/student/settings', icon: Settings },
];
