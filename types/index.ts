// User and Authentication Types
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  permissions: Permission[];
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
}

// Aligned with MyJKKN roles. `(string & {})` keeps editor autocomplete for the
// known roles while still permitting dynamic custom roles from custom_roles.
export type UserRole =
  | 'super_admin'
  | 'administrator'
  | 'transport_manager'
  | 'faculty'
  | 'student'
  | 'driver'
  | 'staff'
  | 'hod'
  | 'principal'
  | (string & {});

// Shape of a TMS user sourced from the shared MyJKKN `profiles` table.
// This is the auth source of truth (see providers/auth-provider.tsx Profile).
export interface TmsUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_super_admin: boolean;
  is_active: boolean;
  institution_id: string | null;
  department_id: string | null;
  avatar_url: string | null;
  phone_number: string | null;
}

export interface DriverOps {
  licenseNumber: string | null;
  licenseExpiry: string | null;
  experienceYears: number;
  rating: number;
  totalTrips: number;
  driverStatus: 'active' | 'inactive' | 'on_leave';
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  aadharNumber: string | null;
  medicalCertificateExpiry: string | null;
  locationSharingEnabled: boolean;
  assignedRouteId: string | null;
  notes: string | null;
}

export interface DriverRouteRef {
  id: string;
  label: string; // "20 · CHENNAMPATTI"
}

export interface DriverListItem {
  id: string;            // staff.id
  name: string;
  firstName: string;
  lastName: string;
  designation: string;
  phone: string;
  email: string;
  employmentType: string;
  status: string;        // staff lifecycle status
  isActive: boolean;
  dateOfJoining: string | null;
  avatarUrl: string | null;
  institutionId: string;
  profileId: string | null;
  ops: DriverOps | null; // null = no tms_driver row yet
  routes: DriverRouteRef[]; // assigned route(s): tms_route.driver_id=staff.id ∪ tms_driver.assigned_route_id
}

export interface Permission {
  module: string;
  actions: ('create' | 'read' | 'update' | 'delete' | 'approve')[];
}

