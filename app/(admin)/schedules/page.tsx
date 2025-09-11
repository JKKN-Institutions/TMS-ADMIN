'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar as CalendarIcon,
  Clock,
  Bus,
  Users,
  MapPin,
  Eye,
  Plus,
  Search,
  Filter,
  TrendingUp,
  ArrowRight,
  Settings,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  RefreshCw,
  MoreHorizontal,
  Check,
  Target,
  Clock3,
  Ban,
  Shield,
  Zap,
  ChevronDown,
  ChevronUp,
  X,
  LayoutGrid,
  TableIcon,
  CalendarDays,
  BarChart3,
  HelpCircle,
  Bookmark,
  Edit,
  Route as RouteIcon,
  Navigation,
  FileText
} from 'lucide-react';
import toast from 'react-hot-toast';
import EnhancedGlobalCalendar from '@/components/enhanced-global-calendar';
import GlobalBookingCalendar from '@/components/global-booking-calendar';
import AllTripsTable from '@/components/all-trips-table';
import UniversalStatCard from '@/components/universal-stat-card';
import { createScheduleStats, safeNumber } from '@/lib/stat-utils';

interface RouteScheduleSummary {
  route: {
    id: string;
    routeNumber: string;
    routeName: string;
    startLocation: string;
    endLocation: string;
    fare: number;
    totalCapacity: number;
  };
  nextTrip: {
    id: string;
    scheduleDate: string;
    departureTime: string;
    arrivalTime: string;
    availableSeats: number;
    bookedSeats: number;
    status: string;
    admin_scheduling_enabled?: boolean;
    booking_enabled?: boolean;
    booking_deadline?: string;
  } | null;
  totalSchedulesThisMonth: number;
  totalBookingsThisMonth: number;
}

interface ScheduleDetail {
  id: string;
  route: {
    id: string;
    routeNumber: string;
    routeName: string;
    startLocation: string;
    endLocation: string;
  };
  scheduleDate: string;
  departureTime: string;
  arrivalTime: string;
  availableSeats: number;
  bookedSeats: number;
  totalSeats: number;
  admin_scheduling_enabled: boolean;
  booking_enabled: boolean;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  booking_deadline?: string;
  special_instructions?: string;
  created_at: string;
  updated_at: string;
}

interface RouteDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  route: RouteScheduleSummary | null;
  onShowAllTrips: () => void;
}

