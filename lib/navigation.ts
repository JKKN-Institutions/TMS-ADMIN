import {
  LayoutDashboard,
  Route,
  Users,
  Car,
  Calendar,
  CreditCard,
  Bell,
  MessageCircle,
  BarChart3,
  Settings,
  Bus,
  UserCheck,
  Shield,
  FileText,
  Navigation,
  Zap,
  Bug,
  ClipboardCheck,
  GraduationCap,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { TMS_PERMISSIONS } from '@/lib/constants/tms-permissions';

// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for the admin navigation. Consumed by BOTH the desktop
// sidebar (app/(admin)/layout.tsx) and the mobile bottom navbar
// (components/bottom-nav.tsx) so the two never drift. Each item carries the TMS
// permission key that gates its visibility.
// ─────────────────────────────────────────────────────────────────────────────

export type NavGroup = 'overview' | 'passengers' | 'transport' | 'services' | 'system';

export interface NavItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  permission: string;
  group: NavGroup;
  subItems?: { name: string; href: string; icon: ComponentType<{ className?: string }> }[];
}

export const allNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permission: TMS_PERMISSIONS.DASHBOARD_VIEW, group: 'overview' },
  { name: 'Analytics', href: '/analytics', icon: BarChart3, permission: TMS_PERMISSIONS.REPORTS_VIEW, group: 'overview' },
  // Passenger module — split into two pages: bus-required learners and staff
  // (both sourced from the MyJKKN master tables, filtered on bus_required).
  { name: 'Learners', href: '/passengers/learners', icon: GraduationCap, permission: TMS_PERMISSIONS.ENROLLMENT_VIEW, group: 'passengers' },
  { name: 'Staff', href: '/passengers/staff', icon: Users, permission: TMS_PERMISSIONS.ENROLLMENT_VIEW, group: 'passengers' },
  { name: 'Drivers', href: '/drivers', icon: UserCheck, permission: TMS_PERMISSIONS.DRIVERS_VIEW, group: 'transport' },
  { name: 'Vehicles', href: '/vehicles', icon: Car, permission: TMS_PERMISSIONS.VEHICLES_VIEW, group: 'transport' },
  { name: 'GPS Devices', href: '/gps-devices', icon: Navigation, permission: TMS_PERMISSIONS.TRACKING_VIEW, group: 'transport' },
  { name: 'Track All', href: '/track-all', icon: Bus, permission: TMS_PERMISSIONS.TRACKING_VIEW, group: 'transport' },
  { name: 'Routes', href: '/routes', icon: Route, permission: TMS_PERMISSIONS.ROUTES_VIEW, group: 'transport' },
  { name: 'Schedules', href: '/schedules', icon: Calendar, permission: TMS_PERMISSIONS.SCHEDULES_VIEW, group: 'transport' },
  { name: 'Route Optimization', href: '/route-optimization', icon: Zap, permission: TMS_PERMISSIONS.ROUTES_EDIT, group: 'transport' },
  { name: 'Staff Assignments', href: '/staff-route-assignments', icon: ClipboardCheck, permission: TMS_PERMISSIONS.DRIVERS_ASSIGN, group: 'transport' },
  { name: 'Enrollments', href: '/enrollment-requests', icon: FileText, permission: TMS_PERMISSIONS.ENROLLMENT_MANAGE, group: 'services' },
  { name: 'Grievances', href: '/grievances', icon: MessageCircle, permission: TMS_PERMISSIONS.GRIEVANCES_MANAGE, group: 'services' },
  { name: 'My Grievances', href: '/my-grievances', icon: MessageCircle, permission: TMS_PERMISSIONS.GRIEVANCES_SUBMIT, group: 'services' },
  { name: 'Payments', href: '/payments', icon: CreditCard, permission: TMS_PERMISSIONS.BOOKINGS_VIEW_ALL, group: 'services' },
  {
    name: 'Notifications',
    href: '/notifications',
    icon: Bell,
    permission: TMS_PERMISSIONS.SETTINGS_VIEW,
    group: 'services',
    subItems: [
      { name: 'All Notifications', href: '/notifications', icon: Bell },
      { name: 'Push Notifications', href: '/notifications/push', icon: Bell },
    ],
  },
  { name: 'Bug Management', href: '/bug-management', icon: Bug, permission: TMS_PERMISSIONS.SETTINGS_MANAGE, group: 'services' },
  { name: 'Authorize', href: '/authorize', icon: Shield, permission: TMS_PERMISSIONS.SETTINGS_MANAGE, group: 'system' },
  { name: 'Settings', href: '/settings', icon: Settings, permission: TMS_PERMISSIONS.SETTINGS_MANAGE, group: 'system' },
];

export const GROUP_TITLES: Record<NavGroup, string> = {
  overview: 'OVERVIEW',
  passengers: 'PASSENGERS',
  transport: 'TRANSPORT',
  services: 'SERVICES',
  system: 'SYSTEM',
};

// Ordered list of groups (used by the bottom-nav More sheet).
export const NAV_GROUP_ORDER: NavGroup[] = ['overview', 'passengers', 'transport', 'services', 'system'];

// Flat list of every nav entry (incl. sub-items) used to resolve the active
// module name shown in the header.
export const NAV_TITLE_LOOKUP: { name: string; href: string }[] = allNavigation.flatMap((item) => [
  { name: item.name, href: item.href },
  ...(item.subItems ?? []).map((s) => ({ name: s.name, href: s.href })),
]);

// Resolve the page title from the current path: prefer the longest matching
// nav href, otherwise title-case the first path segment.
export const derivePageTitle = (path: string): string => {
  const match = NAV_TITLE_LOOKUP.filter(
    (i) => path === i.href || path.startsWith(i.href + '/')
  ).sort((a, b) => b.href.length - a.href.length)[0];
  if (match) return match.name;
  const seg = path.split('/').filter(Boolean)[0];
  if (!seg) return 'Dashboard';
  return seg.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};
