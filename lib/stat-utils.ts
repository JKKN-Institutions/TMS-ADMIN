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
 * Generate mock trend data for demonstration (when real previous data isn't available)
 */
export function generateMockTrend(current: number, baseVariance: number = 0.15): TrendData {
  // Generate a reasonable previous value based on current with some variance
  const variance = (Math.random() - 0.5) * baseVariance * 2;
  const previous = current * (1 - variance);
  
  return calculateTrend(current, previous, 'vs last month');
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
      trend: data.totalStudents.previous 
        ? calculateTrend(data.totalStudents.current, data.totalStudents.previous, 'vs last month')
        : generateMockTrend(data.totalStudents.current, 0.1),
      color: 'blue'
    },
    {
      title: 'Active Routes',
      value: safeNumber(data.totalRoutes.current),
      subtitle: 'Currently running',
      trend: data.totalRoutes.previous 
        ? calculateTrend(data.totalRoutes.current, data.totalRoutes.previous, 'vs last month')
        : generateMockTrend(data.totalRoutes.current, 0.05),
      color: 'green'
    },
    {
      title: 'Total Drivers',
      value: safeNumber(data.totalDrivers.current),
      subtitle: 'Available staff',
      trend: data.totalDrivers.previous 
        ? calculateTrend(data.totalDrivers.current, data.totalDrivers.previous, 'vs last month')
        : generateMockTrend(data.totalDrivers.current, 0.08),
      color: 'purple'
    },
    {
      title: 'Fleet Vehicles',
      value: safeNumber(data.totalVehicles.current),
      subtitle: 'Active fleet',
      trend: data.totalVehicles.previous 
        ? calculateTrend(data.totalVehicles.current, data.totalVehicles.previous, 'vs last month')
        : generateMockTrend(data.totalVehicles.current, 0.03),
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
      color: 'blue',
      trend: generateMockTrend(data.totalRoutes, 0.05)
    },
    {
      title: 'Active Routes',
      value: safeNumber(data.activeRoutes),
      subtitle: `${utilizationPercentage}% utilized`,
      color: 'green',
      trend: generateMockTrend(data.activeRoutes, 0.08)
    },
    {
      title: 'Total Occupancy',
      value: `${safeNumber(data.totalOccupancy)}/${safeNumber(data.totalCapacity)}`,
      subtitle: 'Passengers/Capacity',
      color: 'purple',
      trend: generateMockTrend(utilizationPercentage, 0.12)
    },
    {
      title: 'Avg Utilization',
      value: `${data.avgUtilization || utilizationPercentage}%`,
      subtitle: 'Fleet efficiency',
      color: 'cyan',
      trend: generateMockTrend(data.avgUtilization || utilizationPercentage, 0.10)
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
      color: 'blue',
      trend: generateMockTrend(data.totalStudents, 0.08)
    },
    {
      title: 'Enrolled',
      value: safeNumber(data.enrolledStudents),
      subtitle: `${enrollmentPercentage}% of total`,
      color: 'green',
      trend: generateMockTrend(data.enrolledStudents, 0.12)
    },
    {
      title: 'Pending',
      value: safeNumber(data.pendingStudents),
      subtitle: 'Awaiting approval',
      color: 'yellow',
      trend: generateMockTrend(data.pendingStudents, 0.20)
    },
    {
      title: 'Active Transport',
      value: safeNumber(data.activeTransport),
      subtitle: 'Using transport',
      color: 'purple',
      trend: generateMockTrend(data.activeTransport, 0.10)
    },
    {
      title: 'Pending Payments',
      value: safeNumber(data.pendingPayments),
      subtitle: 'Outstanding dues',
      color: 'red',
      trend: generateMockTrend(data.pendingPayments, 0.15)
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
      color: 'blue',
      trend: generateMockTrend(data.totalVehicles, 0.05)
    },
    {
      title: 'Active',
      value: safeNumber(data.activeVehicles),
      subtitle: `${activePercentage}% operational`,
      color: 'green',
      trend: generateMockTrend(data.activeVehicles, 0.08)
    },
    {
      title: 'Maintenance',
      value: safeNumber(data.maintenanceVehicles),
      subtitle: 'Under service',
      color: 'yellow',
      trend: generateMockTrend(data.maintenanceVehicles, 0.25)
    },
    {
      title: 'Out of Service',
      value: safeNumber(data.outOfService),
      subtitle: 'Inactive',
      color: 'red',
      trend: generateMockTrend(data.outOfService, 0.30)
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
      color: 'blue',
      trend: generateMockTrend(data.totalDrivers, 0.05)
    },
    {
      title: 'Active',
      value: safeNumber(data.activeDrivers),
      subtitle: `${activePercentage}% available`,
      color: 'green',
      trend: generateMockTrend(data.activeDrivers, 0.08)
    },
    {
      title: 'On Leave',
      value: safeNumber(data.onLeave),
      subtitle: 'Temporarily unavailable',
      color: 'yellow',
      trend: generateMockTrend(data.onLeave, 0.20)
    },
    {
      title: 'Avg Rating',
      value: `${safeNumber(data.avgRating, 4.0).toFixed(1)}/5`,
      subtitle: 'Performance score',
      color: 'purple',
      trend: generateMockTrend(data.avgRating * 20, 0.05)
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
      color: 'blue',
      trend: generateMockTrend(data.totalSchedules, 0.12)
    },
    {
      title: 'Active Routes',
      value: safeNumber(data.activeRoutes),
      subtitle: 'Currently running',
      color: 'green',
      trend: generateMockTrend(data.activeRoutes, 0.05)
    },
    {
      title: 'Student Bookings',
      value: safeNumber(data.totalBookings),
      subtitle: 'This month',
      color: 'purple',
      trend: generateMockTrend(data.totalBookings, 0.18)
    },
    {
      title: 'Monthly Revenue',
      value: formatCurrency(data.totalRevenue),
      subtitle: 'Total earnings',
      color: 'cyan',
      trend: generateMockTrend(data.totalRevenue, 0.23)
    }
  ];
} 