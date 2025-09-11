'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  Info,
  Save,
  Settings,
  Users,
  Bus
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ScheduleBookingControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: {
    id: string;
    route_id: string;
    route_name: string;
    schedule_date: string;
    departure_time: string;
    arrival_time: string;
    available_seats: number;
    booked_seats: number;
    total_seats: number;
    admin_scheduling_enabled: boolean;
    booking_enabled: boolean;
    booking_deadline: string;
    scheduling_instructions?: string;
  };
  onUpdate: (scheduleId: string, updates: any) => void;
}

const ScheduleBookingControlModal: React.FC<ScheduleBookingControlModalProps> = ({
  isOpen,
  onClose,
  schedule,
  onUpdate
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    admin_scheduling_enabled: schedule.admin_scheduling_enabled || false,
    booking_enabled: schedule.booking_enabled || false,
    scheduling_instructions: schedule.scheduling_instructions || '',
    booking_end_time: '19:00'
  });

  useEffect(() => {
    if (isOpen) {
      setFormData({
        admin_scheduling_enabled: schedule.admin_scheduling_enabled || false,
        booking_enabled: schedule.booking_enabled || false,
        scheduling_instructions: schedule.scheduling_instructions || '',
        booking_end_time: '19:00'
      });
    }
  }, [isOpen, schedule]);

  // Check if schedule date is in the past or today
  const today = new Date();
  const todayStr = today.getFullYear() + '-' + 
                  String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                  String(today.getDate()).padStart(2, '0');
  const isPastOrToday = schedule.schedule_date <= todayStr;
  
  // Check if booking deadline has passed
  const bookingDeadline = new Date(getBookingDeadline());
  const isBookingDeadlinePassed = bookingDeadline <= today;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent enabling for past dates or today
    if (formData.admin_scheduling_enabled && isPastOrToday) {
      toast.error('Cannot enable booking controls for past dates or today. Only future dates are allowed.');
      return;
    }

    // Prevent enabling if booking deadline has passed
    if (formData.admin_scheduling_enabled && isBookingDeadlinePassed) {
      toast.error('Booking deadline has already passed. Cannot enable booking for this schedule.');
      return;
    }

    setIsLoading(true);

    try {
      const updates = {
        admin_scheduling_enabled: formData.admin_scheduling_enabled,
        booking_enabled: formData.booking_enabled && formData.admin_scheduling_enabled,
        scheduling_instructions: formData.scheduling_instructions,
        booking_deadline: getBookingDeadline(),
        updated_at: new Date().toISOString()
      };

      await onUpdate(schedule.id, updates);
      toast.success('Schedule booking controls updated successfully!');
      onClose();
    } catch (error) {
      console.error('Error updating schedule:', error);
      toast.error('Failed to update schedule booking controls');
    } finally {
      setIsLoading(false);
    }
  };

  const getBookingDeadline = () => {
    const scheduleDate = new Date(schedule.schedule_date);
    const previousDay = new Date(scheduleDate);
    previousDay.setDate(scheduleDate.getDate() - 1);
    return `${previousDay.toISOString().split('T')[0]} ${formData.booking_end_time}:00`;
  };

  const getBookingWindow = () => {
    const scheduleDate = new Date(schedule.schedule_date);
    const previousDay = new Date(scheduleDate);
    previousDay.setDate(scheduleDate.getDate() - 1);
    
    const startTime = `${previousDay.toDateString()} 06:00`;
    const endTime = `${previousDay.toDateString()} ${formData.booking_end_time}`;
    
    return { startTime, endTime, bookingDate: previousDay.toDateString() };
  };

  const isCurrentlyBookingActive = () => {
    const now = new Date();
    const bookingDeadline = new Date(getBookingDeadline());
    return now <= bookingDeadline;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (timeString: string) => {
    return new Date(`1970-01-01T${timeString}`).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        >
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">
                  Schedule Booking Controls
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Manage booking availability and scheduling for this trip
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Past Date Warning */}
            {isPastOrToday && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                  <div className="text-sm text-red-800">
                    <p className="font-medium mb-1">Past Date Schedule</p>
                    <p>This schedule is for {isPastOrToday ? 'a past date or today' : 'a past date'}. Booking controls cannot be enabled for past dates as passengers must book at least one day in advance.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Booking Deadline Warning */}
            {!isPastOrToday && isBookingDeadlinePassed && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5" />
                  <div className="text-sm text-orange-800">
                    <p className="font-medium mb-1">Booking Deadline Passed</p>
                    <p>The booking deadline for this schedule has already passed. Booking controls cannot be enabled as students can no longer book this trip.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Schedule Info */}
            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-2 mb-3">
                <Bus className="w-5 h-5 text-blue-600" />
                <h4 className="font-medium text-blue-900">Schedule Details</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-blue-700">Route:</span>
                  <span className="ml-2 font-medium text-blue-900">{schedule.route_name}</span>
                </div>
                <div>
                  <span className="text-blue-700">Date:</span>
                  <span className="ml-2 font-medium text-blue-900">{formatDate(schedule.schedule_date)}</span>
                </div>
                <div>
                  <span className="text-blue-700">Time:</span>
                  <span className="ml-2 font-medium text-blue-900">
                    {formatTime(schedule.departure_time)} - {formatTime(schedule.arrival_time)}
                  </span>
                </div>
                <div>
                  <span className="text-blue-700">Seats:</span>
                  <span className="ml-2 font-medium text-blue-900">
                    {schedule.booked_seats || 0}/{schedule.total_seats || schedule.available_seats}
                  </span>
                </div>
              </div>
            </div>

            {/* Booking Window Info */}
            <div className="bg-yellow-50 rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-2 mb-3">
                <Clock className="w-5 h-5 text-yellow-600" />
                <h4 className="font-medium text-yellow-900">Booking Deadline</h4>
              </div>
              <div className="text-sm text-yellow-800">
                <p className="mb-2">
                  <strong>Booking Allowed:</strong> Anytime once enabled by admin
                </p>
                <p className="mb-2">
                  <strong>Booking Deadline:</strong> {formatTime(formData.booking_end_time)} on {getBookingWindow().bookingDate}
                </p>
                <p className="flex items-center space-x-2">
                  <span><strong>Status:</strong></span>
                  {isCurrentlyBookingActive() ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Active (can book now)
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Deadline passed
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Admin Scheduling Control */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <Settings className="w-5 h-5 text-gray-600" />
                  <h4 className="font-medium text-gray-900">Admin Scheduling Control</h4>
                </div>
                
                <div className="space-y-4">
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={formData.admin_scheduling_enabled}
                      onChange={(e) => setFormData({
                        ...formData,
                        admin_scheduling_enabled: e.target.checked,
                        booking_enabled: e.target.checked ? formData.booking_enabled : false
                      })}
                      disabled={isPastOrToday || isBookingDeadlinePassed}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 disabled:opacity-50"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        Enable scheduling for this trip
                      </span>
                      <p className="text-xs text-gray-600">
                        {isPastOrToday || isBookingDeadlinePassed 
                          ? 'Cannot enable for past dates or expired deadlines'
                          : 'Allow students to book this trip during the booking window'
                        }
                      </p>
                    </div>
                  </label>

                  {formData.admin_scheduling_enabled && (
                    <label className="flex items-center space-x-3 ml-7">
                      <input
                        type="checkbox"
                        checked={formData.booking_enabled}
                        onChange={(e) => setFormData({
                          ...formData,
                          booking_enabled: e.target.checked
                        })}
                        disabled={isPastOrToday || isBookingDeadlinePassed}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 disabled:opacity-50"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900">
                          Enable booking immediately
                        </span>
                        <p className="text-xs text-gray-600">
                          Allow booking even if outside the normal booking window
                        </p>
                      </div>
                    </label>
                  )}
                </div>
              </div>

              {/* Booking Time Settings */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <Clock className="w-5 h-5 text-gray-600" />
                  <h4 className="font-medium text-gray-900">Booking Cutoff Time</h4>
                </div>
                
                <div className="max-w-md">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Booking Deadline (Default: 7 PM)
                    </label>
                    <input
                      type="time"
                      value={formData.booking_end_time}
                      onChange={(e) => setFormData({
                        ...formData,
                        booking_end_time: e.target.value
                      })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Students can book anytime until this time on the day before the trip
                    </p>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Special Instructions (Optional)
                </label>
                <textarea
                  value={formData.scheduling_instructions}
                  onChange={(e) => setFormData({
                    ...formData,
                    scheduling_instructions: e.target.value
                  })}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Add any special instructions for this trip..."
                />
              </div>

              {/* Info Banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Important Notes:</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>Students can book anytime once admin enables the schedule</li>
                      <li>Booking deadline is by default 7 PM the day before the trip (configurable above)</li>
                      <li>Admin approval is required to enable scheduling for each trip</li>
                      <li>Once enabled, students will receive notifications about booking availability</li>
                      <li>Booking controls cannot be enabled for past dates or today</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ScheduleBookingControlModal; 