'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  Calendar,
  MapPin,
  Users,
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Filter,
  Download,
  QrCode,
  Bus,
  RefreshCw,
  Mail,
  Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { DatabaseService } from '@/lib/database';

const BookingCard = ({ booking, onEdit, onCancel, onView, onMarkComplete, userRole }: any) => {
  const canEdit = ['super_admin', 'operations_admin', 'data_entry'].includes(userRole);
  const canCancel = ['super_admin', 'operations_admin'].includes(userRole);
  const canViewPayment = ['super_admin', 'finance_admin', 'operations_admin'].includes(userRole);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      case 'no_show': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'refunded': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <span className="text-white font-semibold text-lg">{booking.seat_number}</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{booking.student_name}</h3>
            <p className="text-sm text-gray-600">{booking.roll_number}</p>
          </div>
        </div>
        <div className="flex flex-col items-end space-y-1">
          <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getStatusColor(booking.status)}`}>
            {booking.status}
          </span>
          {canViewPayment && (
            <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getPaymentStatusColor(booking.payment_status)}`}>
              {booking.payment_status}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Bus className="w-4 h-4" />
          <span>{booking.route_name} - {booking.route_number}</span>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <MapPin className="w-4 h-4" />
          <span>Boarding: {booking.boarding_stop}</span>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Calendar className="w-4 h-4" />
          <span>Trip: {new Date(booking.trip_date).toLocaleDateString()}</span>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Clock className="w-4 h-4" />
          <span>Booked: {new Date(booking.created_at).toLocaleDateString()}</span>
        </div>
        {booking.qr_code && (
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <QrCode className="w-4 h-4" />
            <span className="font-mono">{booking.qr_code}</span>
          </div>
        )}
      </div>

      {canViewPayment && (
        <div className="border-t border-gray-100 pt-4 mb-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Amount:</span>
            <span className="font-semibold text-gray-900">₹{booking.amount}</span>
          </div>
        </div>
      )}

      <div className="flex space-x-2">
        <button
          onClick={() => onView(booking)}
          className="flex-1 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors flex items-center justify-center space-x-1"
        >
          <Eye className="w-4 h-4" />
          <span>View Details</span>
        </button>
        {booking.status === 'confirmed' && canEdit && (
          <button
            onClick={() => onMarkComplete(booking)}
            className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-green-50 transition-colors"
          >
            <CheckCircle className="w-4 h-4 text-gray-600" />
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => onEdit(booking)}
            className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Edit className="w-4 h-4 text-gray-600" />
          </button>
        )}
        {booking.status === 'confirmed' && canCancel && (
          <button
            onClick={() => onCancel(booking)}
            className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            <XCircle className="w-4 h-4 text-gray-600" />
          </button>
        )}
      </div>
    </motion.div>
  );
};