const RouteDetailsModal: React.FC<RouteDetailsModalProps> = ({ isOpen, onClose, route, onShowAllTrips }) => {
  const [upcomingTrips, setUpcomingTrips] = useState<ScheduleDetail[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && route) {
      loadUpcomingTrips();
    }
  }, [isOpen, route]);

  const loadUpcomingTrips = async () => {
    if (!route) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/schedules/enhanced-list?route=${route.route.id}&dateRange=30days`);
      const data = await response.json();
      
      // Transform the data to match our ScheduleDetail interface (enhanced-list returns camelCase)
      const transformedTrips = Array.isArray(data) ? data.map((trip: any) => ({
        ...trip,
        // enhanced-list already returns camelCase, so this should work correctly
      })) : [];
      
      setUpcomingTrips(transformedTrips);
    } catch (error) {
      console.error('Error loading upcoming trips:', error);
      toast.error('Failed to load trip details');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !route) return null;

  const { route: routeInfo, nextTrip, totalSchedulesThisMonth, totalBookingsThisMonth } = route;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
        >
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">{routeInfo.routeNumber}</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{routeInfo.routeName}</h2>
                  <p className="text-sm text-gray-600 flex items-center">
                    <MapPin className="w-4 h-4 mr-1" />
                    {routeInfo.startLocation} → {routeInfo.endLocation}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
            {/* Route Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Bus className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-blue-900">Route Details</span>
                </div>
                <div className="space-y-1 text-sm">
                  <div>Capacity: <span className="font-medium">{routeInfo.totalCapacity} seats</span></div>
                  <div>Fare: <span className="font-medium">₹{routeInfo.fare}</span></div>
                </div>
              </div>
              
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <CalendarIcon className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-green-900">This Month</span>
                </div>
                <div className="space-y-1 text-sm">
                  <div>Trips: <span className="font-medium">{totalSchedulesThisMonth}</span></div>
                  <div>Bookings: <span className="font-medium">{totalBookingsThisMonth}</span></div>
                </div>
              </div>

              <div className="bg-purple-50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Users className="w-5 h-5 text-purple-600" />
                  <span className="font-medium text-purple-900">Next Trip</span>
                </div>
                <div className="space-y-1 text-sm">
                  {nextTrip ? (
                    <>
                      <div>{new Date(nextTrip.scheduleDate).toLocaleDateString()}</div>
                      <div>{nextTrip.departureTime}</div>
                    </>
                  ) : (
                    <div className="text-gray-500">No upcoming trips</div>
                  )}
                </div>
              </div>
            </div>

            {/* Upcoming Trips */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Upcoming Trips (Next 30 Days)</h3>
                <button
                  onClick={() => {
                    onClose();
                    onShowAllTrips();
                  }}
                  className="text-green-600 hover:text-green-800 text-sm font-medium flex items-center space-x-1"
                >
                  <FileText className="w-4 h-4" />
                  <span>View All Trips</span>
                </button>
              </div>
              
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Loading trips...</p>
                </div>
              ) : upcomingTrips.length > 0 ? (
                <div className="space-y-3">
                  {upcomingTrips.map((trip) => (
                    <div key={trip.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900">
                            {trip.scheduleDate && !isNaN(new Date(trip.scheduleDate).getTime())
                              ? new Date(trip.scheduleDate).toLocaleDateString('en-US', {
                                  weekday: 'long',
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })
                              : 'Invalid Date'
                            }
                          </div>
                          <div className="text-sm text-gray-600">
                            {trip.departureTime || '--'} - {trip.arrivalTime || '--'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900">
                            {trip.bookedSeats || 0}/{trip.totalSeats || 0} seats
                          </div>
                          <div className="text-xs text-gray-500">
                            {trip.booking_enabled && trip.admin_scheduling_enabled
                              ? 'Open for booking'
                              : trip.admin_scheduling_enabled 
                              ? 'Approved, not active'
                              : 'Needs approval'
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CalendarIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No upcoming trips scheduled for this route</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

interface RouteSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  route: RouteScheduleSummary | null;
}

const RouteSettingsModal: React.FC<RouteSettingsModalProps> = ({ isOpen, onClose, route }) => {
  if (!isOpen || !route) return null;

  const { route: routeInfo } = route;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-lg shadow-xl max-w-2xl w-full"
        >
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold">{routeInfo.routeNumber}</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Route Settings</h2>
                  <p className="text-sm text-gray-600">{routeInfo.routeName}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Quick Actions */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <CalendarDays className="w-5 h-5 text-green-600" />
                  <div className="text-left">
                    <div className="font-medium text-gray-900">Create Trip</div>
                    <div className="text-sm text-gray-600">Schedule new trip for this route</div>
                  </div>
                </button>
                
                <button className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <Users className="w-5 h-5 text-blue-600" />
                  <div className="text-left">
                    <div className="font-medium text-gray-900">View Students</div>
                    <div className="text-sm text-gray-600">See assigned students</div>
                  </div>
                </button>
                
                <button className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <Edit className="w-5 h-5 text-purple-600" />
                  <div className="text-left">
                    <div className="font-medium text-gray-900">Edit Route</div>
                    <div className="text-sm text-gray-600">Modify route details</div>
                  </div>
                </button>
                
                <button className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <BarChart3 className="w-5 h-5 text-orange-600" />
                  <div className="text-left">
                    <div className="font-medium text-gray-900">Analytics</div>
                    <div className="text-sm text-gray-600">View booking patterns</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Route Information */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Route Information</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Route Number:</span>
                  <span className="font-medium">{routeInfo.routeNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Route Name:</span>
                  <span className="font-medium">{routeInfo.routeName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Start Location:</span>
                  <span className="font-medium">{routeInfo.startLocation}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">End Location:</span>
                  <span className="font-medium">{routeInfo.endLocation}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Bus Capacity:</span>
                  <span className="font-medium">{routeInfo.totalCapacity} seats</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Fare:</span>
                  <span className="font-medium">₹{routeInfo.fare}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
              Save Settings
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

interface BulkActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSchedules: ScheduleDetail[];
  onBulkUpdate: (updates: any) => Promise<void>;
}

const BulkActionModal: React.FC<BulkActionModalProps> = ({ 
  isOpen, 
  onClose, 
  selectedSchedules, 
  onBulkUpdate 
}) => {
  const [actionType, setActionType] = useState<'approve' | 'disable' | 'set_deadline' | 'enable_booking'>('approve');
  const [bookingDeadline, setBookingDeadline] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [loading, setLoading] = useState(false);

  const handleBulkAction = async () => {
    setLoading(true);
    try {
      let updates = {};
      
      switch (actionType) {
        case 'approve':
          updates = { admin_scheduling_enabled: true };
          break;
        case 'disable':
          updates = { admin_scheduling_enabled: false, booking_enabled: false };
          break;
        case 'set_deadline':
          updates = { booking_deadline: bookingDeadline };
          break;
        case 'enable_booking':
          updates = { admin_scheduling_enabled: true, booking_enabled: true };
          break;
      }

      if (specialInstructions) {
        updates = { ...updates, special_instructions: specialInstructions };
      }

      await onBulkUpdate(updates);
      toast.success(`Updated ${selectedSchedules.length} schedules successfully`);
      onClose();
    } catch (error) {
      toast.error('Failed to update schedules');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-lg shadow-xl max-w-2xl w-full"
        >
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                Batch Actions ({selectedSchedules.length} schedules selected)
              </h2>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Action Type Selection */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-3 block">
                Choose Action to Apply
              </label>
              <div className="space-y-2">
                <label className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    name="actionType"
                    value="approve"
                    checked={actionType === 'approve'}
                    onChange={(e) => setActionType(e.target.value as any)}
                    className="text-green-600"
                  />
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <div className="font-medium text-gray-900">Approve for Student Booking</div>
                    <div className="text-sm text-gray-600">Allow students to see and book these trips</div>
                  </div>
                </label>

                <label className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    name="actionType"
                    value="enable_booking"
                    checked={actionType === 'enable_booking'}
                    onChange={(e) => setActionType(e.target.value as any)}
                    className="text-green-600"
                  />
                  <Zap className="w-5 h-5 text-green-600" />
                  <div>
                    <div className="font-medium text-gray-900">Approve & Open Booking</div>
                    <div className="text-sm text-gray-600">Immediately open these trips for student booking</div>
                  </div>
                </label>

                <label className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    name="actionType"
                    value="disable"
                    checked={actionType === 'disable'}
                    onChange={(e) => setActionType(e.target.value as any)}
                    className="text-green-600"
                  />
                  <Ban className="w-5 h-5 text-red-600" />
                  <div>
                    <div className="font-medium text-gray-900">Disable Trips</div>
                    <div className="text-sm text-gray-600">Hide these trips from students and stop booking</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Special Instructions */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Additional Notes (Optional)
              </label>
              <textarea
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                placeholder="Add any special instructions or notes for these trips..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                rows={3}
              />
            </div>

            {/* Selected Schedules Preview */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Selected Trips ({selectedSchedules.length})
              </h3>
              <div className="max-h-32 overflow-y-auto bg-gray-50 rounded-lg p-3">
                {selectedSchedules.slice(0, 5).map(schedule => (
                  <div key={schedule.id} className="text-sm text-gray-600 py-1">
                    {schedule.route.routeNumber} - {new Date(schedule.scheduleDate).toLocaleDateString()} at {schedule.departureTime}
                  </div>
                ))}
                {selectedSchedules.length > 5 && (
                  <div className="text-sm text-gray-500 py-1">
                    ... and {selectedSchedules.length - 5} more trips
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleBulkAction}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>{loading ? 'Applying Changes...' : 'Apply to All Selected'}</span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

const RouteCard: React.FC<{ 
  route: RouteScheduleSummary; 
  onViewDetails: (route: RouteScheduleSummary) => void;
  onOpenSettings: (route: RouteScheduleSummary) => void;
}> = ({ route, onViewDetails, onOpenSettings }) => {
  const { route: routeInfo, nextTrip, totalSchedulesThisMonth, totalBookingsThisMonth } = route;

  const formatTime = (time: string) => {
    return new Date(`1970-01-01T${time}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusIcon = () => {
    if (!nextTrip) return <XCircle className="w-4 h-4 text-gray-400" />;
    
    // Check if trip is in the past (should not happen with new API logic, but safety check)
    const tripDate = new Date(nextTrip.scheduleDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (tripDate < today) return <XCircle className="w-4 h-4 text-gray-400" />;
    
    const isBookingEnabled = nextTrip.admin_scheduling_enabled && nextTrip.booking_enabled;
    const isExpired = nextTrip.booking_deadline && new Date() > new Date(nextTrip.booking_deadline);
    
    if (isExpired) return <XCircle className="w-4 h-4 text-red-500" />;
    if (isBookingEnabled) return <CheckCircle className="w-4 h-4 text-green-500" />;
    return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
  };

  const getStatusText = () => {
    if (!nextTrip) return 'No upcoming trips';
    
    // Check if trip is in the past (should not happen with new API logic, but safety check)
    const tripDate = new Date(nextTrip.scheduleDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (tripDate < today) return 'Past trip (data error)';
    
    const isBookingEnabled = nextTrip.admin_scheduling_enabled && nextTrip.booking_enabled;
    const isExpired = nextTrip.booking_deadline && new Date() > new Date(nextTrip.booking_deadline);
    
    if (isExpired) return 'Booking deadline passed';
    if (isBookingEnabled) return 'Open for booking';
    if (nextTrip.admin_scheduling_enabled) return 'Approved, not active';
    return 'Pending approval';
  };

  const occupancyPercentage = nextTrip 
    ? Math.round((nextTrip.bookedSeats / (nextTrip.bookedSeats + nextTrip.availableSeats)) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card group hover:shadow-lg transition-all duration-200"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">{routeInfo.routeNumber}</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-green-600 transition-colors">
              {routeInfo.routeName}
            </h3>
            <p className="text-sm text-gray-600 flex items-center">
              <MapPin className="w-3 h-3 mr-1" />
              {routeInfo.startLocation} → {routeInfo.endLocation}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">Bus Capacity</div>
          <div className="text-xl font-bold text-gray-900">{routeInfo.totalCapacity}</div>
        </div>
      </div>

      {/* Next Trip Info */}
      {nextTrip ? (
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <CalendarIcon className="w-4 h-4 text-green-600" />
              <span className="font-medium text-gray-900">Next Scheduled Trip</span>
            </div>
            <div className="flex items-center space-x-2">
              {getStatusIcon()}
              <span className="text-sm text-gray-600">{getStatusText()}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-3">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Trip Date</div>
              <div className="font-medium text-gray-900">{formatDate(nextTrip.scheduleDate)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Departure</div>
              <div className="font-medium text-gray-900">
                {formatTime(nextTrip.departureTime)}
              </div>
            </div>
            <div className="col-span-2 md:col-span-1">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Bookings</div>
              <div className="font-medium text-gray-900">
                {nextTrip.bookedSeats}/{nextTrip.bookedSeats + nextTrip.availableSeats}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-600">
              <span>Seat Availability</span>
              <span>{occupancyPercentage}% filled</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${
                  occupancyPercentage >= 90 ? 'bg-red-500' :
                  occupancyPercentage >= 70 ? 'bg-yellow-500' :
                  'bg-green-500'
                }`}
                style={{ width: `${occupancyPercentage}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg p-6 mb-4 text-center">
          <CalendarIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">No upcoming trips scheduled</p>
        </div>
      )}

      {/* Monthly Stats - Removed Revenue */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{totalSchedulesThisMonth}</div>
          <div className="text-xs text-gray-500">Trips This Month</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{totalBookingsThisMonth}</div>
          <div className="text-xs text-gray-500">Student Bookings</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-2">
        <button 
          onClick={() => onViewDetails(route)}
          className="flex-1 btn-primary"
        >
          <Eye className="w-4 h-4 mr-2" />
          View Trip Details
        </button>
        <button 
          onClick={() => onOpenSettings(route)}
          className="btn-secondary"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};

const StatsCard: React.FC<{
  title: string;
  value: string | number;
  change: string;
  positive: boolean;
  icon: React.ReactNode;
}> = ({ title, value, change, positive, icon }) => (
  <div className="card">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-600 mb-1">{title}</p>
        <p className="text-2xl font-bold text-gray-900">
          {typeof value === 'number' && isNaN(value) ? '0' : value}
        </p>
        <div className={`flex items-center text-sm mt-1 ${positive ? 'text-green-600' : 'text-red-600'}`}>
          <TrendingUp className="w-4 h-4 mr-1" />
          {change}
        </div>
      </div>
      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center text-green-600">
        {icon}
      </div>
    </div>
  </div>
);

export default function SchedulesPage() {
  const [viewMode, setViewMode] = useState<'overview' | 'manage' | 'calendar'>('overview');
  const [calendarType, setCalendarType] = useState<'schedule-manager' | 'booking-overview'>('schedule-manager');
  const [routeSummaries, setRouteSummaries] = useState<RouteScheduleSummary[]>([]);
  const [schedules, setSchedules] = useState<ScheduleDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSchedules, setSelectedSchedules] = useState<string[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showEnhancedCalendar, setShowEnhancedCalendar] = useState(false);
  const [showBookingCalendar, setShowBookingCalendar] = useState(false);
  const [showRouteDetails, setShowRouteDetails] = useState(false);
  const [showRouteSettings, setShowRouteSettings] = useState(false);
  const [showAllTripsTable, setShowAllTripsTable] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<RouteScheduleSummary | null>(null);
  const [filters, setFilters] = useState({
    status: 'all', // all, pending_approval, approved, active, disabled
    route: '',
    dateRange: '7days' // 7days, 30days, all
  });
  
  // Real analytics data state
  const [realAnalytics, setRealAnalytics] = useState({
    totalSchedules: 0,
    activeRoutes: 0,
    totalBookings: 0,
    totalRevenue: 0,
    pendingApproval: 0,
    loading: true
  });

  useEffect(() => {
    if (viewMode === 'overview') {
      loadRouteSchedules();
    } else if (viewMode === 'manage') {
      loadDetailedSchedules();
    }
    // Load real analytics data for all view modes
    loadRealAnalytics();
    // Calendar view doesn't need initial data loading as it's handled by the calendar components
  }, [viewMode, filters]);

  const loadRouteSchedules = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/schedules/route-summaries');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setRouteSummaries(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading route schedules:', error);
      setRouteSummaries([]);
      toast.error('Failed to load route schedules');
    } finally {
      setLoading(false);
    }
  };

  const loadDetailedSchedules = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status !== 'all') params.append('status', filters.status);
      if (filters.route) params.append('route', filters.route);
      if (filters.dateRange !== 'all') params.append('dateRange', filters.dateRange);

      const response = await fetch(`/api/admin/schedules/enhanced-list?${params}`);
      const data = await response.json();
      setSchedules(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading detailed schedules:', error);
      setSchedules([]);
      toast.error('Failed to load detailed schedules');
    } finally {
      setLoading(false);
    }
  };

  const loadRealAnalytics = async () => {
    setRealAnalytics(prev => ({ ...prev, loading: true }));
    try {
      const response = await fetch('/api/admin/analytics');
      const result = await response.json();
      
      if (response.ok && result.success) {
        const { routes, bookings, payments } = result.data;
        
        // Calculate real metrics with proper null checks
        const totalSchedules = schedules.length > 0 ? schedules.length : routeSummaries.reduce((sum, route) => sum + (route.totalSchedulesThisMonth || 0), 0);
        const activeRoutes = routes?.filter((r: any) => r.status === 'active').length || 0;
        const totalBookings = bookings?.filter((b: any) => b.status === 'confirmed').length || 0;
        const totalRevenue = payments?.reduce((sum: number, payment: any) => sum + (Number(payment.amount) || 0), 0) || 0;
        const pendingApproval = schedules?.filter(s => !s.admin_scheduling_enabled).length || 0;
        
        setRealAnalytics({
          totalSchedules,
          activeRoutes,
          totalBookings,
          totalRevenue,
          pendingApproval,
          loading: false
        });
      } else {
        console.error('Error fetching analytics:', result.error);
        setRealAnalytics(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
      setRealAnalytics(prev => ({ ...prev, loading: false }));
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    if (viewMode === 'overview') {
      await loadRouteSchedules();
    } else if (viewMode === 'manage') {
      await loadDetailedSchedules();
    }
    // Always refresh analytics data
    await loadRealAnalytics();
    setRefreshing(false);
    toast.success('Data refreshed successfully');
  };

  const handleCreateNewTrip = () => {
    setViewMode('calendar');
    setCalendarType('schedule-manager');
    // Small delay to ensure state is updated before opening modal
    setTimeout(() => {
      setShowEnhancedCalendar(true);
    }, 100);
  };

  const handleViewTripDetails = (route: RouteScheduleSummary) => {
    setSelectedRoute(route);
    setShowRouteDetails(true);
  };

  const handleOpenRouteSettings = (route: RouteScheduleSummary) => {
    setSelectedRoute(route);
    setShowRouteSettings(true);
  };

  const handleBulkUpdate = async (updates: any) => {
    const response = await fetch('/api/admin/schedules/bulk-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schedule_ids: selectedSchedules,
        updates
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update schedules');
    }

    // Refresh schedules
    await loadDetailedSchedules();
    setSelectedSchedules([]);
  };

  const toggleScheduleSelection = (scheduleId: string) => {
    setSelectedSchedules(prev => 
      prev.includes(scheduleId) 
        ? prev.filter(id => id !== scheduleId)
        : [...prev, scheduleId]
    );
  };

  const selectAllVisible = () => {
    const visibleScheduleIds = filteredSchedules.map(s => s.id);
    setSelectedSchedules(visibleScheduleIds);
  };

  const clearSelection = () => {
    setSelectedSchedules([]);
  };

  const getStatusBadge = (schedule: ScheduleDetail) => {
    if (!schedule.admin_scheduling_enabled) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Needs Approval
        </span>
      );
    }
    
    if (schedule.admin_scheduling_enabled && schedule.booking_enabled) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Open for Booking
        </span>
      );
    }
    
    if (schedule.admin_scheduling_enabled && !schedule.booking_enabled) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          <Shield className="w-3 h-3 mr-1" />
          Approved
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        <XCircle className="w-3 h-3 mr-1" />
        Disabled
      </span>
    );
  };

  // Filter functions
  const filteredRouteSummaries = routeSummaries.filter(route => {
    const matchesSearch = 
      route.route.routeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      route.route.routeNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      route.route.startLocation.toLowerCase().includes(searchTerm.toLowerCase()) ||
      route.route.endLocation.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
  });

  const filteredSchedules = schedules.filter(schedule => {
    const matchesSearch = 
      schedule.route.routeNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      schedule.route.routeName.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  // Use real analytics data with fallbacks and NaN protection
  const currentStats = {
    totalSchedules: realAnalytics.loading ? 'Loading...' : (isNaN(realAnalytics.totalSchedules) ? 0 : realAnalytics.totalSchedules),
    activeRoutes: realAnalytics.loading ? 'Loading...' : (isNaN(realAnalytics.activeRoutes) ? 0 : realAnalytics.activeRoutes),
    totalBookings: realAnalytics.loading ? 'Loading...' : (isNaN(realAnalytics.totalBookings) ? 0 : realAnalytics.totalBookings),
    totalRevenue: realAnalytics.loading ? 'Loading...' : `₹${(isNaN(realAnalytics.totalRevenue) ? 0 : realAnalytics.totalRevenue).toLocaleString()}`,
    pendingApprovalCount: realAnalytics.loading ? 0 : (isNaN(realAnalytics.pendingApproval) ? 0 : realAnalytics.pendingApproval)
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-8"></div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-64 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Enhanced Header with Better Description */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Transport Schedule Management</h1>
          <p className="page-subtitle">
            {viewMode === 'overview' && 'Overview of all routes and upcoming trips'}
            {viewMode === 'manage' && 'Approve trips and manage student booking access'}
            {viewMode === 'calendar' && 'Visual calendar view for schedule management'}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {/* Main View Mode Toggle with Better Names */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('overview')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-2 ${
                viewMode === 'overview' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Route Overview</span>
            </button>
            <button
              onClick={() => setViewMode('manage')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-2 ${
                viewMode === 'manage' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <TableIcon className="w-4 h-4" />
              <span>Manage Trips</span>
              {currentStats.pendingApprovalCount > 0 && (
                <span className="bg-yellow-500 text-white text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center">
                  {currentStats.pendingApprovalCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-2 ${
                viewMode === 'calendar' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              <span>Calendar View</span>
            </button>
          </div>
          
          {/* Calendar Type Toggle with Better Names */}
          {viewMode === 'calendar' && (
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setCalendarType('schedule-manager')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  calendarType === 'schedule-manager' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Schedule Manager
              </button>
              <button
                onClick={() => setCalendarType('booking-overview')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  calendarType === 'booking-overview' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Booking Overview
              </button>
            </div>
          )}
          
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-secondary flex items-center space-x-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Data'}</span>
          </button>
          <button 
            onClick={handleCreateNewTrip}
            className="btn-primary flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Trip</span>
          </button>
        </div>
      </div>

      {/* Enhanced Summary Stats with Better Labels */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {createScheduleStats({
          totalSchedules: safeNumber(currentStats.totalSchedules),
          activeRoutes: safeNumber(currentStats.activeRoutes),
          totalBookings: safeNumber(currentStats.totalBookings),
          totalRevenue: safeNumber(currentStats.totalRevenue),
          pendingApproval: safeNumber(realAnalytics.pendingApproval)
        }).map((stat, index) => (
          <UniversalStatCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            subtitle={stat.subtitle}
            icon={index === 0 ? CalendarIcon : index === 1 ? Bus : index === 2 ? Users : TrendingUp}
            trend={stat.trend}
            color={stat.color}
            variant="enhanced"
            loading={realAnalytics.loading}
            delay={index}
          />
        ))}
      </div>

      {/* Calendar Mode with Better Descriptions */}
      {viewMode === 'calendar' && (
        <div className="card">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                  <CalendarDays className="w-5 h-5 text-green-600" />
                  <span>
                    {calendarType === 'schedule-manager' ? 'Schedule Management Calendar' : 'Student Booking Overview Calendar'}
                  </span>
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {calendarType === 'schedule-manager' 
                    ? 'Click on any date to view, approve, and manage trips. Create new trips and control student booking access.'
                    : 'Visual overview of student bookings and seat availability across all routes. Monitor occupancy rates.'
                  }
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1 text-sm text-gray-500">
                  <HelpCircle className="w-4 h-4" />
                  <span>Click a date to {calendarType === 'schedule-manager' ? 'manage trips' : 'view bookings'}</span>
                </div>
                <button
                  onClick={() => {
                    if (calendarType === 'schedule-manager') {
                      setShowEnhancedCalendar(true);
                    } else {
                      setShowBookingCalendar(true);
                    }
                  }}
                  className="btn-primary flex items-center space-x-2"
                >
                  <CalendarDays className="w-4 h-4" />
                  <span>Open {calendarType === 'schedule-manager' ? 'Schedule Manager' : 'Booking Overview'}</span>
                </button>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            <div className="text-center py-12">
              <CalendarDays className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {calendarType === 'schedule-manager' ? 'Trip Schedule Management' : 'Student Booking Analytics'}
              </h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                {calendarType === 'schedule-manager' 
                  ? 'Use the Schedule Manager to approve trips, set booking deadlines, create new schedules, and control when students can book trips.'
                  : 'Monitor student booking patterns, view seat occupancy rates, and analyze demand across different routes and dates.'
                }
              </p>
              <div className="flex justify-center space-x-4">
                <button
                  onClick={() => {
                    if (calendarType === 'schedule-manager') {
                      setShowEnhancedCalendar(true);
                    } else {
                      setShowBookingCalendar(true);
                    }
                  }}
                  className="btn-primary flex items-center space-x-2"
                >
                  <CalendarDays className="w-5 h-5" />
                  <span>Open {calendarType === 'schedule-manager' ? 'Schedule Manager' : 'Booking Overview'}</span>
                </button>
                <button
                  onClick={() => setCalendarType(calendarType === 'schedule-manager' ? 'booking-overview' : 'schedule-manager')}
                  className="btn-secondary flex items-center space-x-2"
                >
                  <BarChart3 className="w-5 h-5" />
                  <span>Switch to {calendarType === 'schedule-manager' ? 'Booking Overview' : 'Schedule Manager'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters and Search with Better Labels */}
      {viewMode !== 'calendar' && (
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder={viewMode === 'overview' ? 'Search routes by name, number, or location...' : 'Search trips by route...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10"
            />
          </div>
          
          {viewMode === 'manage' && (
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                className="input min-w-[160px]"
              >
                <option value="all">All Trip Status</option>
                <option value="pending_approval">Needs Approval</option>
                <option value="approved">Approved Only</option>
                <option value="active">Open for Booking</option>
                <option value="disabled">Disabled</option>
              </select>
              <select
                value={filters.dateRange}
                onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value }))}
                className="input min-w-[140px]"
              >
                <option value="7days">Next 7 Days</option>
                <option value="30days">Next 30 Days</option>
                <option value="all">All Future Trips</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Enhanced Bulk Actions Bar */}
      {viewMode === 'manage' && selectedSchedules.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-green-50 border border-green-200 rounded-lg p-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Bookmark className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-green-900">
                  {selectedSchedules.length} trip{selectedSchedules.length !== 1 ? 's' : ''} selected
                </span>
              </div>
              <button
                onClick={clearSelection}
                className="text-sm text-green-600 hover:text-green-800 underline"
              >
                Clear selection
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowBulkModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Target className="w-4 h-4" />
                <span>Apply Batch Actions</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Enhanced Quick Actions for Pending Approval */}
      {viewMode === 'manage' && currentStats.pendingApprovalCount > 0 && selectedSchedules.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              <div>
                <h3 className="text-sm font-medium text-yellow-900">
                  {currentStats.pendingApprovalCount} trip{currentStats.pendingApprovalCount !== 1 ? 's' : ''} waiting for approval
                </h3>
                <p className="text-sm text-yellow-700">
                  Students cannot see or book these trips until you approve them
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  const pendingIds = schedules
                    .filter(s => !s.admin_scheduling_enabled)
                    .map(s => s.id);
                  setSelectedSchedules(pendingIds);
                  setShowBulkModal(true);
                }}
                className="flex items-center space-x-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Approve All Pending</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content Area */}
      {viewMode === 'overview' ? (
        // Route Overview Cards
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredRouteSummaries.length > 0 ? (
              filteredRouteSummaries.map((routeSummary, index) => (
                <RouteCard
                  key={`${routeSummary.route.id}-${index}`}
                  route={routeSummary}
                  onViewDetails={handleViewTripDetails}
                  onOpenSettings={handleOpenRouteSettings}
                />
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-span-full text-center py-12"
              >
                <Bus className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchTerm ? 'No routes match your search' : 'No routes found'}
                </h3>
                <p className="text-gray-600 mb-6">
                  {searchTerm 
                    ? 'Try adjusting your search terms' 
                    : 'Get started by creating your first route and schedule'
                  }
                </p>
                {!searchTerm && (
                  <button 
                    onClick={handleCreateNewTrip}
                    className="btn-primary flex items-center space-x-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create First Route</span>
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : viewMode === 'manage' ? (
        // Trip Management Table
        <div className="card">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                <TableIcon className="w-5 h-5 text-green-600" />
                <span>Individual Trip Management ({filteredSchedules.length})</span>
              </h2>
              {filteredSchedules.length > 0 && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={selectAllVisible}
                    className="text-sm text-green-600 hover:text-green-800 underline"
                  >
                    Select all visible trips
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    <input
                      type="checkbox"
                      checked={selectedSchedules.length === filteredSchedules.length && filteredSchedules.length > 0}
                      onChange={selectAllVisible}
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Route & Direction</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trip Date & Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student Bookings</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Booking Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredSchedules.map((schedule) => (
                  <tr 
                    key={schedule.id}
                    className={`hover:bg-gray-50 ${selectedSchedules.includes(schedule.id) ? 'bg-green-50' : ''}`}
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedSchedules.includes(schedule.id)}
                        onChange={() => toggleScheduleSelection(schedule.id)}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          Route {schedule.route.routeNumber}
                        </div>
                        <div className="text-sm text-gray-600">
                          {schedule.route.startLocation} → {schedule.route.endLocation}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {new Date(schedule.scheduleDate).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </div>
                        <div className="text-sm text-gray-600">
                          {schedule.departureTime} - {schedule.arrivalTime}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center space-x-2">
                        <div className="text-sm font-medium text-gray-900">
                          {schedule.bookedSeats}/{schedule.totalSeats} seats
                        </div>
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-600 h-2 rounded-full"
                            style={{ 
                              width: `${(schedule.bookedSeats / schedule.totalSeats) * 100}%` 
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {getStatusBadge(schedule)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center space-x-2">
                        {!schedule.admin_scheduling_enabled && (
                          <button
                            onClick={() => {
                              setSelectedSchedules([schedule.id]);
                              setShowBulkModal(true);
                            }}
                            className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full hover:bg-green-200 transition-colors font-medium"
                          >
                            Approve Trip
                          </button>
                        )}
                        <button className="text-gray-400 hover:text-gray-600">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredSchedules.length === 0 && (
            <div className="p-8 text-center">
              <CalendarIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No trips found</h3>
              <p className="text-gray-600">
                {searchTerm ? 'Try adjusting your search or filters' : 'No trips match the current filters'}
              </p>
            </div>
          )}
        </div>
      ) : null}

      {/* Enhanced Quick Actions for Overview Mode */}
      {viewMode === 'overview' && filteredRouteSummaries.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
              <Zap className="w-5 h-5 text-green-600" />
              <span>Quick Actions</span>
            </h3>
            <ArrowRight className="w-5 h-5 text-gray-400" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <button
              onClick={() => setViewMode('manage')}
              className="quick-action-card"
            >
              <div className="quick-action-icon bg-green-500">
                <TableIcon className="w-5 h-5 text-white" />
              </div>
              <div className="quick-action-title">Manage Individual Trips</div>
              <div className="quick-action-desc">Approve trips and control student booking access</div>
            </button>
            <button
              onClick={() => {
                setViewMode('calendar');
                setCalendarType('schedule-manager');
              }}
              className="quick-action-card"
            >
              <div className="quick-action-icon bg-blue-500">
                <CalendarDays className="w-5 h-5 text-white" />
              </div>
              <div className="quick-action-title">Schedule Manager</div>
              <div className="quick-action-desc">Create and manage trips in calendar view</div>
            </button>
            <button
              onClick={() => {
                setViewMode('calendar');
                setCalendarType('booking-overview');
              }}
              className="quick-action-card"
            >
              <div className="quick-action-icon bg-purple-500">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div className="quick-action-title">Booking Analytics</div>
              <div className="quick-action-desc">Visual overview of student bookings</div>
            </button>
            <button className="quick-action-card">
              <div className="quick-action-icon bg-orange-500">
                <Download className="w-5 h-5 text-white" />
              </div>
              <div className="quick-action-title">Export Trip Reports</div>
              <div className="quick-action-desc">Download detailed schedule analytics</div>
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {viewMode === 'manage' && (
        <BulkActionModal
          isOpen={showBulkModal}
          onClose={() => setShowBulkModal(false)}
          selectedSchedules={schedules.filter(s => selectedSchedules.includes(s.id))}
          onBulkUpdate={handleBulkUpdate}
        />
      )}

      <RouteDetailsModal
        isOpen={showRouteDetails}
        onClose={() => setShowRouteDetails(false)}
        route={selectedRoute}
        onShowAllTrips={() => setShowAllTripsTable(true)}
      />

      <RouteSettingsModal
        isOpen={showRouteSettings}
        onClose={() => setShowRouteSettings(false)}
        route={selectedRoute}
      />

      <EnhancedGlobalCalendar
        isOpen={showEnhancedCalendar}
        onClose={() => setShowEnhancedCalendar(false)}
      />

      <GlobalBookingCalendar
        isOpen={showBookingCalendar}
        onClose={() => setShowBookingCalendar(false)}
      />

      {/* All Trips Table Modal */}
      {showAllTripsTable && selectedRoute && (
        <div className="fixed inset-0 bg-white z-50 overflow-hidden">
          <AllTripsTable
            routeId={selectedRoute.route.id}
            routeName={selectedRoute.route.routeName}
            routeNumber={selectedRoute.route.routeNumber}
            onClose={() => setShowAllTripsTable(false)}
          />
        </div>
      )}
    </div>
  );
}
