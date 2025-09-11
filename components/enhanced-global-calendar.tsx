'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronLeft, ChevronRight, X, Clock, Users, AlertCircle, Check, XCircle, Plus, CheckSquare, Square, Play, Pause } from 'lucide-react';
import CreateScheduleModal from './create-schedule-modal';
import toast from 'react-hot-toast';
import { canAdminEnableScheduleForDate, getSchedulingRestrictionMessage } from '@/lib/date-utils';

interface Schedule {
  id: string;
  route_id: string;
  route_name: string;
  departure_time: string;
  arrival_time: string;
  total_seats: number;
  available_seats: number;
  is_enabled: boolean;
  booking_enabled: boolean;
  booking_disabled_reason?: string;
  occupancy_percentage: number;
  booked_passengers: number;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  schedules: Schedule[];
  totalSchedules: number;
  enabledSchedules: number;
}

interface ScheduleDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date | null;
  schedules: Schedule[];
  onToggleSchedule: (scheduleId: string, currentStatus: boolean) => void;
  processingSchedule: string | null;
  onCreateSchedule: () => void;
  onRefreshData: () => Promise<void>;
}

const ScheduleDetailsModal: React.FC<ScheduleDetailsModalProps> = ({ 
  isOpen, 
  onClose, 
  selectedDate, 
  schedules, 
  onToggleSchedule,
  processingSchedule,
  onCreateSchedule,
  onRefreshData
}) => {
  const [selectedSchedules, setSelectedSchedules] = useState<string[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Reset selections when modal opens/closes or schedules change
  useEffect(() => {
    if (isOpen) {
      setSelectedSchedules([]);
    }
  }, [isOpen, schedules]);

  const handleScheduleSelection = (scheduleId: string) => {
    setSelectedSchedules(prev => 
      prev.includes(scheduleId) 
        ? prev.filter(id => id !== scheduleId)
        : [...prev, scheduleId]
    );
  };

  const handleSelectAll = () => {
    const allScheduleIds = schedules.map(s => s.id);
    setSelectedSchedules(allScheduleIds);
  };

  const handleDeselectAll = () => {
    setSelectedSchedules([]);
  };

  const handleBulkToggle = async (enable: boolean) => {
    if (selectedSchedules.length === 0) return;

    setBulkProcessing(true);
    
    try {
      let successCount = 0;
      let errorCount = 0;
      let totalBookingsCancelled = 0;

      // Process each schedule individually but suppress individual messages
      for (const scheduleId of selectedSchedules) {
        const schedule = schedules.find(s => s.id === scheduleId);
        if (schedule && schedule.is_enabled !== enable) {
          try {
            const action = schedule.is_enabled ? 'disable' : 'enable';
            const response = await fetch('/api/admin/schedules/toggle-status', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                scheduleId: scheduleId,
                action: action,
                reason: 'Bulk administrative action'
              }),
            });
            
            if (!response.ok) {
              throw new Error('Failed to update schedule status');
            }
            
            const result = await response.json();
            successCount++;
            
            if (result.affected_bookings && result.affected_bookings > 0) {
              totalBookingsCancelled += result.affected_bookings;
            }
          } catch (error) {
            console.error(`Failed to toggle schedule ${scheduleId}:`, error);
            errorCount++;
          }
        }
      }
      
      // Clear selections after bulk operation
      setSelectedSchedules([]);
      
      // Show consolidated success/error message
      if (successCount > 0 && errorCount === 0) {
        let message = `Successfully ${enable ? 'enabled' : 'disabled'} ${successCount} schedule${successCount !== 1 ? 's' : ''}`;
        if (totalBookingsCancelled > 0) {
          message += `. ${totalBookingsCancelled} booking${totalBookingsCancelled !== 1 ? 's were' : ' was'} cancelled and notifications sent.`;
        }
        toast.success(message);
      } else if (successCount > 0 && errorCount > 0) {
        let message = `${successCount} schedule${successCount !== 1 ? 's' : ''} ${enable ? 'enabled' : 'disabled'} successfully, ${errorCount} failed`;
        if (totalBookingsCancelled > 0) {
          message += `. ${totalBookingsCancelled} booking${totalBookingsCancelled !== 1 ? 's were' : ' was'} cancelled.`;
        }
        toast.error(message);
      } else if (errorCount > 0) {
        toast.error(`Failed to ${enable ? 'enable' : 'disable'} ${errorCount} schedule${errorCount !== 1 ? 's' : ''}`);
      }
      
      // Refresh calendar data to reflect changes
      await onRefreshData();
      
    } catch (error) {
      console.error('Bulk toggle error:', error);
      toast.error(`Failed to ${enable ? 'enable' : 'disable'} schedules: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setBulkProcessing(false);
    }
  };

  const allSelected = schedules.length > 0 && selectedSchedules.length === schedules.length;
  const someSelected = selectedSchedules.length > 0;
  const hasEnabledInSelection = selectedSchedules.some(id => {
    const schedule = schedules.find(s => s.id === id);
    return schedule?.is_enabled;
  });
  const hasDisabledInSelection = selectedSchedules.some(id => {
    const schedule = schedules.find(s => s.id === id);
    return !schedule?.is_enabled;
  });

  if (!isOpen || !selectedDate) return null;

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
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Schedule Management - {selectedDate.toLocaleDateString('en-GB')}
                </h2>
                <p className="text-sm text-gray-600">
                  {schedules.length} schedule{schedules.length !== 1 ? 's' : ''} • {' '}
                  {schedules.filter(s => s.is_enabled).length} enabled
                  {someSelected && ` • ${selectedSchedules.length} selected`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Bulk Actions Row */}
            {schedules.length > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={allSelected ? handleDeselectAll : handleSelectAll}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg border transition-colors ${
                      allSelected 
                        ? 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200' 
                        : 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    {allSelected ? (
                      <>
                        <CheckSquare className="w-4 h-4" />
                        <span>Deselect All</span>
                      </>
                    ) : (
                      <>
                        <Square className="w-4 h-4" />
                        <span>Select All</span>
                      </>
                    )}
                  </button>
                  
                  {someSelected && (
                    <span className="text-sm text-gray-600">
                      {selectedSchedules.length} selected
                    </span>
                  )}
                </div>
                
                {/* Bulk Action Buttons */}
                {someSelected && (
                  <div className="flex items-center space-x-2">
                    {hasDisabledInSelection && (
                      <button
                        onClick={() => handleBulkToggle(true)}
                        disabled={bulkProcessing}
                        className="flex items-center space-x-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        <Play className="w-4 h-4" />
                        <span>Enable Selected</span>
                      </button>
                    )}
                    
                    {hasEnabledInSelection && (
                      <button
                        onClick={() => handleBulkToggle(false)}
                        disabled={bulkProcessing}
                        className="flex items-center space-x-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        <Pause className="w-4 h-4" />
                        <span>Disable Selected</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
            {schedules.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Schedules</h3>
                <p className="text-gray-600 mb-6">No schedules found for this date.</p>
                <button
                  onClick={onCreateSchedule}
                  className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Create Schedules for This Date
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {schedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className={`p-6 border rounded-lg space-y-4 transition-all ${
                      selectedSchedules.includes(schedule.id)
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500 ring-opacity-20'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* Schedule Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => handleScheduleSelection(schedule.id)}
                          className={`flex items-center justify-center w-5 h-5 rounded border-2 transition-colors ${
                            selectedSchedules.includes(schedule.id)
                              ? 'bg-blue-600 border-blue-600 text-white' 
                              : 'border-gray-300 hover:border-blue-400'
                          }`}
                        >
                          {selectedSchedules.includes(schedule.id) && <Check className="w-3 h-3" />}
                        </button>
                        <div>
                          <h4 className="text-lg font-semibold text-gray-900">{schedule.route_name}</h4>
                          <div className="flex items-center space-x-2 text-sm text-gray-600 mt-1">
                            <Clock className="w-4 h-4" />
                            <span>{schedule.departure_time} - {schedule.arrival_time}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {schedule.is_enabled ? (
                          <div className="flex items-center space-x-1">
                            <Check className="w-5 h-5 text-green-500" />
                            <span className="text-sm font-medium text-green-700">Enabled</span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1">
                            <XCircle className="w-5 h-5 text-red-500" />
                            <span className="text-sm font-medium text-red-700">Disabled</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Schedule Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="text-sm text-gray-600">Capacity</div>
                        <div className="text-lg font-bold text-gray-900">{schedule.total_seats}</div>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="text-sm text-gray-600">Booked</div>
                        <div className="text-lg font-bold text-gray-900">{schedule.booked_passengers}</div>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="text-sm text-gray-600">Available</div>
                        <div className="text-lg font-bold text-gray-900">{schedule.available_seats}</div>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="text-sm text-gray-600">Occupancy</div>
                        <div className="text-lg font-bold text-gray-900">{schedule.occupancy_percentage}%</div>
                      </div>
                    </div>

                    {/* Occupancy Bar */}
                    <div>
                      <div className="flex justify-between text-sm text-gray-600 mb-2">
                        <span>Seat Occupancy</span>
                        <span>{schedule.booked_passengers} / {schedule.total_seats}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div 
                          className="bg-blue-600 h-3 rounded-full transition-all"
                          style={{ width: `${schedule.occupancy_percentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Toggle Button */}
                    <div className="pt-4 border-t border-gray-200">
                      <button
                        onClick={() => onToggleSchedule(schedule.id, schedule.is_enabled)}
                        disabled={processingSchedule === schedule.id}
                        className={`w-full px-6 py-3 text-sm font-medium rounded-lg transition-colors ${
                          schedule.is_enabled
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        } disabled:opacity-50`}
                      >
                        {processingSchedule === schedule.id
                          ? 'Processing...'
                          : schedule.is_enabled
                          ? 'Disable Schedule'
                          : 'Enable Schedule'
                        }
                      </button>
                      
                      {schedule.is_enabled && schedule.booked_passengers > 0 && (
                        <p className="text-sm text-red-600 mt-2 text-center">
                          ⚠️ Disabling will cancel {schedule.booked_passengers} booking(s)
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

interface EnhancedGlobalCalendarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function EnhancedGlobalCalendar({ isOpen, onClose }: EnhancedGlobalCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedSchedules, setSelectedSchedules] = useState<Schedule[]>([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingSchedule, setProcessingSchedule] = useState<string | null>(null);

  // Format date for API calls
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Fetch calendar data
  const fetchCalendarData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0);
      
      // Get first day of week (Sunday) and last day of week (Saturday) for the calendar grid
      const firstDayOfWeek = new Date(startDate);
      firstDayOfWeek.setDate(startDate.getDate() - startDate.getDay());
      
      const lastDayOfWeek = new Date(endDate);
      lastDayOfWeek.setDate(endDate.getDate() + (6 - endDate.getDay()));
      
      const response = await fetch(`/api/admin/schedules/global-calendar?startDate=${formatDate(firstDayOfWeek)}&endDate=${formatDate(lastDayOfWeek)}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch calendar data');
      }
      
      const data = await response.json();
      
      // Build calendar days
      const days: CalendarDay[] = [];
      const currentDateObj = new Date(firstDayOfWeek);
      
      // Group schedules by date
      const schedulesByDate: { [key: string]: Schedule[] } = {};
      
      // Transform API data to match our interface
      data.forEach((schedule: any) => {
        const dateStr = schedule.scheduleDate;
        if (!schedulesByDate[dateStr]) {
          schedulesByDate[dateStr] = [];
        }
        
        schedulesByDate[dateStr].push({
          id: schedule.id,
          route_id: schedule.routeId,
          route_name: schedule.route?.routeName || 'Unknown Route',
          departure_time: schedule.departureTime,
          arrival_time: schedule.arrivalTime,
          total_seats: schedule.totalSeats,
          available_seats: schedule.availableSeats,
          is_enabled: schedule.bookingEnabled !== false,
          booking_enabled: schedule.bookingEnabled,
          booking_disabled_reason: schedule.bookingEnabled ? undefined : 'Booking disabled',
          occupancy_percentage: Math.round((schedule.bookedSeats / schedule.totalSeats) * 100),
          booked_passengers: schedule.bookedSeats
        });
      });
      
      while (currentDateObj <= lastDayOfWeek) {
        const dateStr = formatDate(currentDateObj);
        const daySchedules = schedulesByDate[dateStr] || [];
        
        days.push({
          date: new Date(currentDateObj),
          isCurrentMonth: currentDateObj.getMonth() === month,
          isToday: currentDateObj.toDateString() === new Date().toDateString(),
          isSelected: selectedDate ? currentDateObj.toDateString() === selectedDate.toDateString() : false,
          schedules: daySchedules,
          totalSchedules: daySchedules.length,
          enabledSchedules: daySchedules.filter((s: Schedule) => s.is_enabled).length
        });
        
        currentDateObj.setDate(currentDateObj.getDate() + 1);
      }
      
      setCalendarDays(days);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch calendar data');
    } finally {
      setLoading(false);
    }
  }, [currentDate, selectedDate]);

  // Toggle schedule status
  const toggleScheduleStatus = async (scheduleId: string, currentStatus: boolean) => {
    setProcessingSchedule(scheduleId);
    
    try {
      const action = currentStatus ? 'disable' : 'enable';
      const response = await fetch('/api/admin/schedules/toggle-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduleId: scheduleId,
          action: action,
          reason: action === 'disable' ? 'Administrative decision' : 'Administrative decision'
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update schedule status');
      }
      
      const result = await response.json();
      
      // Update local state
      setSelectedSchedules(prev => 
        prev.map(schedule => 
          schedule.id === scheduleId 
            ? { ...schedule, is_enabled: !currentStatus }
            : schedule
        )
      );
      
      // Refresh calendar data
      await fetchCalendarData();
      
      // Show success message
      if (result.affected_bookings && result.affected_bookings > 0) {
        toast.success(`Schedule ${action}d successfully. ${result.affected_bookings} booking(s) were cancelled and notifications sent.`);
      } else {
        toast.success(`Schedule ${action}d successfully.`);
      }
    } catch (err) {
      toast.error(`Failed to update schedule: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setProcessingSchedule(null);
    }
  };

  // Handle date selection
  const handleDateClick = (day: CalendarDay) => {
    if (!day.isCurrentMonth) return;
    
    // Check if this date is valid for admin scheduling
    const dateValidation = canAdminEnableScheduleForDate(day.date);
    if (!dateValidation.canEnable && day.schedules.length === 0) {
      toast.error(dateValidation.reason || 'Cannot create schedules for this date');
      return;
    }
    
    if (isMultiSelectMode) {
      // Multi-select mode: toggle date selection
      const dateString = day.date.toDateString();
      const isAlreadySelected = selectedDates.some(d => d.toDateString() === dateString);
      
      if (isAlreadySelected) {
        setSelectedDates(prev => prev.filter(d => d.toDateString() !== dateString));
      } else {
        setSelectedDates(prev => [...prev, day.date]);
      }
    } else {
      // Single-select mode: show schedule modal for the date
    setSelectedDate(day.date);
    setSelectedSchedules(day.schedules);
    setShowScheduleModal(true);
    }
  };

  // Toggle multi-select mode
  const toggleMultiSelectMode = () => {
    setIsMultiSelectMode(prev => {
      const newMode = !prev;
      if (!newMode) {
        // Exiting multi-select mode, clear selections
        setSelectedDates([]);
      }
      return newMode;
    });
  };

  // Clear all selected dates
  const clearSelectedDates = () => {
    setSelectedDates([]);
  };

  // Create schedules for multiple dates
  const createMultiDaySchedules = () => {
    if (selectedDates.length === 0) {
      toast.error('Please select at least one date');
      return;
    }
    setShowCreateModal(true);
  };

  // Handle create schedule
  const handleCreateSchedule = () => {
    setShowScheduleModal(false);
    setShowCreateModal(true);
  };

  // Handle schedule created
  const handleScheduleCreated = () => {
    setShowCreateModal(false);
    fetchCalendarData(); // Refresh calendar data
  };

  // Navigation handlers
  const goToPreviousMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
  };

  // Initial load
  useEffect(() => {
    if (isOpen) {
      fetchCalendarData();
    }
  }, [isOpen, fetchCalendarData]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (!isOpen) return null;

  return (
    <>
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
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Enhanced Schedule Management</h2>
                  <p className="text-sm text-gray-600">Click on any date to manage schedule availability and booking controls</p>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={toggleMultiSelectMode}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      isMultiSelectMode 
                        ? 'text-white bg-purple-600 hover:bg-purple-700' 
                        : 'text-purple-700 bg-purple-50 hover:bg-purple-100'
                    }`}
                  >
                    {isMultiSelectMode ? (
                      <>
                        <CheckSquare className="w-4 h-4 inline mr-2" />
                        Multi-Select ON
                      </>
                    ) : (
                      <>
                        <Square className="w-4 h-4 inline mr-2" />
                        Multi-Select
                      </>
                    )}
                  </button>
                  
                  {isMultiSelectMode && selectedDates.length > 0 && (
                    <>
                      <span className="text-sm text-gray-600">
                        {selectedDates.length} day{selectedDates.length !== 1 ? 's' : ''} selected
                      </span>
                      <button
                        onClick={createMultiDaySchedules}
                        className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
                      >
                        <Plus className="w-4 h-4 inline mr-2" />
                        Create Schedules
                      </button>
                      <button
                        onClick={clearSelectedDates}
                        className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-md transition-colors"
                      >
                        Clear
                      </button>
                    </>
                  )}
                  
                  <button
                    onClick={goToToday}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                  >
                    Today
                  </button>
                  <button
                    onClick={fetchCalendarData}
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Loading...' : 'Refresh'}
                  </button>
                  <button
                    onClick={onClose}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Calendar Content */}
            <div className="p-6">
              {/* Calendar Header */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-gray-900">
                  {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </h3>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={goToPreviousMonth}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5 text-gray-600" />
                  </button>
                  <button
                    onClick={goToNextMonth}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ChevronRight className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-1 mb-4">
                {dayNames.map(day => (
                  <div key={day} className="p-3 text-center text-sm font-medium text-gray-700">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1 mb-6">
                {calendarDays.map((day, index) => {
                  const dateValidation = canAdminEnableScheduleForDate(day.date);
                  const isRestrictedDate = !dateValidation.canEnable;
                  const hasExistingSchedules = day.totalSchedules > 0;
                  const canInteract = day.isCurrentMonth && (hasExistingSchedules || !isRestrictedDate);
                  const isMultiSelected = isMultiSelectMode && selectedDates.some(d => d.toDateString() === day.date.toDateString());
                  
                  return (
                    <button
                      key={index}
                      onClick={() => handleDateClick(day)}
                      className={`
                        p-3 min-h-[80px] text-left border rounded-lg transition-all duration-200 relative
                        ${!day.isCurrentMonth ? 'bg-gray-50 opacity-50 border-gray-200' : 
                          isRestrictedDate && !hasExistingSchedules ? 'bg-red-50 border-red-200 cursor-not-allowed' :
                          hasExistingSchedules ? 'bg-white hover:bg-gray-50 border-gray-200 cursor-pointer' :
                          'bg-white hover:bg-blue-50 border-gray-200 cursor-pointer'}
                        ${day.isSelected && !isMultiSelectMode ? 'ring-2 ring-blue-500 bg-blue-50' : ''}
                        ${isMultiSelected ? 'ring-2 ring-purple-500 bg-purple-50 border-purple-300' : ''}
                        ${day.isToday ? 'border-blue-300' : ''}
                      `}
                      disabled={!canInteract}
                      title={isRestrictedDate && !hasExistingSchedules ? getSchedulingRestrictionMessage(day.date) || '' : ''}
                    >
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${
                          day.isToday ? 'text-blue-600' : 
                          day.isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
                        }`}>
                          {day.date.getDate()}
                        </span>
                          
                          {/* Multi-select checkbox indicator */}
                          {isMultiSelectMode && canInteract && (
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                              isMultiSelected 
                                ? 'bg-purple-600 border-purple-600' 
                                : 'border-gray-300 hover:border-purple-400'
                            }`}>
                              {isMultiSelected && (
                                <Check className="w-3 h-3 text-white" />
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Date restriction indicator */}
                        {isRestrictedDate && !hasExistingSchedules && day.isCurrentMonth && (
                          <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                            <span className="text-xs text-red-600">Restricted</span>
                          </div>
                        )}
                        
                        {day.totalSchedules > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center space-x-1">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              <span className="text-xs text-gray-600">
                                {day.totalSchedules} schedule{day.totalSchedules !== 1 ? 's' : ''}
                              </span>
                            </div>
                            
                            {/* Completed schedules indicator */}
                            {day.schedules.some((s: any) => s.status === 'completed') && (
                              <div className="flex items-center space-x-1">
                                <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
                                <span className="text-xs text-purple-600">
                                  {day.schedules.filter((s: any) => s.status === 'completed').length} completed
                                </span>
                              </div>
                            )}
                            
                            <div className="flex items-center space-x-1">
                              <div className={`w-2 h-2 rounded-full ${
                                day.enabledSchedules === day.totalSchedules ? 'bg-green-500' :
                                day.enabledSchedules > 0 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}></div>
                              <span className="text-xs text-gray-600">
                                {day.enabledSchedules} enabled
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-600 py-4 border-t border-gray-200">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <span>Has Schedules</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-purple-600 rounded-full"></div>
                  <span>Completed Trips</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span>All Enabled</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <span>Partial Enabled</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span>All Disabled</span>
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <p className="text-red-700">{error}</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* Schedule Details Modal */}
      <ScheduleDetailsModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        selectedDate={selectedDate}
        schedules={selectedSchedules}
        onToggleSchedule={toggleScheduleStatus}
        processingSchedule={processingSchedule}
        onCreateSchedule={handleCreateSchedule}
        onRefreshData={fetchCalendarData}
      />

      {/* Create Schedule Modal */}
      <CreateScheduleModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        selectedDate={selectedDate}
        selectedDates={isMultiSelectMode ? selectedDates : undefined}
        onScheduleCreated={handleScheduleCreated}
      />
    </>
  );
} 