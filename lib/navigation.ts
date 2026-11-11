import {
  LayoutDashboard,
  Route,
  Users,
  Car,
  Calendar,
  CalendarCheck,
  Bell,
  MessageCircle,
  BarChart3,
  Settings,
  Bus,
  UserCheck,
  Navigation,
  Zap,
  ClipboardCheck,
  GraduationCap,
  CalendarRange,
  History,
  Receipt,
  Wallet,
  Bug,
  IndianRupee,
  ClipboardList,
  ShieldCheck,
  Truck,
  MapPin,
  Map as MapIcon,
  CalendarDays,
  LayoutGrid,
  ListChecks,
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

/**
 * A collapsible parent inside a sidebar section. The TRANSPORT section had 13
 * flat links; folders fold them into a few groups, one open at a time. A folder
 * is not a page: its header only opens it, the pages inside are the links.
 */
export type NavFolderKey = 'fleet' | 'tracking' | 'routes' | 'attendance';

export interface NavFolder {
  key: NavFolderKey;
  name: string;
  icon: ComponentType<{ className?: string }>;
}

/** In display order. */
export const NAV_FOLDERS: NavFolder[] = [
  { key: 'fleet', name: 'Fleet', icon: Truck },
  { key: 'tracking', name: 'Tracking', icon: MapPin },
  { key: 'routes', name: 'Routes & Trips', icon: MapIcon },
  { key: 'attendance', name: 'Attendance', icon: ClipboardList },
];

export const NAV_FOLDER_BY_KEY = Object.fromEntries(NAV_FOLDERS.map((f) => [f.key, f])) as Record<NavFolderKey, NavFolder>;

export interface NavItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  permission: string;
  group: NavGroup;
  /** The collapsible folder this page sits in (see NAV_FOLDERS). */
  folder?: NavFolderKey;
  subItems?: { name: string; href: string; icon: ComponentType<{ className?: string }> }[];
  /** Visible if the user holds ANY of these (defaults to [permission]). */
  anyPermission?: string[];
  /** Extra paths that belong to this page, for the header title/breadcrumb only (not shown in the sidebar). */
  aliases?: { name: string; href: string }[];
}

/** Sidebar / bottom-bar visibility for one nav item. */
export const canSeeNavItem = (item: NavItem, can: (permission: string) => boolean) =>
  (item.anyPermission ?? [item.permission]).some((p) => can(p));

