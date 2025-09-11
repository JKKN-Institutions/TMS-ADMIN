import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar as CalendarIcon,
  Clock,
  Bus,
  Users,
  Eye,
  Settings,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  RefreshCw,
  MoreHorizontal,
  Check,
  Ban,
  Shield,
  User,
  Phone,
  Mail,
  MapPin,
  X,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  FileText,
  UserCheck,
  Star,
  Clock3
} from 'lucide-react';
import toast from 'react-hot-toast';

interface TripDetail {
  id: string;
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
  completion_date?: string;
  completion_notes?: string;
  route?: {
    id: string;
    routeNumber: string;
    routeName: string;
    startLocation: string;
    endLocation: string;
  };
  driver: {
    id: string;
    name: string;
    phone?: string;
    license_number?: string;
  } | null;
  vehicle: {
    id: string;
    registration_number: string;
    capacity?: number;
  } | null;
  passengers?: Passenger[];
}

interface Passenger {
  id: string;
  studentName: string;
  rollNumber: string;
  email: string;
  mobile: string;
  seatNumber: string;
  boardingStop: string;
  paymentStatus: string;
  bookingDate: string;
}

interface PassengerModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: TripDetail | null;
  passengers: Passenger[];
  loading: boolean;
}

const PassengerModal: React.FC<PassengerModalProps> = ({ isOpen, onClose, trip, passengers, loading }) => {
  if (!isOpen || !trip) return null;

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
          className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
        >
          <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-green-50 to-blue-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  trip.status === 'completed' ? 'bg-purple-600' : 'bg-green-600'
                }`}>
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    Trip Passengers
                    {trip.status === 'completed' && (
                      <span className="ml-2 text-lg text-purple-600">(Completed)</span>
                    )}
                  </h2>
                  <p className="text-sm text-gray-600 flex items-center space-x-2">
                    <CalendarIcon className="w-4 h-4" />
                    <span>
                      {trip.scheduleDate && !isNaN(new Date(trip.scheduleDate).getTime()) 
                        ? new Date(trip.scheduleDate).toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric'
                          })
                        : 'Invalid Date'
                      }
                    </span>
                    <Clock className="w-4 h-4 ml-2" />
                    <span>{trip.departureTime || '--'} - {trip.arrivalTime || '--'}</span>
                  </p>
                  
                  {/* Completion details */}
                  {trip.status === 'completed' && trip.completion_date && (
                    <p className="text-xs text-purple-600 mt-1 flex items-center space-x-2">
                      <CheckCircle className="w-3 h-3" />
                      <span>
                        Completed on {new Date(trip.completion_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <div className="text-sm text-gray-500">Total Capacity</div>
                  <div className="text-lg font-bold text-gray-900">{passengers.length} / {trip.totalSeats}</div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
                <p className="mt-4 text-lg text-gray-600">Loading passengers...</p>
                <p className="text-sm text-gray-500">Please wait while we fetch the passenger list</p>
              </div>
            ) : passengers.length > 0 ? (
              <div className="space-y-6">
                {/* Passenger Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">{passengers.length}</div>
                    <div className="text-sm text-green-700">Total Passengers</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {passengers.filter(p => p.paymentStatus === 'confirmed').length}
                    </div>
                    <div className="text-sm text-blue-700">Paid</div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {passengers.filter(p => p.paymentStatus === 'pending').length}
                    </div>
                    <div className="text-sm text-yellow-700">Pending Payment</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {Math.round((passengers.length / trip.totalSeats) * 100)}%
                    </div>
                    <div className="text-sm text-purple-700">Occupancy</div>
                  </div>
                </div>

                {/* Passengers Table */}
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Student Details
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Contact Information
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Seat & Boarding
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Payment Status
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Booking Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {passengers.map((passenger, index) => (
                          <tr key={passenger.id} className={`hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                            <td className="px-6 py-4">
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                  <span className="text-green-600 font-medium text-sm">
                                    {passenger.studentName?.charAt(0)?.toUpperCase() || 'S'}
                                  </span>
                                </div>
                                <div>
                                  <div className="font-medium text-gray-900">{passenger.studentName}</div>
                                  <div className="text-sm text-gray-600">Roll: {passenger.rollNumber}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="space-y-2">
                                <div className="flex items-center text-sm text-gray-600">
                                  <Mail className="w-4 h-4 mr-2 text-gray-400" />
                                  <span className="truncate max-w-[200px]">{passenger.email}</span>
                                </div>
                                <div className="flex items-center text-sm text-gray-600">
                                  <Phone className="w-4 h-4 mr-2 text-gray-400" />
                                  <span>{passenger.mobile}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                  <div className="w-6 h-6 bg-blue-100 rounded flex items-center justify-center">
                                    <span className="text-blue-600 font-medium text-xs">{passenger.seatNumber}</span>
                                  </div>
                                  <span className="text-sm font-medium text-gray-900">Seat {passenger.seatNumber}</span>
                                </div>
                                <div className="flex items-center text-sm text-gray-600">
                                  <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                                  <span>{passenger.boardingStop}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                                passenger.paymentStatus === 'confirmed' 
                                  ? 'bg-green-100 text-green-800' 
                                  : passenger.paymentStatus === 'pending'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {passenger.paymentStatus === 'confirmed' && <CheckCircle className="w-3 h-3 mr-1" />}
                                {passenger.paymentStatus === 'pending' && <Clock3 className="w-3 h-3 mr-1" />}
                                {passenger.paymentStatus === 'failed' && <XCircle className="w-3 h-3 mr-1" />}
                                {passenger.paymentStatus.charAt(0).toUpperCase() + passenger.paymentStatus.slice(1)}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-900">
                                {passenger.bookingDate && !isNaN(new Date(passenger.bookingDate).getTime())
                                  ? new Date(passenger.bookingDate).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric'
                                    })
                                  : 'N/A'
                                }
                              </div>
                              <div className="text-xs text-gray-500">
                                {passenger.bookingDate && !isNaN(new Date(passenger.bookingDate).getTime())
                                  ? new Date(passenger.bookingDate).toLocaleTimeString('en-US', {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })
                                  : ''
                                }
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-gray-900 mb-2">No Passengers Yet</h3>
                <p className="text-gray-600 mb-4">No students have booked this trip yet.</p>
                <div className="inline-flex items-center px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm">
                  <Star className="w-4 h-4 mr-2" />
                  Trip is ready for student bookings
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4" />
                <span>Total: {passengers.length} passengers</span>
              </div>
              <div className="flex items-center space-x-2">
                <Bus className="w-4 h-4" />
                <span>Available: {trip.totalSeats - passengers.length} seats</span>
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
              <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2">
                <Download className="w-4 h-4" />
                <span>Export Passenger List</span>
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

