import { Bus, CreditCard, MessageSquareWarning, Route, ShieldAlert, User, Wrench } from 'lucide-react';
import type { ComponentType } from 'react';
import { grievanceCategoryLabel } from '@/lib/grievances/categories';

// Shared presentational badges for the grievance portals (student/driver/boarding).
// Same visual language as the admin queue so a grievance reads identically wherever
// it appears.

// tms_grievance.status: open | in_progress | resolved | closed
export function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    open: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    resolved: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
    closed: 'bg-gray-200 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300',
  };
  const cls = map[status ?? ''] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {(status ?? 'unknown').replace('_', ' ')}
    </span>
  );
}

// tms_grievance.priority: low | normal | high. 'normal' is the default and the
// common case, so we deliberately render nothing for it — signal over noise.
export function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority || priority === 'normal') return null;
  const map: Record<string, string> = {
    high: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
    low: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  };
  const cls = map[priority] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {priority}
    </span>
  );
}

const CATEGORY_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  bus_delay: Bus,
  driver_behaviour: User,
  vehicle_condition: Wrench,
  route_issue: Route,
  safety: ShieldAlert,
  payment: CreditCard,
  other: MessageSquareWarning,
};

/** The lucide icon for a grievance category (defaults to a generic mark). */
export function categoryIcon(category: string): ComponentType<{ className?: string }> {
  return CATEGORY_ICONS[category] ?? MessageSquareWarning;
}

/** Inline category marker: icon + label, muted. */
export function CategoryTag({ category }: { category: string }) {
  const Icon = categoryIcon(category);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {grievanceCategoryLabel(category)}
    </span>
  );
}
