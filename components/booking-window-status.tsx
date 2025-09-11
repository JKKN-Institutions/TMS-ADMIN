import React from 'react';
import { Clock, AlertCircle, CheckCircle, Calendar } from 'lucide-react';
import SchedulingConfigManager from '../lib/scheduling-config';

interface BookingWindowStatusProps {
  tripDate: Date;
  className?: string;
}

const BookingWindowStatus: React.FC<BookingWindowStatusProps> = ({ tripDate, className = '' }) => {
  const settings = SchedulingConfigManager.getSettings();
  
  if (!settings.enableBookingTimeWindow) {
    return (
      <div className={`bg-green-50 border border-green-200 rounded-lg p-3 ${className}`}>
        <div className="flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <span className="text-sm text-green-800">Booking is currently available</span>
        </div>
      </div>
    );
  }

  const currentTime = new Date();
  const bookingCheck = SchedulingConfigManager.isWithinBookingTimeWindow(tripDate, tripDate, currentTime);
  const nextWindow = SchedulingConfigManager.getNextBookingWindow(tripDate);

  if (bookingCheck.allowed) {
    const endTime = new Date();
    endTime.setHours(settings.bookingWindowEndHour, 0, 0, 0);
    const remainingHours = Math.ceil((endTime.getTime() - currentTime.getTime()) / (1000 * 60 * 60));
    
    return (
      <div className={`bg-green-50 border border-green-200 rounded-lg p-3 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-800">Booking Window Open</span>
          </div>
          <span className="text-xs text-green-600">
            {remainingHours > 0 && `${remainingHours}h remaining`}
          </span>
        </div>
        <p className="text-xs text-green-700 mt-1">
          Bookings are accepted until {SchedulingConfigManager.formatHour(settings.bookingWindowEndHour)} today
        </p>
      </div>
    );
  }

  if (!nextWindow) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-3 ${className}`}>
        <div className="flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <span className="text-sm text-red-800">Booking window not configured</span>
        </div>
      </div>
    );
  }

  const isBookingDay = currentTime.toDateString() === nextWindow.date.toDateString();
  const bookingWindowPassed = isBookingDay && currentTime.getHours() >= settings.bookingWindowEndHour;

  return (
    <div className={`bg-amber-50 border border-amber-200 rounded-lg p-3 ${className}`}>
      <div className="flex items-start space-x-2">
        <Clock className="w-4 h-4 text-amber-600 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-amber-800">
              {bookingWindowPassed ? 'Booking Window Closed' : 'Booking Window Closed'}
            </span>
            <span className="text-xs text-amber-600">
              {isBookingDay ? 'Today' : nextWindow.date.toLocaleDateString()}
            </span>
          </div>
          <p className="text-xs text-amber-700 mt-1">
            {bookingWindowPassed ? (
              'Booking window for this trip has ended'
            ) : (
              <>
                Next booking window: <strong>{nextWindow.date.toLocaleDateString()}</strong> from{' '}
                <strong>{nextWindow.startTime}</strong> to <strong>{nextWindow.endTime}</strong>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

export default BookingWindowStatus; 