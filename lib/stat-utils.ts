// Utility functions for calculating real trends and formatting data

export interface TrendData {
  value: number;
  direction: 'up' | 'down' | 'neutral';
  timeframe?: string;
}

export interface StatData {
  current: number;
  previous?: number;
  timeframe?: string;
}

/**
 * Calculate trend percentage and direction from current and previous values
 */
export function calculateTrend(current: number, previous: number, timeframe: string = 'vs last period'): TrendData {
  if (isNaN(current) || isNaN(previous) || previous === 0) {
    return {
      value: 0,
      direction: 'neutral',
      timeframe
    };
  }

  const change = ((current - previous) / previous) * 100;
  
  return {
    value: Math.abs(change),
    direction: change > 0.5 ? 'up' : change < -0.5 ? 'down' : 'neutral',
    timeframe
  };
}

/**
 * Trend for a stat card, or `undefined` when there is no baseline to compare to.
 *
 * This replaces the former `generateMockTrend()`, which invented a previous
 * value with `Math.random()`. Every stat card in the app therefore displayed a
 * fabricated percentage that changed on each refresh while the underlying count
 * stayed put. An absent arrow is honest; a random one is not — so callers that
 * cannot supply `previous` now get no arrow at all.
 */
export function trendOf(
  stat: { current: number; previous?: number | null },
  timeframe: string = 'vs last month'
): TrendData | undefined {
  if (stat.previous === undefined || stat.previous === null) return undefined;
  return calculateTrend(stat.current, stat.previous, timeframe);
}

/**
 * Safe number formatting with NaN protection
 */