interface AllTripsTableProps {
  routeId: string;
  routeName: string;
  routeNumber: string;
  onClose: () => void;
}

const AllTripsTable: React.FC<AllTripsTableProps> = ({ routeId, routeName, routeNumber, onClose }) => {
  const [trips, setTrips] = useState<TripDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState<TripDetail | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [showPassengerModal, setShowPassengerModal] = useState(false);
  const [passengerLoading, setPassengerLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'}>({
    key: 'scheduleDate',
    direction: 'asc'
  });

  useEffect(() => {
    loadAllTrips();
  }, [routeId]);

  const loadAllTrips = async () => {
    setLoading(true);
    try {
      // Get all schedules for this route
      const response = await fetch(`/api/admin/schedules/enhanced-list?route=${routeId}&dateRange=all`);
      const data = await response.json();
      
      // The enhanced-list API already returns data in the correct format
      setTrips(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading trips:', error);
      toast.error('Failed to load trips');
    } finally {
      setLoading(false);
    }
  };

  const loadPassengers = async (trip: TripDetail) => {
    setPassengerLoading(true);
    try {
      const response = await fetch('/api/admin/schedules/passengers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeId: routeId,
          date: trip.scheduleDate
        })
      });
      
      if (response.ok) {
        const passengerData = await response.json();
        setPassengers(Array.isArray(passengerData) ? passengerData : []);
      } else {
        setPassengers([]);
        const errorText = await response.text();
        console.error('Passenger loading error:', errorText);
        toast.error('Failed to load passengers');
      }
    } catch (error) {
      console.error('Error loading passengers:', error);
      setPassengers([]);
      toast.error('Failed to load passengers');
    } finally {
      setPassengerLoading(false);
    }
  };

  const handleViewPassengers = (trip: TripDetail) => {
    setSelectedTrip(trip);
    setShowPassengerModal(true);
    loadPassengers(trip);
  };

  const getStatusBadge = (trip: TripDetail) => {
    if (trip.status === 'completed') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Completed Trip
        </span>
      );
    }
    
    if (!trip.admin_scheduling_enabled) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Needs Approval
        </span>
      );
    }
    
    if (trip.admin_scheduling_enabled && trip.booking_enabled) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Open for Booking
        </span>
      );
    }
    
    if (trip.admin_scheduling_enabled && !trip.booking_enabled) {
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

  const filteredTrips = trips.filter(trip => {
    const matchesSearch = trip.driver?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (trip.scheduleDate && new Date(trip.scheduleDate).toLocaleDateString().includes(searchTerm));
    
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'needs_approval' && !trip.admin_scheduling_enabled) ||
                         (statusFilter === 'approved' && trip.admin_scheduling_enabled && !trip.booking_enabled) ||
                         (statusFilter === 'open' && trip.admin_scheduling_enabled && trip.booking_enabled) ||
                         (statusFilter === 'completed' && trip.status === 'completed');
    
    return matchesSearch && matchesStatus;
  });

  const sortedTrips = [...filteredTrips].sort((a, b) => {
    const { key, direction } = sortConfig;
    let aValue: any = a[key as keyof TripDetail];
    let bValue: any = b[key as keyof TripDetail];
    
    if (key === 'driver') {
      aValue = a.driver?.name || '';
      bValue = b.driver?.name || '';
    }
    
    // Handle null/undefined values
    if (aValue == null) aValue = '';
    if (bValue == null) bValue = '';
    
    if (direction === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">All Trips - Route {routeNumber}</h2>
          <p className="text-gray-600">{routeName}</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => loadAllTrips()}
            className="btn-secondary flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
          <button
            onClick={onClose}
            className="btn-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by driver name or date..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
        
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input min-w-[150px]"
          >
            <option value="all">All Status</option>
            <option value="needs_approval">Needs Approval</option>
            <option value="approved">Approved</option>
            <option value="open">Open for Booking</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Trip Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <CalendarIcon className="w-5 h-5 text-blue-600" />
            <span className="font-medium text-blue-900">Total Trips</span>
          </div>
          <div className="text-2xl font-bold text-blue-900">{trips.length}</div>
        </div>
        
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <CheckCircle className="w-5 h-5 text-purple-600" />
            <span className="font-medium text-purple-900">Completed</span>
          </div>
          <div className="text-2xl font-bold text-purple-900">
            {trips.filter(t => t.status === 'completed').length}
          </div>
        </div>
        
        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Users className="w-5 h-5 text-green-600" />
            <span className="font-medium text-green-900">Open for Booking</span>
          </div>
          <div className="text-2xl font-bold text-green-900">
            {trips.filter(t => t.admin_scheduling_enabled && t.booking_enabled && t.status !== 'completed').length}
          </div>
        </div>

        <div className="bg-yellow-50 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            <span className="font-medium text-yellow-900">Needs Approval</span>
          </div>
          <div className="text-2xl font-bold text-yellow-900">
            {trips.filter(t => !t.admin_scheduling_enabled && t.status !== 'completed').length}
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Clock className="w-5 h-5 text-gray-600" />
            <span className="font-medium text-gray-900">Total Passengers</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {trips.reduce((sum, trip) => sum + (trip.bookedSeats || 0), 0)}
          </div>
        </div>
      </div>

      {/* Trips Table */}
      <div className="card">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading trips...</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('scheduleDate')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Trip Date & Time</span>
                      {sortConfig.key === 'scheduleDate' && (
                        sortConfig.direction === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('driver')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Driver & Vehicle</span>
                      {sortConfig.key === 'driver' && (
                        sortConfig.direction === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Booking Details</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedTrips.map((trip) => (
                  <tr key={trip.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div>
                        <div className="font-medium text-gray-900">
                          {trip.scheduleDate && !isNaN(new Date(trip.scheduleDate).getTime()) 
                            ? new Date(trip.scheduleDate).toLocaleDateString('en-US', {
                                weekday: 'short',
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
                    </td>
                    <td className="px-4 py-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-900">
                            {trip.driver?.name || 'No driver assigned'}
                          </span>
                        </div>
                        {trip.vehicle && (
                          <div className="flex items-center space-x-2 text-sm text-gray-600">
                            <Bus className="w-3 h-3 text-gray-400" />
                            <span>{trip.vehicle.registration_number}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <div className="text-sm font-medium text-gray-900">
                            {trip.bookedSeats || 0}/{trip.totalSeats || 0} seats
                          </div>
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-green-600 h-2 rounded-full"
                              style={{ 
                                width: `${trip.totalSeats > 0 ? ((trip.bookedSeats || 0) / trip.totalSeats) * 100 : 0}%` 
                              }}
                            />
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">
                          {trip.totalSeats > 0 ? Math.round(((trip.bookedSeats || 0) / trip.totalSeats) * 100) : 0}% occupied
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {getStatusBadge(trip)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleViewPassengers(trip)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center space-x-1"
                        >
                          <UserCheck className="w-4 h-4" />
                          <span>View Passengers</span>
                        </button>
                        <button className="text-gray-400 hover:text-gray-600">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!loading && sortedTrips.length === 0 && (
          <div className="p-8 text-center">
            <CalendarIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No trips found</h3>
            <p className="text-gray-600">
              {searchTerm || statusFilter !== 'all' 
                ? 'Try adjusting your search or filters' 
                : 'No trips have been scheduled for this route yet'
              }
            </p>
          </div>
        )}
      </div>

      {/* Passenger Modal */}
      <PassengerModal
        isOpen={showPassengerModal}
        onClose={() => setShowPassengerModal(false)}
        trip={selectedTrip}
        passengers={passengers}
        loading={passengerLoading}
      />
    </div>
  );
};

export default AllTripsTable; 