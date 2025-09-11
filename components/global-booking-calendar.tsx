'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Bus,
  Users,
  Clock,
  MapPin,
  X,
  Plus,
  Edit,
  Filter,
  Download,
  Eye,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDateForDatabase } from '@/lib/date-utils';
import CreateScheduleModal from './create-schedule-modal';

interface Route {
  id: string;
  routeNumber?: string;
  route_number?: string;
  routeName?: string;
  route_name?: string;
  startLocation?: string;
  start_location?: string;
  endLocation?: string;
  end_location?: string;
  totalCapacity?: number;
  total_capacity?: number;
  status: string;
}

interface Schedule {
  id: string;
  routeId: string;
  route: Route;
  scheduleDate: string;
  departureTime: string;
  arrivalTime: string;
  totalSeats: number;
  bookedSeats: number;
  availableSeats: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  driver?: {
    id: string;
    name: string;
  };
  vehicle?: {
    id: string;
    number: string;
  };
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  schedules: Schedule[];
  totalBookings: number;
  totalCapacity: number;
  isPast: boolean;
}

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date | null;
  schedules: Schedule[];
  onCreateSchedule: () => void;
}

const ScheduleModal: React.FC<ScheduleModalProps> = ({ 
  isOpen, 
  onClose, 
  selectedDate, 
  schedules, 
  onCreateSchedule 
}) => {
  if (!isOpen || !selectedDate) return null;

  const exportSchedules = () => {
    const csvContent = [
      ['Route', 'Departure', 'Arrival', 'Booked', 'Available', 'Total', 'Status', 'Driver', 'Vehicle'].join(','),
      ...schedules.map(s => [
        `${s.route.routeNumber || s.route.route_number} - ${s.route.routeName || s.route.route_name}`,
        s.departureTime,
        s.arrivalTime,
        s.bookedSeats,
        s.availableSeats,
        s.totalSeats,
        s.status,
        s.driver?.name || 'TBD',
        s.vehicle?.number || 'TBD'
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedules-${formatDateForDatabase(selectedDate)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const isPastDate = selectedDate < new Date(new Date().toDateString());

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
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Schedules for {selectedDate.toLocaleDateString('en-US', { 
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </h2>
                <p className="text-sm text-gray-600">
                  {schedules.length} schedule{schedules.length !== 1 ? 's' : ''} • {' '}
                  {schedules.reduce((sum, s) => sum + s.bookedSeats, 0)} total bookings
                </p>
              </div>
              <div className="flex items-center space-x-2">
                {schedules.length === 0 && !isPastDate && (
                  <button
                    onClick={onCreateSchedule}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Schedules</span>
                  </button>
                )}
                {schedules.length > 0 && (
                  <button
                    onClick={exportSchedules}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export</span>
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
            {schedules.length === 0 ? (
              <div className="text-center py-12">
                <CalendarIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {isPastDate ? 'No Schedules Found' : 'No Schedules Yet'}
                </h3>
                <p className="text-gray-600 mb-4">
                  {isPastDate 
                    ? 'No schedules were found for this past date.'
                    : 'No schedules have been created for this date yet.'
                  }
                </p>
                {!isPastDate && (
                  <button
                    onClick={onCreateSchedule}
                    className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mx-auto"
                  >
                    <Plus className="w-5 h-5" />
                    <span>Create Schedules for This Date</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {schedules.map((schedule) => (
                  <motion.div
                    key={schedule.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gray-50 rounded-lg p-6 border border-gray-200 hover:border-gray-300 transition-colors"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Route Info */}
                      <div className="lg:col-span-1">
                        <div className="flex items-start space-x-3">
                          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-bold text-sm">{schedule.route.routeNumber || schedule.route.route_number}</span>
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">{schedule.route.routeName || schedule.route.route_name}</h4>
                            <div className="flex items-center text-sm text-gray-600 mt-1">
                              <MapPin className="w-4 h-4 mr-1" />
                              <span>{schedule.route.startLocation || schedule.route.start_location} → {schedule.route.endLocation || schedule.route.end_location}</span>
                            </div>
                            <div className="flex items-center space-x-2 mt-2">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(schedule.status)}`}>
                                {schedule.status.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Schedule Details */}
                      <div className="lg:col-span-1">
                        <div className="space-y-3">
                          <div className="flex items-center text-sm text-gray-600">
                            <Clock className="w-4 h-4 mr-2" />
                            <span>{schedule.departureTime} - {schedule.arrivalTime}</span>
                          </div>
                          <div className="flex items-center text-sm text-gray-600">
                            <Users className="w-4 h-4 mr-2" />
                            <span>{schedule.bookedSeats} / {schedule.totalSeats} booked</span>
                          </div>
                          <div className="flex items-center text-sm text-gray-600">
                            <Bus className="w-4 h-4 mr-2" />
                            <span>{schedule.availableSeats} seats available</span>
                          </div>
                        </div>

                        {/* Occupancy Bar */}
                        <div className="mt-4">
                          <div className="flex justify-between text-xs text-gray-600 mb-1">
                            <span>Occupancy</span>
                            <span>{Math.round((schedule.bookedSeats / schedule.totalSeats) * 100)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${(schedule.bookedSeats / schedule.totalSeats) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Assignment Details */}
                      <div className="lg:col-span-1">
                        <div className="space-y-3">
                          <div>
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Driver</span>
                            <p className="text-sm text-gray-900">{schedule.driver?.name || 'Not assigned'}</p>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Vehicle</span>
                            <p className="text-sm text-gray-900">{schedule.vehicle?.number || 'Not assigned'}</p>
                          </div>
                          <div className="flex space-x-2 mt-4">
                            <button className="flex items-center space-x-1 px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors">
                              <Eye className="w-3 h-3" />
                              <span>View</span>
                            </button>
                            <button className="flex items-center space-x-1 px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors">
                              <Edit className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

interface GlobalBookingCalendarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GlobalBookingCalendar({ isOpen, onClose }: GlobalBookingCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarData, setCalendarData] = useState<CalendarDay[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSchedules, setSelectedSchedules] = useState<Schedule[]>([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterRoute, setFilterRoute] = useState('all');
  const [routes, setRoutes] = useState<Route[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadRoutes();
      generateCalendarData();
    }
  }, [isOpen, currentDate, filterRoute]);

  const loadRoutes = async () => {
    try {
      const response = await fetch('/api/admin/routes');
      
      if (!response.ok) {
        throw new Error('Failed to fetch routes');
      }
      
      const result = await response.json();
      const routesData = result.success ? result.data || [] : [];
      
      // Ensure data is array and filter active routes
      const validRoutesData = Array.isArray(routesData) ? routesData : [];
      setRoutes(validRoutesData.filter((route: Route) => !route.status || route.status === 'active'));
    } catch (error) {
      console.error('Error loading routes:', error);
      setRoutes([]); // Set empty array as fallback
    }
  };

  const generateCalendarData = async () => {
    setLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startDate = new Date(firstDay);
      startDate.setDate(startDate.getDate() - firstDay.getDay());

      // Fetch all schedules for the month
      const startDateStr = formatDateForDatabase(firstDay);
      const endDateStr = formatDateForDatabase(lastDay);

      const response = await fetch('/api/admin/schedules/global-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: startDateStr,
          endDate: endDateStr,
          routeFilter: filterRoute
        })
      });

      const schedules = await response.json();
      const today = new Date();
      const days: CalendarDay[] = [];

      for (let i = 0; i < 42; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        
        const dateString = formatDateForDatabase(date);
        const daySchedules = schedules.filter((s: any) => s.scheduleDate === dateString);
        
        days.push({
          date,
          isCurrentMonth: date.getMonth() === month,
          isToday: date.toDateString() === today.toDateString(),
          isSelected: selectedDate?.toDateString() === date.toDateString(),
          schedules: daySchedules,
          totalBookings: daySchedules.reduce((sum: number, s: any) => sum + s.bookedSeats, 0),
          totalCapacity: daySchedules.reduce((sum: number, s: any) => sum + s.totalSeats, 0),
          isPast: date < new Date(today.toDateString())
        });
      }

      setCalendarData(days);
    } catch (error) {
      console.error('Error loading calendar data:', error);
      toast.error('Failed to load calendar data');
    } finally {
      setLoading(false);
    }
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setMonth(currentDate.getMonth() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
  };

  const handleDateClick = (day: CalendarDay) => {
    setSelectedDate(day.date);
    setSelectedSchedules(day.schedules);
    setShowScheduleModal(true);
  };

  const handleCreateSchedule = () => {
    setShowScheduleModal(false);
    setShowCreateModal(true);
  };

  const handleScheduleCreated = () => {
    generateCalendarData();
    setShowCreateModal(false);
  };

  const getDateIntensity = (day: CalendarDay) => {
    if (day.schedules.length === 0) {
      if (day.isPast) {
        return 'bg-gray-100 text-gray-400';
      } else {
        return 'bg-gray-50 hover:bg-blue-50 text-gray-700 border border-dashed border-gray-300 hover:border-blue-300';
      }
    }
    
    // Check if any schedule has booking disabled
    const hasDisabledBooking = day.schedules.some((schedule: any) => 
      schedule.bookingEnabled === false || schedule.adminSchedulingEnabled === false
    );
    
    if (hasDisabledBooking) {
      return 'bg-orange-100 border-orange-300 text-orange-800 border-dashed';
    }
    
    const occupancyRate = day.totalCapacity > 0 ? day.totalBookings / day.totalCapacity : 0;
    
    if (occupancyRate >= 0.8) return 'bg-red-100 border-red-300 text-red-800';
    if (occupancyRate >= 0.6) return 'bg-orange-100 border-orange-300 text-orange-800';
    if (occupancyRate >= 0.4) return 'bg-yellow-100 border-yellow-300 text-yellow-800';
    if (occupancyRate > 0) return 'bg-green-100 border-green-300 text-green-800';
    
    return 'bg-blue-50 border-blue-200 text-blue-800';
  };

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
            className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden"
          >
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Global Booking Calendar</h2>
                  <p className="text-sm text-gray-600">Click on any date to view schedules or create new ones</p>
                </div>
                <div className="flex items-center space-x-3">
                  <select
                    value={filterRoute}
                    onChange={(e) => setFilterRoute(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Routes</option>
                    {routes.map(route => (
                      <option key={route.id} value={route.id}>
                        {route.routeNumber || route.route_number} - {route.routeName || route.route_name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={onClose}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6">
              {/* Calendar Header */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-gray-900">
                  {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h3>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => navigateMonth('prev')}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5 text-gray-600" />
                  </button>
                  <button
                    onClick={() => navigateMonth('next')}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ChevronRight className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1 mb-4">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="p-3 text-center text-sm font-medium text-gray-600">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarData.map((day, index) => (
                  <button
                    key={`${day.date.getTime()}-${index}`}
                    onClick={() => handleDateClick(day)}
                    className={`
                      p-3 text-center text-sm rounded-lg transition-all duration-200 min-h-[80px] flex flex-col items-center justify-center border-2 cursor-pointer
                      ${day.isCurrentMonth ? 'opacity-100' : 'opacity-30'}
                      ${day.isToday ? 'ring-2 ring-blue-500' : ''}
                      ${day.isSelected ? 'ring-2 ring-blue-600' : ''}
                      ${getDateIntensity(day)}
                      ${day.schedules.length > 0 ? 'hover:scale-105' : ''}
                    `}
                  >
                    <div className="font-medium text-lg">{day.date.getDate()}</div>
                    {day.schedules.length > 0 ? (
                      <>
                        <div className="text-xs font-medium mt-1">
                          {day.schedules.length} trip{day.schedules.length !== 1 ? 's' : ''}
                        </div>
                        <div className="text-xs">
                          {day.totalBookings}/{day.totalCapacity}
                        </div>
                      </>
                    ) : (
                      !day.isPast && (
                        <div className="text-xs mt-1 text-gray-500">
                          Click to create
                        </div>
                      )
                    )}
                  </button>
                ))}
              </div>

              {/* Legend */}
              <div className="mt-6 flex items-center justify-center space-x-6 text-sm flex-wrap gap-2">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-gray-50 border border-dashed border-gray-300 rounded"></div>
                  <span className="text-gray-600">Available to create</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-orange-100 border border-dashed border-orange-300 rounded"></div>
                  <span className="text-gray-600">Booking disabled</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
                  <span className="text-gray-600">Low occupancy</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-yellow-100 border border-yellow-300 rounded"></div>
                  <span className="text-gray-600">Medium occupancy</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-orange-100 border border-orange-300 rounded"></div>
                  <span className="text-gray-600">High occupancy</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-red-100 border border-red-300 rounded"></div>
                  <span className="text-gray-600">Nearly full</span>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      <ScheduleModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        selectedDate={selectedDate}
        schedules={selectedSchedules}
        onCreateSchedule={handleCreateSchedule}
      />

      <CreateScheduleModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        selectedDate={selectedDate}
        onScheduleCreated={handleScheduleCreated}
      />
    </>
  );
} 