export const allNavigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permission: TMS_PERMISSIONS.DASHBOARD_VIEW, group: 'overview' },
  { name: 'Analytics', href: '/analytics', icon: BarChart3, permission: TMS_PERMISSIONS.REPORTS_VIEW, group: 'overview' },
  // Passenger module — split into two pages: bus-required learners and staff
  // (both sourced from the MyJKKN master tables, filtered on bus_required).
  { name: 'Learners', href: '/passengers/learners', icon: GraduationCap, permission: TMS_PERMISSIONS.ENROLLMENT_VIEW, group: 'passengers' },
  { name: 'Staff', href: '/passengers/staff', icon: Users, permission: TMS_PERMISSIONS.ENROLLMENT_VIEW, group: 'passengers' },
  // ── TRANSPORT, folded into four folders ────────────────────────────────────
  { name: 'Drivers', href: '/drivers', icon: UserCheck, permission: TMS_PERMISSIONS.DRIVERS_VIEW, group: 'transport', folder: 'fleet' },
  { name: 'Vehicles', href: '/vehicles', icon: Car, permission: TMS_PERMISSIONS.VEHICLES_VIEW, group: 'transport', folder: 'fleet' },
  { name: 'Bus Inspection', href: '/inspections', icon: ShieldCheck, permission: TMS_PERMISSIONS.ROUTE_CHECK_MANAGE, group: 'transport', folder: 'fleet' },
  { name: 'Pre-trip Checks', href: '/pre-trip-checks', icon: ClipboardCheck, permission: TMS_PERMISSIONS.DASHBOARD_VIEW, group: 'transport', folder: 'fleet' },
  { name: 'Track All', href: '/track-all', icon: Bus, permission: TMS_PERMISSIONS.TRACKING_VIEW, group: 'transport', folder: 'tracking' },
  // GPS devices + driver phones: one page, two tabs (each gated by its own permission).
  {
    name: 'Tracking Devices',
    href: '/tracking-devices',
    icon: Navigation,
    permission: TMS_PERMISSIONS.TRACKING_VIEW,
    anyPermission: [TMS_PERMISSIONS.TRACKING_VIEW, TMS_PERMISSIONS.DRIVER_MOBILES_VIEW],
    group: 'transport',
    folder: 'tracking',
    aliases: [
      { name: 'GPS Devices', href: '/gps-devices' },
      { name: 'Tracking Mobiles', href: '/driver-mobiles' },
    ],
  },
  { name: 'Routes', href: '/routes', icon: Route, permission: TMS_PERMISSIONS.ROUTES_VIEW, group: 'transport', folder: 'routes' },
  { name: 'Schedules', href: '/schedules', icon: Calendar, permission: TMS_PERMISSIONS.SCHEDULES_VIEW, group: 'transport', folder: 'routes' },
  { name: 'Bookings', href: '/bookings', icon: CalendarCheck, permission: TMS_PERMISSIONS.BOOKINGS_VIEW, group: 'transport', folder: 'routes' },
  { name: 'Route Optimization', href: '/route-optimization', icon: Zap, permission: TMS_PERMISSIONS.ROUTES_EDIT, group: 'transport', folder: 'routes' },
  { name: 'Staff Assignments', href: '/staff-route-assignments', icon: ClipboardCheck, permission: TMS_PERMISSIONS.DRIVERS_ASSIGN, group: 'transport', folder: 'routes' },
  { name: 'Transport Years', href: '/transport-years', icon: CalendarRange, permission: TMS_PERMISSIONS.TRANSPORT_YEARS_VIEW, group: 'transport', folder: 'routes' },
  // Attendance is three pages. /attendance is a prefix of the other two, so
  // "which link is lit" must go through activeNavHref (longest match), never a
  // bare startsWith. The bus/day drill-down (/attendance/<route>/<date>) and the
  // learner report (/attendance/learners/<id>) light up their parent list.
  { name: 'Daily Report', href: '/attendance', icon: CalendarDays, permission: TMS_PERMISSIONS.ATTENDANCE_VIEW, group: 'transport', folder: 'attendance' },
  { name: 'Bus Coverage', href: '/attendance/coverage', icon: LayoutGrid, permission: TMS_PERMISSIONS.ATTENDANCE_VIEW, group: 'transport', folder: 'attendance' },
  { name: 'Learner Register', href: '/attendance/learners', icon: ListChecks, permission: TMS_PERMISSIONS.ATTENDANCE_VIEW, group: 'transport', folder: 'attendance' },
  { name: 'In-charge Marking', href: '/attendance/incharges', icon: UserCheck, permission: TMS_PERMISSIONS.ATTENDANCE_VIEW, group: 'transport', folder: 'attendance' },
  // 'Enrollments' (/enrollment-requests) merged into Learners — assign a route
  // from any learner row; the old URL redirects to the unassigned view.
  { name: 'Grievances', href: '/grievances', icon: MessageCircle, permission: TMS_PERMISSIONS.GRIEVANCES_MANAGE, group: 'services' },
  // Two distinct charges live under /fees: the recurring MAINTENANCE fee the
  // institution collects, and the TRANSPORT FEE charged when it goes unpaid.
  // The child entry is what makes the header read "Transport Fee" on the rates
  // page — derivePageTitle() matches the longest nav href, so without it that
  // page would show the parent's name.
  {
    name: 'Maintenance Fee',
    href: '/fees',
    icon: Receipt,
    permission: TMS_PERMISSIONS.FEES_VIEW,
    group: 'services',
    subItems: [{ name: 'Transport Fee', href: '/fees/fine-rates', icon: IndianRupee }],
  },
  { name: 'Bill Management', href: '/bill-management', icon: Wallet, permission: TMS_PERMISSIONS.FEES_VIEW, group: 'services' },
  { name: 'Notifications', href: '/notifications', icon: Bell, permission: TMS_PERMISSIONS.NOTIFICATIONS_VIEW, group: 'services' },
  { name: 'Settings', href: '/settings', icon: Settings, permission: TMS_PERMISSIONS.SETTINGS_MANAGE, group: 'system' },
  { name: 'Activity Log', href: '/activity-log', icon: History, permission: TMS_PERMISSIONS.ACTIVITY_VIEW, group: 'system' },
  { name: 'Bug Reports', href: '/bug-reports', icon: Bug, permission: TMS_PERMISSIONS.SETTINGS_MANAGE, group: 'system' },
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

const matchesHref = (path: string, href: string) => path === href || path.startsWith(href + '/');

/**
 * The one nav href that is "current" for a path: the LONGEST one that matches.
 * A bare startsWith would light Daily Report (/attendance) on every attendance
 * page, since its href is a prefix of its siblings'.
 */
export const activeNavHref = (path: string, hrefs?: readonly string[]): string | null =>
  (hrefs ?? allNavigation.map((i) => i.href)).filter((h) => matchesHref(path, h)).sort((x, y) => y.length - x.length)[0] ?? null;

/** The folder holding the current page, or null (a page outside any folder). */
export const activeNavFolder = (path: string): NavFolderKey | null => {
  const href = activeNavHref(path);
  return allNavigation.find((i) => i.href === href)?.folder ?? null;
};

// Flat list of every nav entry (incl. sub-items) used to resolve the active
// module name shown in the header.
export const NAV_TITLE_LOOKUP: { name: string; href: string }[] = allNavigation.flatMap((item) => [
  { name: item.name, href: item.href },
  ...(item.subItems ?? []).map((s) => ({ name: s.name, href: s.href })),
  ...(item.aliases ?? []),
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

// Breadcrumb for the top header: the sidebar group the current page lives in
// plus its nav name, e.g. { group: 'Transport', name: 'Vehicles' }. Pages own
// the single big title; the header only says where you are.
export const derivePageCrumb = (path: string): { group: string | null; name: string; href: string | null } => {
  const match = allNavigation
    .flatMap((item) => [
      { name: item.name, href: item.href, group: item.group, folder: item.folder },
      ...(item.subItems ?? []).map((s) => ({ name: s.name, href: s.href, group: item.group, folder: item.folder })),
      ...(item.aliases ?? []).map((a) => ({ name: a.name, href: a.href, group: item.group, folder: item.folder })),
    ])
    .filter((i) => path === i.href || path.startsWith(i.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (!match) return { group: null, name: derivePageTitle(path), href: null };
  // A page in a folder is named by its folder ("Attendance › Bus Coverage");
  // the section name alone would say only "Transport".
  if (match.folder) return { group: NAV_FOLDER_BY_KEY[match.folder].name, name: match.name, href: match.href };
  const g = GROUP_TITLES[match.group];
  return { group: g.charAt(0) + g.slice(1).toLowerCase(), name: match.name, href: match.href };
};