// Enhanced Booking Management Page
const BookingsPage = () => {
  const [user, setUser] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    status: '',
    route: '',
    paymentStatus: '',
    dateRange: 'today'
  });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [isRealTimeEnabled, setIsRealTimeEnabled] = useState(true);

  useEffect(() => {
    const userData = localStorage.getItem('adminUser');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch bookings and routes using API routes
      const [bookingsResponse, routesResponse] = await Promise.all([
        fetch('/api/admin/bookings'),
        fetch('/api/admin/routes')
      ]);
      
      const bookingsResult = await bookingsResponse.json();
      const routesResult = await routesResponse.json();
      
      if (!bookingsResult.success) {
        throw new Error(bookingsResult.error || 'Failed to fetch bookings');
      }
      
      if (!routesResult.success) {
        throw new Error(routesResult.error || 'Failed to fetch routes');
      }
      
      const bookingsData = bookingsResult.data || [];
      const routesData = routesResult.data || [];
      
      setBookings(bookingsData);
      setRoutes(routesData);
      setFilteredBookings(bookingsData);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load bookings data');
      toast.error('Failed to load bookings data');
    } finally {
      setLoading(false);
    }
  };

  // Real-time updates simulation
  useEffect(() => {
    if (!isRealTimeEnabled) return;
    
    const interval = setInterval(() => {
      // Simulate real-time booking status updates
      setBookings(prev => prev.map(booking => {
        if (booking.status === 'confirmed' && Math.random() > 0.95) {
          return { ...booking, status: 'completed' };
        }
        return booking;
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, [isRealTimeEnabled]);

  // Enhanced filtering with real-time search
  useEffect(() => {
    let filtered = bookings;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(booking => {
        return (
          booking.student_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          booking.roll_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          booking.route_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          booking.seat_number?.toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
    }

    // Status filter
    if (filters.status) {
      filtered = filtered.filter(booking => booking.status === filters.status);
    }

    // Route filter
    if (filters.route) {
      filtered = filtered.filter(booking => booking.route_id === filters.route);
    }

    // Payment status filter
    if (filters.paymentStatus) {
      filtered = filtered.filter(booking => booking.payment_status === filters.paymentStatus);
    }

    // Date range filter
    if (filters.dateRange) {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      filtered = filtered.filter(booking => {
        const tripDate = new Date(booking.trip_date);
        switch (filters.dateRange) {
          case 'today':
            return tripDate.toDateString() === today.toDateString();
          case 'tomorrow':
            return tripDate.toDateString() === tomorrow.toDateString();
          case 'week':
            const weekFromNow = new Date(today);
            weekFromNow.setDate(weekFromNow.getDate() + 7);
            return tripDate >= today && tripDate <= weekFromNow;
          default:
            return true;
        }
      });
    }

    setFilteredBookings(filtered);
  }, [bookings, searchTerm, filters]);

  const canAddBooking = user && ['super_admin', 'operations_admin', 'data_entry'].includes(user.role);
  const canViewPayment = user && ['super_admin', 'finance_admin', 'operations_admin'].includes(user.role);
  const canExport = user && ['super_admin', 'operations_admin', 'finance_admin'].includes(user.role);

  // Statistics
  const totalBookings = bookings.length;
  const confirmedBookings = bookings.filter(b => b.status === 'confirmed').length;
  const completedBookings = bookings.filter(b => b.status === 'completed').length;
  const cancelledBookings = bookings.filter(b => b.status === 'cancelled').length;
  const pendingPayments = bookings.filter(b => b.payment_status === 'pending').length;
  const totalRevenue = bookings.filter(b => b.payment_status === 'paid').reduce((sum, b) => sum + (b.amount || 0), 0);

  const handleExport = () => {
    const csvData = filteredBookings.map(booking => ({
      'Booking ID': booking.id,
      'Student Name': booking.student_name || 'N/A',
      'Roll Number': booking.roll_number || 'N/A',
      'Route': booking.route_name || 'N/A',
      'Trip Date': new Date(booking.trip_date).toLocaleDateString(),
      'Seat Number': booking.seat_number,
      'Amount': `₹${booking.amount || 0}`,
      'Status': booking.status,
      'Payment Status': booking.payment_status
    }));

    const csv = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookings_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast.success('Bookings exported successfully!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading bookings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Data</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={fetchData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Enhanced Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Booking Management</h1>
          <div className="flex items-center space-x-4 mt-2">
            <p className="text-gray-600">
              {filteredBookings.length} of {bookings.length} bookings
            </p>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isRealTimeEnabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
              <span className="text-sm text-gray-500">
                {isRealTimeEnabled ? 'Live Updates' : 'Static Data'}
              </span>
              <button
                onClick={() => setIsRealTimeEnabled(!isRealTimeEnabled)}
                className="p-1 hover:bg-gray-100 rounded"
                title="Toggle real-time updates"
              >
                <RefreshCw className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 border rounded-lg flex items-center space-x-2 transition-colors ${
              showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </button>
          {canExport && (
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row gap-4 mb-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by student name, roll number, route, or seat..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Advanced Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-gray-200"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Status</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="completed">Completed</option>
                  <option value="no_show">No Show</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Route</label>
                <select
                  value={filters.route}
                  onChange={(e) => setFilters({ ...filters, route: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Routes</option>
                  {routes.map(route => (
                    <option key={route.id} value={route.id}>
                      {route.route_number} - {route.route_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
                <select
                  value={filters.paymentStatus}
                  onChange={(e) => setFilters({ ...filters, paymentStatus: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Payments</option>
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
                <select
                  value={filters.dateRange}
                  onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Dates</option>
                  <option value="today">Today</option>
                  <option value="tomorrow">Tomorrow</option>
                  <option value="week">Next 7 Days</option>
                </select>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Booking Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <motion.div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Bookings</p>
              <p className="text-2xl font-bold text-gray-900">{filteredBookings.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </motion.div>

        <motion.div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Confirmed</p>
              <p className="text-2xl font-bold text-green-900">
                {filteredBookings.filter(b => b.status === 'confirmed').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </motion.div>

        <motion.div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Payment</p>
              <p className="text-2xl font-bold text-yellow-900">
                {filteredBookings.filter(b => b.payment_status === 'pending').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </motion.div>

        <motion.div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Revenue</p>
              <p className="text-2xl font-bold text-green-900">₹{totalRevenue.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Bookings Grid */}
      {filteredBookings.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
          <div className="text-center">
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Bookings Yet</h3>
            <p className="text-gray-600 mb-6">
              {bookings.length === 0 
                ? "Get started by adding routes and enabling bookings. Students will be able to book transportation once routes are set up."
                : "No bookings match your current filters. Try adjusting your search criteria."
              }
            </p>
            {bookings.length === 0 && canAddBooking && (
              <div className="space-y-3">
                <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  Set Up First Route
                </button>
                <p className="text-sm text-gray-500">
                  Create routes, add students, and configure pricing to enable bookings
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredBookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              onEdit={() => {}}
              onCancel={() => {}}
              onView={() => {}}
              onMarkComplete={() => {}}
              userRole={user?.role}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default BookingsPage; 