// Student Types
export interface Student {
  id: string;
  studentName: string;
  rollNumber: string;
  email: string;
  mobile: string;
  department: {
    id: string;
    departmentName: string;
  };
  program: {
    id: string;
    programName: string;
    degreeName: string;
  };
  institution: {
    id: string;
    name: string;
  };
  transportProfile?: StudentTransportProfile;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudentTransportProfile {
  id: string;
  studentId: string;
  allocatedRoutes: string[];
  boardingPoint: string;
  transportStatus: 'active' | 'inactive' | 'suspended';
  paymentStatus: 'current' | 'overdue' | 'suspended';
  totalFines: number;
  outstandingAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Route Types
export interface Route {
  id: string;
  routeNumber: string;
  routeName: string;
  startLocation: string;
  endLocation: string;
  departureTime: string;
  arrivalTime: string;
  distance: number;
  duration: string;
  totalCapacity: number;
  currentPassengers: number;
  status: 'active' | 'inactive' | 'maintenance';
  driverId?: string;
  vehicleId?: string;
  stops: RouteStop[];
  fare: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RouteStop {
  id: string;
  routeId: string;
  stopName: string;
  stopTime: string;
  sequenceOrder: number;
  latitude?: number;
  longitude?: number;
  isMajorStop: boolean;
}

// Driver Types
export interface Driver {
  id: string;
  name: string;
  licenseNumber: string;
  phone: string;
  email?: string;
  experienceYears: number;
  rating: number;
  totalTrips: number;
  status: 'active' | 'inactive' | 'on_leave';
  assignedRoutes: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Vehicle Types
export interface Vehicle {
  id: string;
  registrationNumber: string;
  model: string;
  capacity: number;
  fuelType: 'diesel' | 'petrol' | 'electric' | 'cng';
  insuranceExpiry: Date;
  fitnessExpiry: Date;
  lastMaintenance: Date;
  nextMaintenance: Date;
  status: 'active' | 'maintenance' | 'retired';
  assignedRoute?: string;
  mileage: number;
  createdAt: Date;
  updatedAt: Date;
}

// Schedule Types
export interface Schedule {
  id: string;
  routeId: string;
  scheduleDate: Date;
  departureTime: string;
  arrivalTime: string;
  availableSeats: number;
  bookedSeats: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  driverId: string;
  vehicleId: string;
  route?: Route;
  driver?: Driver;
  vehicle?: Vehicle;
  createdAt: Date;
}

// Booking Types
export interface Booking {
  id: string;
  studentId: string;
  routeId: string;
  scheduleId: string;
  bookingDate: Date;
  tripDate: Date;
  boardingStop: string;
  seatNumber: string;
  status: 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  paymentStatus: 'paid' | 'pending' | 'refunded';
  amount: number;
  qrCode?: string;
  student?: Student;
  route?: Route;
  schedule?: Schedule;
  createdAt: Date;
  updatedAt: Date;
}

// Notification Types
export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  category: 'transport' | 'payment' | 'system' | 'emergency';
  targetAudience: 'all' | 'students' | 'drivers' | 'admins';
  specificUsers?: string[];
  isActive: boolean;
  scheduledAt?: Date;
  expiresAt?: Date;
  createdBy: string;
  createdAt: Date;
}

// Grievance Types
export interface Grievance {
  id: string;
  studentId: string;
  routeId?: string;
  driverName?: string;
  category: 'complaint' | 'suggestion' | 'compliment' | 'technical_issue';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  assignedTo?: string;
  resolution?: string;
  student?: Student;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
}

// Analytics Types
export interface DashboardStats {
  totalStudents: number;
  totalRoutes: number;
  activeRoutes: number;
  totalDrivers: number;
  totalVehicles: number;
  totalBookings: number;
  activeBookings: number;
  todayBookings: number;
  todayRevenue: number;
  pendingPayments: number;
  pendingGrievances: number;
  maintenanceAlerts: number;
}

export interface RouteAnalytics {
  routeId: string;
  routeName: string;
  totalTrips: number;
  avgOccupancy: number;
  revenue: number;
  onTimePerformance: number;
  rating: number;
}

export interface RevenueAnalytics {
  date: string;
  tripFares: number;
  fines: number;
  semesterFees: number;
  total: number;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Form Types
export interface RouteFormData {
  routeNumber: string;
  routeName: string;
  startLocation: string;
  endLocation: string;
  departureTime: string;
  arrivalTime: string;
  distance: number;
  totalCapacity: number;
  fare: number;
  stops: Omit<RouteStop, 'id' | 'routeId'>[];
}

export interface DriverFormData {
  name: string;
  licenseNumber: string;
  phone: string;
  email?: string;
  experienceYears: number;
}

export interface VehicleFormData {
  registrationNumber: string;
  model: string;
  capacity: number;
  fuelType: Vehicle['fuelType'];
  insuranceExpiry: string;
  fitnessExpiry: string;
  lastMaintenance: string;
  mileage: number;
}

// Filter Types
export interface RouteFilters {
  status?: Route['status'];
  driverId?: string;
  vehicleId?: string;
  search?: string;
}

export interface BookingFilters {
  status?: Booking['status'];
  routeId?: string;
  studentId?: string;
  dateFrom?: string;
  dateTo?: string;
  paymentStatus?: Booking['paymentStatus'];
}

// Table Types
export interface TableColumn<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
}

export interface TableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  loading?: boolean;
  onSort?: (key: string, direction: 'asc' | 'desc') => void;
  onRowClick?: (row: T) => void;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    onPageChange: (page: number) => void;
  };
}

// Navigation Types
export interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  current: boolean;
  children?: NavigationItem[];
  badge?: number;
  roles?: UserRole[];
} 