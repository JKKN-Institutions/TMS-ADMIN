import { LayoutDashboard, Route, Users, MapPin, User } from 'lucide-react';
import type { ComponentType } from 'react';

export interface DriverNavItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  comingSoon?: boolean;
}

// Driver = read-only shell in v1. Only Dashboard is built; the rest land in later
// phases (routes detail, passenger roster, live location broadcast).
export const driverNavigation: DriverNavItem[] = [
  { name: 'Dashboard', href: '/driver/dashboard', icon: LayoutDashboard },
  { name: 'My Routes', href: '/driver/routes', icon: Route, comingSoon: true },
  { name: 'Passengers', href: '/driver/passengers', icon: Users, comingSoon: true },
  { name: 'Live Location', href: '/driver/location', icon: MapPin, comingSoon: true },
  { name: 'Profile', href: '/driver/profile', icon: User, comingSoon: true },
];