export function safeNumber(value: any, defaultValue: number = 0): number {
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Format numbers for display (K, M abbreviations)
 */
export function formatDisplayNumber(value: number): string {
  if (isNaN(value)) return '0';
  
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  
  return value.toLocaleString();
}

/**
 * Format currency values
 */
export function formatCurrency(value: number, currency: string = '₹'): string {
  if (isNaN(value)) return `${currency}0`;
  
  if (value >= 1000000) {
    return `${currency}${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `${currency}${(value / 1000).toFixed(1)}K`;
  }
  
  return `${currency}${value.toLocaleString()}`;
}

/**
 * Calculate percentage with NaN protection
 */
export function safePercentage(numerator: number, denominator: number): number {
  if (isNaN(numerator) || isNaN(denominator) || denominator === 0) {
    return 0;
  }
  
  return Math.round((numerator / denominator) * 100);
}

/**
 * Generate consistent stat cards data structure
 */
export interface StatCardData {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: TrendData;
  color: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'indigo' | 'pink' | 'cyan' | 'orange' | 'teal';
  badge?: string;
}

/**
 * Create standardized dashboard stats with real trend calculations
 */
export function createDashboardStats(data: {
  totalStudents: { current: number; previous?: number };
  totalRoutes: { current: number; previous?: number };
  totalDrivers: { current: number; previous?: number };
  totalVehicles: { current: number; previous?: number };
  todayRevenue: { current: number; previous?: number };
  activeBookings: { current: number; previous?: number };
  pendingGrievances: { current: number; previous?: number };
}): StatCardData[] {
  return [
    {
      title: 'Total Students',
      value: safeNumber(data.totalStudents.current),
      subtitle: 'Enrolled students',
      trend: trendOf(data.totalStudents),
      color: 'blue'
    },
    {
      title: 'Active Routes',
      value: safeNumber(data.totalRoutes.current),
      subtitle: 'Currently running',
      trend: trendOf(data.totalRoutes),
      color: 'green'
    },
    {
      title: 'Total Drivers',
      value: safeNumber(data.totalDrivers.current),
      subtitle: 'Available staff',
      trend: trendOf(data.totalDrivers),
      color: 'purple'
    },
    {
      title: 'Fleet Vehicles',
      value: safeNumber(data.totalVehicles.current),
      subtitle: 'Active fleet',
      trend: trendOf(data.totalVehicles),
      color: 'orange'
    }
  ];
}

/**
 * Create route management stats
 */
export function createRouteStats(data: {
  totalRoutes: number;
  activeRoutes: number;
  totalOccupancy: number;
  totalCapacity: number;
  avgUtilization?: number;
}): StatCardData[] {
  const utilizationPercentage = safePercentage(data.totalOccupancy, data.totalCapacity);
  
  return [
    {
      title: 'Total Routes',
      value: safeNumber(data.totalRoutes),
      color: 'blue'
    },
    {
      title: 'Active Routes',
      value: safeNumber(data.activeRoutes),
      subtitle: `${utilizationPercentage}% utilized`,
      color: 'green'
    },
    {
      title: 'Total Occupancy',
      value: `${safeNumber(data.totalOccupancy)}/${safeNumber(data.totalCapacity)}`,
      subtitle: 'Passengers/Capacity',
      color: 'purple'
    },
    {
      title: 'Avg Utilization',
      value: `${data.avgUtilization || utilizationPercentage}%`,
      subtitle: 'Fleet efficiency',
      color: 'cyan'
    }
  ];
}

/**
 * Create student management stats
 */
export function createStudentStats(data: {
  totalStudents: number;
  enrolledStudents: number;
  pendingStudents: number;
  activeTransport: number;
  pendingPayments: number;
}): StatCardData[] {
  const enrollmentPercentage = safePercentage(data.enrolledStudents, data.totalStudents);
  
  return [
    {
      title: 'Total Students',
      value: safeNumber(data.totalStudents),
      color: 'blue'
    },
    {
      title: 'Enrolled',
      value: safeNumber(data.enrolledStudents),
      subtitle: `${enrollmentPercentage}% of total`,
      color: 'green'
    },
    {
      title: 'Pending',
      value: safeNumber(data.pendingStudents),
      subtitle: 'Awaiting approval',
      color: 'yellow'
    },
    {
      title: 'Active Transport',
      value: safeNumber(data.activeTransport),
      subtitle: 'Using transport',
      color: 'purple'
    },
    {
      title: 'Pending Payments',
      value: safeNumber(data.pendingPayments),
      subtitle: 'Outstanding dues',
      color: 'red'
    }
  ];
}

/**
 * Create vehicle management stats
 */
export function createVehicleStats(data: {
  totalVehicles: number;
  activeVehicles: number;
  maintenanceVehicles: number;
  outOfService: number;
}): StatCardData[] {
  const activePercentage = safePercentage(data.activeVehicles, data.totalVehicles);
  
  return [
    {
      title: 'Total Vehicles',
      value: safeNumber(data.totalVehicles),
      color: 'blue'
    },
    {
      title: 'Active',
      value: safeNumber(data.activeVehicles),
      subtitle: `${activePercentage}% operational`,
      color: 'green'
    },
    {
      title: 'Maintenance',
      value: safeNumber(data.maintenanceVehicles),
      subtitle: 'Under service',
      color: 'yellow'
    },
    {
      title: 'Out of Service',
      value: safeNumber(data.outOfService),
      subtitle: 'Inactive',
      color: 'red'
    }
  ];
}

/**
 * Create driver management stats
 */
export function createDriverStats(data: {
  totalDrivers: number;
  activeDrivers: number;
  onLeave: number;
  avgRating: number;
  totalTrips: number;
}): StatCardData[] {
  const activePercentage = safePercentage(data.activeDrivers, data.totalDrivers);
  
  return [
    {
      title: 'Total Drivers',
      value: safeNumber(data.totalDrivers),
      color: 'blue'
    },
    {
      title: 'Active',
      value: safeNumber(data.activeDrivers),
      subtitle: `${activePercentage}% available`,
      color: 'green'
    },
    {
      title: 'On Leave',
      value: safeNumber(data.onLeave),
      subtitle: 'Temporarily unavailable',
      color: 'yellow'
    },
    {
      title: 'Avg Rating',
      value: `${safeNumber(data.avgRating, 4.0).toFixed(1)}/5`,
      subtitle: 'Performance score',
      color: 'purple'
    }
  ];
}

/**
 * Create schedule management stats
 */
export function createScheduleStats(data: {
  totalSchedules: number;
  activeRoutes: number;
  totalBookings: number;
  totalRevenue: number;
  pendingApproval: number;
}): StatCardData[] {
  return [
    {
      title: 'Total Trips This Month',
      value: safeNumber(data.totalSchedules),
      color: 'blue'
    },
    {
      title: 'Active Routes',
      value: safeNumber(data.activeRoutes),
      subtitle: 'Currently running',
      color: 'green'
    },
    {
      title: 'Student Bookings',
      value: safeNumber(data.totalBookings),
      subtitle: 'This month',
      color: 'purple'
    },
    {
      title: 'Monthly Revenue',
      value: formatCurrency(data.totalRevenue),
      subtitle: 'Total earnings',
      color: 'cyan'
    }
  ];
} 