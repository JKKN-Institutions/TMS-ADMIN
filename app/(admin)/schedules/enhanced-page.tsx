'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar as CalendarIcon,
  Clock,
  Bus,
  Users,
  MapPin,
  ChevronRight,
  ChevronLeft,
  Eye,
  X,
  User,
  Phone,
  Mail,
  CreditCard,
  Download,
  CalendarDays,
  ArrowRight,
  Settings,
  Globe,
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  MoreHorizontal,
  Check,
  AlertCircle,
  Filter,
  Search,
  Plus,
  RefreshCw,
  Zap,
  Target,
  Clock3,
  Ban,
  Archive
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ScheduleStatus {
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

interface BulkActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSchedules: ScheduleStatus[];
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
      toast.success(`Updated ${selectedSchedules.length} schedules`);
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
                Bulk Actions ({selectedSchedules.length} schedules)
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
                Select Action
              </label>
              <div className="space-y-2">
                <label className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    name="actionType"
                    value="approve"
                    checked={actionType === 'approve'}
                    onChange={(e) => setActionType(e.target.value as any)}
                    className="text-blue-600"
                  />
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <div className="font-medium text-gray-900">Approve Schedules</div>
                    <div className="text-sm text-gray-600">Enable admin approval for student booking</div>
                  </div>
                </label>

                <label className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    name="actionType"
                    value="enable_booking"
                    checked={actionType === 'enable_booking'}
                    onChange={(e) => setActionType(e.target.value as any)}
                    className="text-blue-600"
                  />
                  <Zap className="w-5 h-5 text-blue-600" />
                  <div>
                    <div className="font-medium text-gray-900">Approve & Enable Booking</div>
                    <div className="text-sm text-gray-600">Approve and immediately enable booking</div>
                  </div>
                </label>

                <label className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    name="actionType"
                    value="set_deadline"
                    checked={actionType === 'set_deadline'}
                    onChange={(e) => setActionType(e.target.value as any)}
                    className="text-blue-600"
                  />
                  <Clock3 className="w-5 h-5 text-orange-600" />
                  <div>
                    <div className="font-medium text-gray-900">Set Booking Deadline</div>
                    <div className="text-sm text-gray-600">Set when booking closes for these schedules</div>
                  </div>
                </label>

                <label className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    name="actionType"
                    value="disable"
                    checked={actionType === 'disable'}
                    onChange={(e) => setActionType(e.target.value as any)}
                    className="text-blue-600"
                  />
                  <Ban className="w-5 h-5 text-red-600" />
                  <div>
                    <div className="font-medium text-gray-900">Disable Schedules</div>
                    <div className="text-sm text-gray-600">Disable admin approval and booking</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Booking Deadline Input */}
            {actionType === 'set_deadline' && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Booking Deadline
                </label>
                <input
                  type="datetime-local"
                  value={bookingDeadline}
                  onChange={(e) => setBookingDeadline(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Students won't be able to book after this time
                </p>
              </div>
            )}

            {/* Special Instructions */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Special Instructions (Optional)
              </label>
              <textarea
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                placeholder="Any special notes or instructions for these schedules..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
            </div>

            {/* Selected Schedules Preview */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Affected Schedules ({selectedSchedules.length})
              </h3>
              <div className="max-h-32 overflow-y-auto bg-gray-50 rounded-lg p-3">
                {selectedSchedules.slice(0, 5).map(schedule => (
                  <div key={schedule.id} className="text-sm text-gray-600 py-1">
                    {schedule.route.routeNumber} - {new Date(schedule.scheduleDate).toLocaleDateString()} at {schedule.departureTime}
                  </div>
                ))}
                {selectedSchedules.length > 5 && (
                  <div className="text-sm text-gray-500 py-1">
                    ... and {selectedSchedules.length - 5} more
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
              disabled={loading || (actionType === 'set_deadline' && !bookingDeadline)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>{loading ? 'Updating...' : 'Apply Changes'}</span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default function EnhancedSchedulesPage() {
  const [schedules, setSchedules] = useState<ScheduleStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSchedules, setSelectedSchedules] = useState<string[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all', // all, pending_approval, approved, disabled
    route: '',
    dateRange: '7days' // 7days, 30days, all
  });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadSchedules();
  }, [filters]);

  const loadSchedules = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status !== 'all') params.append('status', filters.status);
      if (filters.route) params.append('route', filters.route);
      if (filters.dateRange !== 'all') params.append('dateRange', filters.dateRange);

      const response = await fetch(`/api/admin/schedules/enhanced-list?${params}`);
      const data = await response.json();
      setSchedules(data);
    } catch (error) {
      console.error('Error loading schedules:', error);
      toast.error('Failed to load schedules');
    } finally {
      setLoading(false);
    }
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
    await loadSchedules();
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

  const getStatusBadge = (schedule: ScheduleStatus) => {
    if (!schedule.admin_scheduling_enabled) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Pending Approval
        </span>
      );
    }
    
    if (schedule.admin_scheduling_enabled && schedule.booking_enabled) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Active
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

  const filteredSchedules = schedules.filter(schedule => {
    const matchesSearch = 
      schedule.route.routeNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      schedule.route.routeName.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  const pendingApprovalCount = schedules.filter(s => !s.admin_scheduling_enabled).length;
  const activeCount = schedules.filter(s => s.admin_scheduling_enabled && s.booking_enabled).length;
  const approvedCount = schedules.filter(s => s.admin_scheduling_enabled && !s.booking_enabled).length;

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Enhanced Schedule Management</h1>
          <p className="text-gray-600">Approve, manage, and monitor all transport schedules</p>
        </div>
        <div className="flex items-center space-x-3 mt-4 lg:mt-0">
          <button
            onClick={loadSchedules}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending Approval</p>
              <p className="text-2xl font-bold text-yellow-600">{pendingApprovalCount}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-yellow-600" />
          </div>
          {pendingApprovalCount > 0 && (
            <p className="text-xs text-yellow-600 mt-2">⚠️ Requires attention</p>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Booking</p>
              <p className="text-2xl font-bold text-green-600">{activeCount}</p>
            </div>
            <Zap className="w-8 h-8 text-green-600" />
          </div>
          <p className="text-xs text-green-600 mt-2">✅ Students can book</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Approved Only</p>
              <p className="text-2xl font-bold text-blue-600">{approvedCount}</p>
            </div>
            <Shield className="w-8 h-8 text-blue-600" />
          </div>
          <p className="text-xs text-blue-600 mt-2">📋 Ready to enable</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Schedules</p>
              <p className="text-2xl font-bold text-gray-900">{schedules.length}</p>
            </div>
            <CalendarIcon className="w-8 h-8 text-gray-600" />
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center space-y-4 lg:space-y-0 lg:space-x-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search routes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="active">Active Booking</option>
            <option value="disabled">Disabled</option>
          </select>

          {/* Date Range Filter */}
          <select
            value={filters.dateRange}
            onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="7days">Next 7 Days</option>
            <option value="30days">Next 30 Days</option>
            <option value="all">All Dates</option>
          </select>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedSchedules.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-50 border border-blue-200 rounded-lg p-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-blue-900">
                {selectedSchedules.length} schedule{selectedSchedules.length !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={clearSelection}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Clear selection
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowBulkModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Target className="w-4 h-4" />
                <span>Bulk Actions</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Quick Actions for Pending Approval */}
      {pendingApprovalCount > 0 && selectedSchedules.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              <div>
                <h3 className="text-sm font-medium text-yellow-900">
                  {pendingApprovalCount} schedules need approval
                </h3>
                <p className="text-sm text-yellow-700">
                  Students cannot book these trips until approved by administration
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
                <span>Approve All</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedules Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Schedules ({filteredSchedules.length})
            </h2>
            <div className="flex items-center space-x-2">
              <button
                onClick={selectAllVisible}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Select all visible
              </button>
            </div>
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
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Route</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date & Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bookings</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredSchedules.map((schedule, index) => (
                <tr 
                  key={schedule.id}
                  className={`hover:bg-gray-50 ${selectedSchedules.includes(schedule.id) ? 'bg-blue-50' : ''}`}
                >
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedSchedules.includes(schedule.id)}
                      onChange={() => toggleScheduleSelection(schedule.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {schedule.route.routeNumber}
                      </div>
                      <div className="text-sm text-gray-600">
                        {schedule.route.startLocation} → {schedule.route.endLocation}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {new Date(schedule.scheduleDate).toLocaleDateString()}
                      </div>
                      <div className="text-sm text-gray-600">
                        {schedule.departureTime} - {schedule.arrivalTime}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center space-x-2">
                      <div className="text-sm font-medium text-gray-900">
                        {schedule.bookedSeats}/{schedule.totalSeats}
                      </div>
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full"
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
                          className="text-sm bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 transition-colors"
                        >
                          Approve
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
            <h3 className="text-lg font-medium text-gray-900 mb-2">No schedules found</h3>
            <p className="text-gray-600">
              {searchTerm ? 'Try adjusting your search or filters' : 'No schedules match the current filters'}
            </p>
          </div>
        )}
      </div>

      {/* Bulk Action Modal */}
      <BulkActionModal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        selectedSchedules={schedules.filter(s => selectedSchedules.includes(s.id))}
        onBulkUpdate={handleBulkUpdate}
      />
    </div>
  );
} 